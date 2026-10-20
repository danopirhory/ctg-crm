import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/db/activity";
import {
  TALENT_LIST,
  findOrCreateIntakeList,
  intakeJson,
  isRecentDuplicate,
  preflightResponse,
  rateLimited,
} from "@/lib/intake";

// Public endpoint for the "Join Our Talent Network" form on the
// marketing site. POST JSON; responds { ok: true } on success.
//
//   fetch("<crm-origin>/api/intake/talent", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ first_name, last_name, email, ... }),
//   })

const bodySchema = z.object({
  first_name: z.string().trim().min(1).max(200),
  last_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional().default(""),
  military_branch: z.string().trim().max(100).optional().default(""),
  rank: z.string().trim().max(200).optional().default(""),
  mos_or_specialty: z.string().trim().max(500).optional().default(""),
  clearance: z.string().trim().max(100).optional().default(""),
  years_of_service: z.number().min(0).max(60).nullable().optional(),
  target_industry: z.string().trim().max(200).optional().default(""),
  location: z.string().trim().max(200).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  marketing_consent: z.boolean().optional().default(false),
  // Honeypot - humans never see this input; bots fill it.
  website: z.string().optional().default(""),
});

export async function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function POST(req: Request) {
  if (rateLimited(req, "talent")) {
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

  // Honeypot tripped - pretend success so the bot learns nothing.
  if (v.website.trim()) {
    return intakeJson(req, { ok: true });
  }

  const list = await findOrCreateIntakeList(TALENT_LIST);
  if (!list.ok) {
    return intakeJson(req, { ok: false, error: list.error }, 500);
  }

  if (await isRecentDuplicate(list.listId, v.email)) {
    return intakeJson(req, { ok: true, deduped: true });
  }

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase.from("prospects").insert({
    list_id: list.listId,
    pipeline_stage: "Prospect",
    first_name: v.first_name,
    last_name: v.last_name,
    email: v.email,
    phone: v.phone || null,
    military_branch: v.military_branch || null,
    rank: v.rank || null,
    mos_or_specialty: v.mos_or_specialty || null,
    clearance: v.clearance || null,
    years_of_service: v.years_of_service ?? null,
    industry: v.target_industry || null,
    location: v.location || null,
    notes: v.notes || null,
    marketing_consent: v.marketing_consent,
    source: "Inbound (Website)",
  })
    .select("id")
    .single();
  if (error) {
    return intakeJson(req, { ok: false, error: error.message }, 500);
  }

  await logActivityAsSystem({
    verb: "intake_received",
    summary: "Talent application received from website",
    prospectId: inserted?.id ?? null,
  });

  return intakeJson(req, { ok: true });
}
