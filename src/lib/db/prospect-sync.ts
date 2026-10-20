import "server-only";

import { createClient } from "@/lib/supabase/server";

// =====================================================================
// Two-way sync between a prospect row and its downstream candidate or
// company row. The prospect, candidate, and company are conceptually
// ONE record for an individual/business as it moves through the
// pipeline - edits in either place propagate the shared fields.
//
// Sync failures never block the originating update - they log and
// move on, so a transient RLS or constraint hiccup on one side cannot
// roll back the edit the user actually performed.
// =====================================================================

function splitContactName(
  name: string | null,
): { first: string | null; last: string | null } {
  if (!name) return { first: null, last: null };
  const trimmed = name.trim();
  if (!trimmed) return { first: null, last: null };
  const ix = trimmed.indexOf(" ");
  if (ix === -1) return { first: trimmed, last: null };
  return {
    first: trimmed.slice(0, ix),
    last: trimmed.slice(ix + 1).trim() || null,
  };
}

// --------- Prospect → linked Candidate / Company ----------

export async function syncProspectToLinkedCandidate(
  candidateId: string,
  prospect: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    industry: string | null;
    location: string | null;
    marketing_consent: boolean;
    military_branch?: string | null;
    rank?: string | null;
    mos_or_specialty?: string | null;
    clearance?: string | null;
    years_of_service?: number | null;
    tags?: string[];
    source?: string | null;
    resume_url?: string | null;
    linkedin?: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({
      first_name: prospect.first_name ?? "",
      last_name: prospect.last_name ?? "",
      email: prospect.email,
      phone: prospect.phone,
      target_industry: prospect.industry,
      target_location: prospect.location,
      marketing_consent: prospect.marketing_consent,
      military_branch: prospect.military_branch ?? null,
      rank: prospect.rank ?? null,
      mos_or_specialty: prospect.mos_or_specialty ?? null,
      clearance: prospect.clearance ?? null,
      years_of_service: prospect.years_of_service ?? null,
      tags: prospect.tags ?? [],
      source: prospect.source ?? null,
      resume_url: prospect.resume_url ?? null,
      linkedin: prospect.linkedin ?? null,
    })
    .eq("id", candidateId);
  if (error) {
    console.warn("[prospect-sync] prospect→candidate failed:", error.message);
  }
}

export async function syncProspectToLinkedCompany(
  companyId: string,
  prospect: {
    company_name: string | null;
    industry: string | null;
    location: string | null;
    hiring_needs: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  },
): Promise<void> {
  const contactName = [prospect.first_name, prospect.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      company_name: prospect.company_name ?? "",
      industry: prospect.industry,
      location: prospect.location,
      hiring_needs: prospect.hiring_needs,
      contact_name: contactName || null,
      contact_email: prospect.email,
      contact_phone: prospect.phone,
      notes: prospect.notes,
    })
    .eq("id", companyId);
  if (error) {
    console.warn("[prospect-sync] prospect→company failed:", error.message);
  }
}

// --------- Candidate / Company → linked Prospect ----------

export async function syncCandidateToOriginProspect(
  candidateId: string,
  candidate: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    target_industry: string | null;
    target_location: string | null;
    marketing_consent: boolean;
    military_branch?: string | null;
    rank?: string | null;
    mos_or_specialty?: string | null;
    clearance?: string | null;
    years_of_service?: number | null;
    tags?: string[];
    source?: string | null;
    resume_url?: string | null;
    linkedin?: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("prospects")
    .update({
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      email: candidate.email,
      phone: candidate.phone,
      industry: candidate.target_industry,
      location: candidate.target_location,
      marketing_consent: candidate.marketing_consent,
      military_branch: candidate.military_branch ?? null,
      rank: candidate.rank ?? null,
      mos_or_specialty: candidate.mos_or_specialty ?? null,
      clearance: candidate.clearance ?? null,
      years_of_service: candidate.years_of_service ?? null,
      tags: candidate.tags ?? [],
      source: candidate.source ?? null,
      resume_url: candidate.resume_url ?? null,
      linkedin: candidate.linkedin ?? null,
    })
    .eq("converted_to_candidate_id", candidateId);
  if (error) {
    console.warn("[prospect-sync] candidate→prospect failed:", error.message);
  }
}

export async function syncCompanyToOriginProspect(
  companyId: string,
  company: {
    company_name: string;
    industry: string | null;
    location: string | null;
    hiring_needs: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    notes: string | null;
  },
): Promise<void> {
  const { first, last } = splitContactName(company.contact_name);
  const supabase = await createClient();
  const { error } = await supabase
    .from("prospects")
    .update({
      company_name: company.company_name,
      industry: company.industry,
      location: company.location,
      hiring_needs: company.hiring_needs,
      first_name: first,
      last_name: last,
      email: company.contact_email,
      phone: company.contact_phone,
      notes: company.notes,
    })
    .eq("converted_to_company_id", companyId);
  if (error) {
    console.warn("[prospect-sync] company→prospect failed:", error.message);
  }
}
