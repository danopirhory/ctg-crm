"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { findDuplicatesByEmail, type DuplicateHit } from "@/lib/db/dedupe";
import {
  getCurrentEmployee,
  getCurrentEmployeeId,
  getProspectList,
} from "@/lib/db/queries";
import {
  PROSPECT_LIST_KINDS,
  LEAD_LIST_ASSIGNEES,
  MILITARY_BRANCHES,
  CLEARANCE_LEVELS,
  CANDIDATE_STATUSES,
  COMPANY_STATUSES,
} from "@/lib/db/constants";
import type { LeadListAssignee, ProspectListKind } from "@/lib/db/constants";
import type { CandidateStatus, CompanyStatus } from "@/lib/db/types";
import {
  syncProspectToLinkedCandidate,
  syncProspectToLinkedCompany,
} from "@/lib/db/prospect-sync";

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string; duplicates?: DuplicateHit[] };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

// =====================================================================
// Parsing pasted CSV/TSV into prospect rows (kind-aware)
// =====================================================================

export type ParsedProspect = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  company_name: string | null;
  industry: string | null;
  location: string | null;
  hiring_needs: string | null;
};

// Positional column order per kind. Headers (when detected) override this.
//   Candidate: First, Last, Email, Phone, Title, Company, Location
//   Company:   Company, Industry, Contact First, Contact Last, Email, Phone, Location, Hiring Needs
const POSITIONAL_CANDIDATE = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "title",
  "company_name",
  "location",
] as const;
const POSITIONAL_COMPANY = [
  "company_name",
  "industry",
  "first_name",
  "last_name",
  "email",
  "phone",
  "location",
  "hiring_needs",
] as const;

function parsePastedList(
  raw: string,
  kind: ProspectListKind,
): ParsedProspect[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines[0].includes("\t") ? "\t" : ",";

  // Detect + strip a header row.
  const looksLikeHeader =
    /\b(first|last|name|email|phone|company|title|location|industry|needs)\b/i.test(
      lines[0],
    );
  const data = looksLikeHeader ? lines.slice(1) : lines;

  const positions =
    kind === "Company" ? POSITIONAL_COMPANY : POSITIONAL_CANDIDATE;

  const out: ParsedProspect[] = [];
  for (const line of data) {
    const cols = line.split(delim).map((c) => c.trim());

    const row: ParsedProspect = {
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      title: null,
      company_name: null,
      industry: null,
      location: null,
      hiring_needs: null,
    };
    for (let i = 0; i < Math.min(positions.length, cols.length); i++) {
      const field = positions[i];
      const val = cols[i];
      if (!val) continue;
      // `field` is one of ParsedProspect's keys; safe to assign.
      (row as Record<string, string | null>)[field] = val.slice(0, 500);
    }

    // Per-kind required-field gate: skip rows missing the essential key.
    if (kind === "Candidate") {
      if (!row.first_name && !row.last_name) continue;
    } else {
      if (!row.company_name) continue;
    }
    out.push(row);
  }
  return out;
}

// =====================================================================
// Create list (+ initial prospects)
// =====================================================================

const createSchema = z.object({
  name: z.string().trim().min(1, "List name is required.").max(200),
  description: z.string().trim().max(2000).optional().default(""),
  source: z.string().trim().max(200).optional().default(""),
  kind: z.enum(PROSPECT_LIST_KINDS),
  // Optional: nest the new list under an existing top-level list.
  parent_list_id: z.string().uuid().optional().nullable(),
  consent_confirmed: z.literal(true, {
    errorMap: () => ({
      message:
        "Confirm you have lawful basis to contact these prospects before saving.",
    }),
  }),
  pasted: z.string().min(1, "Paste at least one row of prospects.").max(500_000),
});

export type CreateListInput = z.infer<typeof createSchema>;

