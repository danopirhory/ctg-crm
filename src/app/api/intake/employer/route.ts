import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/db/activity";
import {
  EMPLOYER_LIST,
  findOrCreateIntakeList,
  intakeJson,
  isRecentDuplicate,
  preflightResponse,
  rateLimited,
} from "@/lib/intake";

// Public endpoint for the "Hire Military Talent" form. Employer leads
// land as Company-kind rows in the "Employer Inquiries" list under
// Leads - same place a recruiter would add one by hand.

const bodySchema = z.object({
  company_name: z.string().trim().min(1).max(300),
  contact_name: z.string().trim().max(300).optional().default(""),
  contact_email: z.string().trim().email().max(320),
  contact_phone: z.string().trim().max(50).optional().default(""),
  company_website: z.string().trim().max(500).optional().default(""),
  industry: z.string().trim().max(200).optional().default(""),
  location: z.string().trim().max(200).optional().default(""),
  hiring_needs: z.string().trim().max(5000).optional().default(""),
  timeline: z.string().trim().max(500).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  // Honeypot - humans never see this input; bots fill it.
  website: z.string().optional().default(""),
});

export async function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function POST(req: Request) {
  if (rateLimited(req, "employer")) {
    return intakeJson(req, { ok: false, error: "Too many requests." }, 429);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return intakeJson(req, { ok: false, error: "Invalid JSON body." }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return intakeJson(
      req,
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid submission.",
      },
      400,
    );
  }
  const v = parsed.data;

  if (v.website.trim()) {
    return intakeJson(req, { ok: true });
  }

  const list = await findOrCreateIntakeList(EMPLOYER_LIST);
  if (!list.ok) {
    return intakeJson(req, { ok: false, error: list.error }, 500);
  }

  if (await isRecentDuplicate(list.listId, v.contact_email)) {
    return intakeJson(req, { ok: true, deduped: true });
  }

  // The prospects row has no dedicated website / timeline columns -
  // fold those into notes so nothing the employer typed gets dropped.
  const [firstName, ...rest] = v.contact_name.split(/\s+/).filter(Boolean);
  const extraLines = [
    v.company_website && `Website: ${v.company_website}`,
    v.timeline && `Timeline: ${v.timeline}`,
    v.notes,
  ]
    .filter(Boolean)
    .join("\n");

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase.from("prospects").insert({
    list_id: list.listId,
    pipeline_stage: "Prospect",
    company_name: v.company_name,
    first_name: firstName ?? null,
    last_name: rest.length > 0 ? rest.join(" ") : null,
    email: v.contact_email,
    phone: v.contact_phone || null,
    industry: v.industry || null,
    location: v.location || null,
    hiring_needs: v.hiring_needs || null,
    notes: extraLines || null,
    source: "Inbound (Website)",
  })
    .select("id")
    .single();
  if (error) {
    return intakeJson(req, { ok: false, error: error.message }, 500);
  }

  await logActivityAsSystem({
    verb: "intake_received",
    summary: "Employer inquiry received from website",
    prospectId: inserted?.id ?? null,
  });

  return intakeJson(req, { ok: true });
}