export async function createProspectList(
  input: CreateListInput,
): Promise<ActionResult<{ id: string; inserted: number }>> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const prospects = parsePastedList(parsed.data.pasted, parsed.data.kind);
  if (prospects.length === 0) {
    const example =
      parsed.data.kind === "Company"
        ? "Format: Company, Industry, Contact First, Contact Last, Email (one per line)."
        : "Format: First, Last, Email (one per line).";
    return { ok: false, error: `No usable rows. ${example}` };
  }

  const supabase = await createClient();

  // Validate the parent (if nesting): it must exist, share the child's
  // kind, and itself be top-level - sub-lists are only one level deep.
  let parentListId: string | null = null;
  if (parsed.data.parent_list_id) {
    const { data: parent, error: parentErr } = await supabase
      .from("prospect_lists")
      .select("id, kind, parent_list_id")
      .eq("id", parsed.data.parent_list_id)
      .maybeSingle();
    if (parentErr) return { ok: false, error: parentErr.message };
    if (!parent) return { ok: false, error: "Parent list not found." };
    if (parent.kind !== parsed.data.kind) {
      return {
        ok: false,
        error: `A ${parsed.data.kind} sub-list can only nest under a ${parsed.data.kind} list.`,
      };
    }
    if (parent.parent_list_id) {
      return {
        ok: false,
        error: "Sub-lists can't have their own sub-lists (one level deep).",
      };
    }
    parentListId = parent.id;
  }

  const { data: list, error: listErr } = await supabase
    .from("prospect_lists")
    .insert({
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      source: parsed.data.source?.trim() || null,
      kind: parsed.data.kind,
      parent_list_id: parentListId,
      consent_confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (listErr) return { ok: false, error: listErr.message };

  const rows = prospects.map((p) => ({
    list_id: list.id,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    phone: p.phone,
    title: p.title,
    company_name: p.company_name,
    industry: p.industry,
    location: p.location,
    hiring_needs: p.hiring_needs,
  }));

  const { error: insertErr } = await supabase.from("prospects").insert(rows);
  if (insertErr) {
    await supabase.from("prospect_lists").delete().eq("id", list.id);
    return { ok: false, error: insertErr.message };
  }

  revalidatePath("/prospects");
  return { ok: true, id: list.id, inserted: rows.length };
}

// =====================================================================
// Delete list (Admin only - RLS enforces this anyway)
// =====================================================================

export async function deleteProspectList(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing list id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { error } = await supabase
    .from("prospect_lists")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/prospects");
  return { ok: true };
}

// Delete a single lead row from its lead list. RLS already restricts
// DELETE on prospects to Admin. We pre-null the prospect_id on any
// shared notes (rows that also reference a candidate) so the cascade on
// candidate_notes.prospect_id doesn't wipe the candidate-side timeline.
export async function deleteProspect(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing lead id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();

  // Look up list_id for revalidatePath after the delete.
  const { data: existing, error: lookupErr } = await supabase
    .from("prospects")
    .select("list_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: "Lead not found." };

  // Detach shared notes (those tied to both this lead and a candidate)
  // so the prospect_id ON DELETE CASCADE doesn't take them with it.
  await supabase
    .from("candidate_notes")
    .update({ prospect_id: null })
    .eq("prospect_id", id)
    .not("candidate_id", "is", null);

  const { error } = await supabase.from("prospects").delete().eq("id", id);
  if (error) {
    if (/row.level.security|permission|policy/i.test(error.message)) {
      return { ok: false, error: "Only an Admin can delete a lead." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/prospects/${existing.list_id}`);
  revalidatePath("/prospects");
  return { ok: true };
}

// =====================================================================
// Bulk-add prospects to an existing list (paste/Excel)
// =====================================================================

const bulkAddSchema = z.object({
  pasted: z.string().min(1, "Paste at least one row.").max(500_000),
});

export async function addProspectsToList(
  listId: string,
  pasted: string,
): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  if (!listId) return { ok: false, error: "Missing list id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const parsed = bulkAddSchema.safeParse({ pasted });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  // Look up the list's kind so we parse with the right column layout.
  const { data: list, error: listErr } = await getProspectList(listId);
  if (listErr) return { ok: false, error: listErr };
  if (!list) return { ok: false, error: "List not found." };

  const prospects = parsePastedList(parsed.data.pasted, list.kind);
  if (prospects.length === 0) {
    const example =
      list.kind === "Company"
        ? "Format: Company, Industry, Contact First, Contact Last, Email."
        : "Format: First, Last, Email.";
    return { ok: false, error: `No usable rows. ${example}` };
  }

  const supabase = await createClient();
  const rows = prospects.map((p) => ({
    list_id: listId,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    phone: p.phone,
    title: p.title,
    company_name: p.company_name,
    industry: p.industry,
    location: p.location,
    hiring_needs: p.hiring_needs,
  }));

  const { error } = await supabase.from("prospects").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/prospects/${listId}`);
  revalidatePath("/prospects");
  return { ok: true, inserted: rows.length };
}

// =====================================================================
// Manual single-prospect add to an existing list
// =====================================================================

const addProspectSchema = z.object({
  first_name: z.string().trim().max(120),
  last_name: z.string().trim().max(120),
  email: z.union([z.string().trim().email("Invalid email"), z.literal("")]),
  phone: z.string().trim().max(100),
  title: z.string().trim().max(200),
  company_name: z.string().trim().max(200),
  industry: z.string().trim().max(200),
  location: z.string().trim().max(200),
  hiring_needs: z.string().trim().max(2000),
  notes: z.string().trim().max(2000),
  resume_url: z.string().trim().max(1000).optional().default(""),
  marketing_consent: z.boolean(),
});

export type AddProspectInput = z.infer<typeof addProspectSchema>;

export async function addProspectToList(
  listId: string,
  input: AddProspectInput,
  opts?: { allowDuplicate?: boolean },
): Promise<ActionResult> {
  if (!listId) return { ok: false, error: "Missing list id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const parsed = addProspectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const v = parsed.data;

  // Enforce per-kind required fields server-side based on the list type.
  const { data: list, error: listErr } = await getProspectList(listId);
  if (listErr) return { ok: false, error: listErr };
  if (!list) return { ok: false, error: "List not found." };

  if (list.kind === "Candidate") {
    if (!v.first_name && !v.last_name) {
      return { ok: false, error: "First and last name are required." };
    }
  } else {
    if (!v.company_name) {
      return { ok: false, error: "Company name is required." };
    }
  }

  // Soft duplicate gate (same flow as createCandidate): warn once, let
  // the dialog resubmit with allowDuplicate to override.
  if (!opts?.allowDuplicate && v.email?.trim()) {
    const duplicates = await findDuplicatesByEmail(v.email);
    if (duplicates.length > 0) {
      return {
        ok: false,
        error: "A record with this email already exists.",
        duplicates,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("prospects").insert({
    list_id: listId,
    first_name: v.first_name || null,
    last_name: v.last_name || null,
    email: v.email || null,
    phone: v.phone || null,
    title: v.title || null,
    company_name: v.company_name || null,
    industry: v.industry || null,
    location: v.location || null,
    hiring_needs: v.hiring_needs || null,
    notes: v.notes || null,
    resume_url: v.resume_url || null,
    marketing_consent: v.marketing_consent,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/prospects/${listId}`);
  revalidatePath("/prospects");
  return { ok: true };
}

// =====================================================================
// Bulk actions - multi-select on the lead list table.
// =====================================================================

const bulkIdsSchema = z.array(z.string().uuid()).min(1).max(200);

export async function bulkDeleteProspects(
  ids: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("prospects")
    .delete({ count: "exact" })
    .in("id", parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/prospects");
  return { ok: true, deleted: count ?? parsed.data.length };
}

export async function bulkMoveProspects(
  ids: string[],
  targetListId: string,
): Promise<ActionResult<{ moved: number }>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  if (!targetListId) return { ok: false, error: "Pick a destination list." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { data: target, error: targetErr } = await supabase
    .from("prospect_lists")
    .select("id, kind")
    .eq("id", targetListId)
    .maybeSingle();
  if (targetErr) return { ok: false, error: targetErr.message };
  if (!target) return { ok: false, error: "Destination list not found." };

  const { error, count } = await supabase
    .from("prospects")
    .update({ list_id: targetListId }, { count: "exact" })
    .in("id", parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/prospects");
  revalidatePath(`/prospects/${targetListId}`);
  return { ok: true, moved: count ?? parsed.data.length };
}

// =====================================================================
// Edit a single prospect - kind-aware, always allowed (does not
// propagate to a linked candidate/company; conversion was a snapshot).
// =====================================================================

// The Update schema is a superset of Add - adds the candidate-facing
// fields (military, clearance, tags, etc.) so the Edit dialog can carry
// the full data sheet through.
const updateProspectSchema = addProspectSchema.extend({
  military_branch: z.union([z.enum(MILITARY_BRANCHES), z.literal("")]),
  rank: z.string().trim().max(200),
  mos_or_specialty: z.string().trim().max(500),
  clearance: z.union([z.enum(CLEARANCE_LEVELS), z.literal("")]),
  years_of_service: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d+(\.\d)?$/.test(v) && Number(v) <= 60),
      "Years of service must be a number between 0 and 60.",
    ),
  tags: z.string().trim().max(2000),
  source: z.string().trim().max(200),
  resume_url: z.string().trim().max(1000),
  linkedin: z.string().trim().max(1000),
});

export type UpdateProspectInput = z.infer<typeof updateProspectSchema>;

export async function updateProspect(
  id: string,
  input: UpdateProspectInput,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing prospect id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const parsed = updateProspectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { data: existing, error: lookupErr } = await supabase
    .from("prospects")
    .select(
      "list_id, converted_to_candidate_id, converted_to_company_id, list:prospect_lists(kind)",
    )
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: "Prospect not found." };

  const listKind = (
    Array.isArray(existing.list)
      ? existing.list[0]?.kind
      : (existing.list as { kind?: string })?.kind
  ) as ProspectListKind | undefined;

  if (listKind === "Candidate") {
    if (!v.first_name && !v.last_name) {
      return { ok: false, error: "First and last name are required." };
    }
  } else if (listKind === "Company") {
    if (!v.company_name) {
      return { ok: false, error: "Company name is required." };
    }
  }

  const tagsArray = v.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const prospectFields = {
    first_name: v.first_name || null,
    last_name: v.last_name || null,
    email: v.email || null,
    phone: v.phone || null,
    title: v.title || null,
    company_name: v.company_name || null,
    industry: v.industry || null,
    location: v.location || null,
    hiring_needs: v.hiring_needs || null,
    notes: v.notes || null,
    marketing_consent: v.marketing_consent,
    military_branch: v.military_branch || null,
    rank: v.rank || null,
    mos_or_specialty: v.mos_or_specialty || null,
    clearance: v.clearance || null,
    years_of_service: v.years_of_service === "" ? null : Number(v.years_of_service),
    tags: tagsArray,
    source: v.source || null,
    resume_url: v.resume_url || null,
    linkedin: v.linkedin || null,
  };

  const { error } = await supabase
    .from("prospects")
    .update(prospectFields)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Propagate to the linked downstream record so the prospect, candidate,
  // and company stay in sync as one logical record per individual/business.
  if (existing.converted_to_candidate_id) {
    await syncProspectToLinkedCandidate(
      existing.converted_to_candidate_id,
      prospectFields,
    );
    revalidatePath(`/candidates/${existing.converted_to_candidate_id}`);
    revalidatePath("/candidates");
  }
  if (existing.converted_to_company_id) {
    await syncProspectToLinkedCompany(
      existing.converted_to_company_id,
      prospectFields,
    );
    revalidatePath(`/companies/${existing.converted_to_company_id}`);
    revalidatePath("/companies");
  }

  revalidatePath(`/prospects/${existing.list_id}`);
  revalidatePath("/prospects");
  return { ok: true };
}

// =====================================================================
// Notes for a prospect - writes to the unified candidate_notes table.
// If the prospect has been converted, also stamps candidate_id so the
// note appears on the candidate detail page too. Shared timeline.
// =====================================================================

const prospectNoteSchema = z
  .string()
  .trim()
  .min(1, "Note can't be empty.")
  .max(5000, "Note is too long (max 5000 characters).");

export async function addProspectNote(
  prospectId: string,
  note: string,
): Promise<ActionResult> {
  if (!prospectId) return { ok: false, error: "Missing prospect id." };

  const parsed = prospectNoteSchema.safeParse(note);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid note.",
    };
  }

  const employee = await getCurrentEmployeeId();
  if ("error" in employee) return { ok: false, error: employee.error };

  const supabase = await createClient();

  const { data: pRow, error: pErr } = await supabase
    .from("prospects")
    .select("list_id, converted_to_candidate_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!pRow) return { ok: false, error: "Prospect not found." };

  const { error } = await supabase.from("candidate_notes").insert({
    prospect_id: prospectId,
    candidate_id: pRow.converted_to_candidate_id ?? null,
    employee_id: employee.id,
    note: parsed.data,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/prospects/${pRow.list_id}/${prospectId}`);
  if (pRow.converted_to_candidate_id) {
    revalidatePath(`/candidates/${pRow.converted_to_candidate_id}`);
  }
  return { ok: true };
}

// =====================================================================
// Form-shaped wrappers: let the SAME CandidateForm / CompanyForm
// component drive prospect edits. The form value shapes are imported
// loosely (we only depend on field names) so we don't pull a client
// dependency tree into this server module.
// =====================================================================

type CandidateFormShape = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  military_branch: string;
  rank: string;
  mos_or_specialty: string;
  clearance: string;
  years_of_service: string;
  target_industry: string;
  target_location: string;
  status: string;
  source: string;
  tags: string;
  marketing_consent: boolean;
  linkedin: string;
  resume_url: string;
};

type CompanyFormShape = {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  industry: string;
  location: string;
  hiring_needs: string;
  status: string;
  notes: string;
};

function splitName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  if (!trimmed) return { first: "", last: "" };
  const ix = trimmed.indexOf(" ");
  if (ix === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, ix), last: trimmed.slice(ix + 1).trim() };
}

export async function updateProspectAsCandidate(
  prospectId: string,
  values: CandidateFormShape,
): Promise<ActionResult<{ id: string }>> {
  if (!prospectId) return { ok: false, error: "Missing prospect id." };
  // Read existing prospect-only fields (title/company/hiring_needs/notes)
  // so they survive an edit through the candidate form, which doesn't
  // surface them.
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("prospects")
    .select("title, company_name, hiring_needs, notes")
    .eq("id", prospectId)
    .maybeSingle();
  const mapped: UpdateProspectInput = {
    first_name: values.first_name,
    last_name: values.last_name,
    email: values.email,
    phone: values.phone,
    title: cur?.title ?? "",
    company_name: cur?.company_name ?? "",
    industry: values.target_industry,
    location: values.target_location,
    hiring_needs: cur?.hiring_needs ?? "",
    notes: cur?.notes ?? "",
    marketing_consent: values.marketing_consent,
    military_branch: values.military_branch as UpdateProspectInput["military_branch"],
    rank: values.rank,
    mos_or_specialty: values.mos_or_specialty,
    clearance: values.clearance as UpdateProspectInput["clearance"],
    years_of_service: values.years_of_service,
    tags: values.tags,
    source: values.source,
    resume_url: values.resume_url,
    linkedin: values.linkedin,
  };
  const r = await updateProspect(prospectId, mapped);
  if (!r.ok) return r;
  return { ok: true, id: prospectId };
}

export async function updateProspectAsCompany(
  prospectId: string,
  values: CompanyFormShape,
): Promise<ActionResult<{ id: string }>> {
  if (!prospectId) return { ok: false, error: "Missing prospect id." };
  const { first, last } = splitName(values.contact_name);
  // Map company form → prospect schema. Company-kind prospects store the
  // contact person in first_name/last_name and don't carry military fields.
  const mapped: UpdateProspectInput = {
    first_name: first,
    last_name: last,
    email: values.contact_email,
    phone: values.contact_phone,
    title: "",
    company_name: values.company_name,
    industry: values.industry,
    location: values.location,
    hiring_needs: values.hiring_needs,
    notes: values.notes,
    marketing_consent: false,
    military_branch: "",
    rank: "",
    mos_or_specialty: "",
    clearance: "",
    years_of_service: "",
    tags: "",
    source: "",
    resume_url: "",
    linkedin: "",
  };
  // Preserve marketing_consent + any candidate-side fields already stored
  // on the row by reading them and re-passing.
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("prospects")
    .select(
      "marketing_consent, title, military_branch, rank, mos_or_specialty, clearance, years_of_service, tags, source, resume_url, linkedin",
    )
    .eq("id", prospectId)
    .maybeSingle();
  if (cur) {
    mapped.marketing_consent = cur.marketing_consent;
    mapped.title = cur.title ?? "";
    mapped.military_branch = (cur.military_branch ?? "") as UpdateProspectInput["military_branch"];
    mapped.rank = cur.rank ?? "";
    mapped.mos_or_specialty = cur.mos_or_specialty ?? "";
    mapped.clearance = (cur.clearance ?? "") as UpdateProspectInput["clearance"];
    mapped.years_of_service =
      cur.years_of_service != null ? String(cur.years_of_service) : "";
    mapped.tags = (cur.tags ?? []).join(", ");
    mapped.source = cur.source ?? "";
    mapped.resume_url = cur.resume_url ?? "";
    mapped.linkedin = cur.linkedin ?? "";
  }
  const r = await updateProspect(prospectId, mapped);
  if (!r.ok) return r;
  return { ok: true, id: prospectId };
}

// =====================================================================
// Move a Candidate-kind prospect into the Candidate Pipeline.
// First move: creates the candidates row, copies notes once, flips
//             pipeline_stage to 'Candidate'.
// Re-move (after a prior move-back): reuses the existing candidates row
//             and restores the snapshotted candidate.status so the
//             individual picks up where they left off (no remnants).
// =====================================================================

export async function convertProspectToCandidate(
  prospectId: string,
): Promise<{ ok: true; candidateId: string } | { ok: false; error: string }> {
  if (!prospectId) return { ok: false, error: "Missing prospect id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();

  const { data: p, error: pErr } = await supabase
    .from("prospects")
    .select("*, list:prospect_lists(kind)")
    .eq("id", prospectId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!p) return { ok: false, error: "Prospect not found." };

  const listKind = (
    Array.isArray(p.list) ? p.list[0]?.kind : (p.list as { kind?: string })?.kind
  ) as ProspectListKind | undefined;
  if (listKind !== "Candidate") {
    return {
      ok: false,
      error:
        "This prospect belongs to a Company-kind list. Move it to the Employer Pipeline instead.",
    };
  }

  if (p.pipeline_stage === "Candidate") {
    return { ok: false, error: "Already in the Candidate Pipeline." };
  }
  if (p.pipeline_stage === "Company") {
    return {
      ok: false,
      error:
        "Currently in the Employer Pipeline. Move back to Prospect first.",
    };
  }
  if (!p.first_name && !p.last_name) {
    return {
      ok: false,
      error: "Prospect has no name. Edit it before moving.",
    };
  }

  let candidateId = p.converted_to_candidate_id as string | null;

  if (candidateId) {
    // Re-entering the Candidate Pipeline after a previous move-back -
    // resurrect the existing row with whatever status they had when
    // they were last here. Defensive fallback to "New" if the snapshot
    // is missing or somehow no longer a valid status.
    const snapshot = p.snapshot_candidate_status;
    const restoredStatus: CandidateStatus =
      snapshot && (CANDIDATE_STATUSES as readonly string[]).includes(snapshot)
        ? (snapshot as CandidateStatus)
        : "New";
    const { error: rErr } = await supabase
      .from("candidates")
      .update({ status: restoredStatus })
      .eq("id", candidateId);
    if (rErr) return { ok: false, error: rErr.message };
  } else {
    // First move into the Candidate Pipeline - create the candidates row.
    const { data: candidate, error: cErr } = await supabase
      .from("candidates")
      .insert({
        first_name: p.first_name ?? "",
        last_name: p.last_name ?? "",
        email: p.email,
        phone: p.phone,
        target_location: p.location,
        target_industry: p.industry,
        status: "New",
        source: "Prospect",
        tags: ["Converted from Prospect"],
        marketing_consent: p.marketing_consent,
        resume_url: p.resume_url,
        linkedin: p.linkedin,
      })
      .select("id")
      .single();
    if (cErr) return { ok: false, error: cErr.message };
    candidateId = candidate.id;

    if (p.notes && p.notes.trim()) {
      const employee = await getCurrentEmployeeId();
      if ("id" in employee) {
        await supabase.from("candidate_notes").insert({
          candidate_id: candidateId,
          prospect_id: prospectId,
          employee_id: employee.id,
          note: `Converted from prospect.\n\n${p.notes.trim()}`,
        });
      }
    }

    // Backfill candidate_id on any existing prospect-only notes so the
    // shared timeline survives the transition.
    await supabase
      .from("candidate_notes")
      .update({ candidate_id: candidateId })
      .eq("prospect_id", prospectId)
      .is("candidate_id", null);
  }

  const { error: updateErr } = await supabase
    .from("prospects")
    .update({
      converted_to_candidate_id: candidateId,
      pipeline_stage: "Candidate",
      previous_pipeline_stage: p.pipeline_stage,
      // Clear the snapshot now that we've restored from it (avoids stale
      // values from sticking around forever).
      snapshot_candidate_status: null,
    })
    .eq("id", prospectId);
  if (updateErr) {
    console.error("[prospects] move-to-candidate: failed to flip stage", updateErr);
  }

  revalidatePath(`/prospects/${p.list_id}`);
  revalidatePath(`/prospects/${p.list_id}/${prospectId}`);
  revalidatePath("/prospects");
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/dashboard");

  return { ok: true, candidateId };
}

// =====================================================================
// Move a Company-kind prospect into the Employer Pipeline.
// =====================================================================

export async function convertProspectToCompany(
  prospectId: string,
): Promise<{ ok: true; companyId: string } | { ok: false; error: string }> {
  if (!prospectId) return { ok: false, error: "Missing prospect id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();

  const { data: p, error: pErr } = await supabase
    .from("prospects")
    .select("*, list:prospect_lists(kind)")
    .eq("id", prospectId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!p) return { ok: false, error: "Prospect not found." };

  const listKind = (
    Array.isArray(p.list) ? p.list[0]?.kind : (p.list as { kind?: string })?.kind
  ) as ProspectListKind | undefined;
  if (listKind !== "Company") {
    return {
      ok: false,
      error:
        "This prospect belongs to a Candidate-kind list. Move it to the Candidate Pipeline instead.",
    };
  }

  if (p.pipeline_stage === "Company") {
    return { ok: false, error: "Already in the Employer Pipeline." };
  }
  if (p.pipeline_stage === "Candidate") {
    return {
      ok: false,
      error:
        "Currently in the Candidate Pipeline. Move back to Prospect first.",
    };
  }
  if (!p.company_name) {
    return {
      ok: false,
      error: "Prospect has no company name. Edit it before moving.",
    };
  }

  let companyId = p.converted_to_company_id as string | null;

  if (companyId) {
    const snapshot = p.snapshot_company_status;
    const restoredStatus: CompanyStatus =
      snapshot && (COMPANY_STATUSES as readonly string[]).includes(snapshot)
        ? (snapshot as CompanyStatus)
        : "Prospect";
    const { error: rErr } = await supabase
      .from("companies")
      .update({ status: restoredStatus })
      .eq("id", companyId);
    if (rErr) return { ok: false, error: rErr.message };
  } else {
    // Pack first/last as contact_name for the companies row.
    const contactName = [p.first_name, p.last_name].filter(Boolean).join(" ");
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .insert({
        company_name: p.company_name,
        contact_name: contactName || null,
        contact_email: p.email,
        contact_phone: p.phone,
        industry: p.industry,
        location: p.location,
        hiring_needs: p.hiring_needs,
        status: "Prospect",
        notes: p.notes,
      })
      .select("id")
      .single();
    if (cErr) return { ok: false, error: cErr.message };
    companyId = company.id;
  }

  const { error: updateErr } = await supabase
    .from("prospects")
    .update({
      converted_to_company_id: companyId,
      pipeline_stage: "Company",
      previous_pipeline_stage: p.pipeline_stage,
      snapshot_company_status: null,
    })
    .eq("id", prospectId);
  if (updateErr) {
    console.error("[prospects] move-to-company: failed to flip stage", updateErr);
  }

  revalidatePath(`/prospects/${p.list_id}`);
  revalidatePath(`/prospects/${p.list_id}/${prospectId}`);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/prospects");
  revalidatePath("/companies");
  revalidatePath("/dashboard");

  return { ok: true, companyId };
}

// =====================================================================
// Move-back: send an individual from Candidate or Employer Pipeline
// back to their previous category (typically Prospect). Preserves the
// downstream record by snapshotting its status and then soft-archiving
// it (Archived for candidates, Inactive for companies), so it drops
// out of the active roster cleanly. Re-moving forward restores the
// snapshotted status.
//
// previousProspectId is returned so callers can redirect to the
// prospect detail page after the move.
// =====================================================================

export async function moveProspectBackToPrevious(
  prospectId: string,
): Promise<
  | {
      ok: true;
      listId: string;
      stage: "Prospect" | "Candidate" | "Company";
    }
  | { ok: false; error: string }
> {
  if (!prospectId) return { ok: false, error: "Missing prospect id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { data: p, error: pErr } = await supabase
    .from("prospects")
    .select(
      "list_id, pipeline_stage, previous_pipeline_stage, converted_to_candidate_id, converted_to_company_id",
    )
    .eq("id", prospectId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!p) return { ok: false, error: "Prospect not found." };

  // Idempotent: if the prospect is already in the Prospect stage, we
  // still archive the linked downstream record if it's somehow active
  // (data drift, partial-failure recovery). That way the Candidate
  // Pipeline / Companies boards always reflect the requested state.
  const target: "Prospect" | "Candidate" | "Company" =
    (p.previous_pipeline_stage as "Prospect" | "Candidate" | "Company" | null) ??
    "Prospect";

  // Snapshot + soft-archive the linked downstream record so it leaves
  // the active roster without losing its history. We branch on whether
  // a linked record exists rather than on pipeline_stage so a duplicate
  // call still cleans up cleanly.
  if (p.converted_to_candidate_id) {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("status")
      .eq("id", p.converted_to_candidate_id)
      .maybeSingle();
    // Only snapshot + archive if the candidate isn't already Archived.
    // This makes the action idempotent and avoids clobbering an earlier
    // snapshot on repeated move-backs.
    if (candidate && candidate.status !== "Archived") {
      await supabase
        .from("prospects")
        .update({ snapshot_candidate_status: candidate.status })
        .eq("id", prospectId);

      const { error: cErr } = await supabase
        .from("candidates")
        .update({ status: "Archived" })
        .eq("id", p.converted_to_candidate_id);
      if (cErr) return { ok: false, error: cErr.message };
    }

    revalidatePath(`/candidates/${p.converted_to_candidate_id}`);
    revalidatePath("/candidates");
  }
  if (p.converted_to_company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("status")
      .eq("id", p.converted_to_company_id)
      .maybeSingle();
    // Only snapshot if the row isn't already Inactive - preserves the
    // value of any prior snapshot across repeated move-back calls.
    if (company && company.status !== "Inactive") {
      await supabase
        .from("prospects")
        .update({ snapshot_company_status: company.status })
        .eq("id", prospectId);

      const { error: cErr } = await supabase
        .from("companies")
        .update({ status: "Inactive" })
        .eq("id", p.converted_to_company_id);
      if (cErr) return { ok: false, error: cErr.message };
    }
    revalidatePath(`/companies/${p.converted_to_company_id}`);
    revalidatePath("/companies");
  }

  const { error: stageErr } = await supabase
    .from("prospects")
    .update({
      pipeline_stage: target,
      previous_pipeline_stage: p.pipeline_stage,
    })
    .eq("id", prospectId);
  if (stageErr) return { ok: false, error: stageErr.message };

  revalidatePath(`/prospects/${p.list_id}`);
  revalidatePath(`/prospects/${p.list_id}/${prospectId}`);
  revalidatePath("/prospects");
  revalidatePath("/dashboard");

  return { ok: true, listId: p.list_id, stage: target };
}

// =====================================================================
// Edit list metadata (name / description / source) - kind is fixed at
// creation time.
// =====================================================================

const updateListSchema = z.object({
  name: z.string().trim().min(1, "List name is required.").max(200),
  description: z.string().trim().max(2000),
  source: z.string().trim().max(200),
});

export type UpdateListInput = z.infer<typeof updateListSchema>;

export async function updateProspectList(
  id: string,
  input: UpdateListInput,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing list id." };

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const parsed = updateListSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("prospect_lists")
    .update({
      name: v.name.trim(),
      description: v.description.trim() || null,
      source: v.source.trim() || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/prospects");
  revalidatePath(`/prospects/${id}`);
  return { ok: true };
}

// =====================================================================
// Assign a lead list to a team member (or clear with null).
// =====================================================================

export async function assignProspectList(
  id: string,
  assignee: LeadListAssignee | null,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing list id." };
  if (
    assignee !== null &&
    !(LEAD_LIST_ASSIGNEES as readonly string[]).includes(assignee)
  ) {
    return { ok: false, error: "Unknown assignee." };
  }

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { error } = await supabase
    .from("prospect_lists")
    .update({ assigned_to: assignee })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/prospects");
  revalidatePath(`/prospects/${id}`);
  return { ok: true };
}

// =====================================================================
// Move a list under a parent (make it a sub-list), or back to top level
// (parentId = null). One level deep, same kind, no self-nesting.
// =====================================================================

export async function moveProspectListToParent(
  listId: string,
  parentId: string | null,
): Promise<ActionResult> {
  if (!listId) return { ok: false, error: "Missing list id." };
  if (parentId === listId) {
    return { ok: false, error: "A list can't be nested under itself." };
  }

  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();

  const { data: list, error: listErr } = await supabase
    .from("prospect_lists")
    .select("id, kind")
    .eq("id", listId)
    .maybeSingle();
  if (listErr) return { ok: false, error: listErr.message };
  if (!list) return { ok: false, error: "List not found." };

  if (parentId) {
    // A list that already has sub-lists can't itself become a sub-list
    // (sub-lists are only one level deep).
    const { count: childCount, error: childErr } = await supabase
      .from("prospect_lists")
      .select("id", { count: "exact", head: true })
      .eq("parent_list_id", listId);
    if (childErr) return { ok: false, error: childErr.message };
    if ((childCount ?? 0) > 0) {
      return {
        ok: false,
        error: "This list has sub-lists. Move them out before nesting it.",
      };
    }

    const { data: parent, error: parentErr } = await supabase
      .from("prospect_lists")
      .select("id, kind, parent_list_id")
      .eq("id", parentId)
      .maybeSingle();
    if (parentErr) return { ok: false, error: parentErr.message };
    if (!parent) return { ok: false, error: "Target list not found." };
    if (parent.kind !== list.kind) {
      return {
        ok: false,
        error: `A ${list.kind} list can only nest under another ${list.kind} list.`,
      };
    }
    if (parent.parent_list_id) {
      return {
        ok: false,
        error: "That target is itself a sub-list (nesting is one level deep).",
      };
    }
  }

  const { error: updErr } = await supabase
    .from("prospect_lists")
    .update({ parent_list_id: parentId })
    .eq("id", listId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/prospects");
  revalidatePath(`/prospects/${listId}`);
  if (parentId) revalidatePath(`/prospects/${parentId}`);
  return { ok: true };
}

// =====================================================================
// Reorder lists (drag-and-drop on /prospects). Receives every list id
// in its new display order and writes sort_order = index. Only callable
// with the full, unfiltered set so hidden lists can't be scrambled.
// Admin-only: the order is shared by everyone, so only admins set it.
// =====================================================================

const reorderListsSchema = z.array(z.string().uuid()).min(1).max(200);

export async function reorderProspectLists(
  orderedIds: string[],
): Promise<ActionResult> {
  const parsed = reorderListsSchema.safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Invalid list order." };

  const me = await getCurrentEmployee();
  if ("error" in me) return { ok: false, error: me.error };
  if (me.role !== "Admin") {
    return { ok: false, error: "Only admins can reorder lead lists." };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.map((id, index) =>
      supabase.from("prospect_lists").update({ sort_order: index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidatePath("/prospects");
  return { ok: true };
}

