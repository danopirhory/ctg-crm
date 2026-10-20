import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Shared plumbing for the public /api/intake/* endpoints. The public
// marketing site POSTs form submissions here instead of talking to
// Supabase directly. Defense layers, in order:
//
//   1. CORS allowlist (browser-enforced; non-browser clients skip it)
//   2. Honeypot field - bots that fill every input self-identify
//   3. Per-IP rate limit - in-memory, best-effort under Fluid Compute
//      (instances are reused across requests, so this catches bursts)
//   4. Zod validation in each route
//   5. 24h same-email idempotency so double-submits don't double-insert
//
// Inserts use the service-role client; the endpoints are not
// session-authenticated by design.
// =====================================================================

// Marketing-site origins come from INTAKE_ALLOWED_ORIGINS (comma-
// separated). The example.com defaults are placeholders. Local dev
// ports are always allowed so the smoke test can run.
const DEFAULT_SITE_ORIGINS = ["https://www.example.com", "https://example.com"];

function siteOrigins(): string[] {
  const fromEnv = (process.env.INTAKE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_SITE_ORIGINS;
}

const SITE_ORIGINS = siteOrigins();
const ALLOWED_ORIGINS = new Set([
  ...SITE_ORIGINS,
  "http://localhost:3000",
  "http://localhost:3001",
]);

export function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : SITE_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflightResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export function intakeJson(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(req.headers.get("origin")),
    },
  });
}

// --- Rate limiting -----------------------------------------------------

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

export function rateLimited(req: Request, endpoint: string): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${endpoint}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

// --- List resolution + idempotent insert -------------------------------

type ListSpec = {
  name: string;
  kind: "Candidate" | "Company";
  description: string;
};

export const TALENT_LIST: ListSpec = {
  name: "Talent Network Applications",
  kind: "Candidate",
  description:
    "Auto-populated from the Join Our Talent Network form on the public website.",
};

export const EMPLOYER_LIST: ListSpec = {
  name: "Employer Inquiries",
  kind: "Company",
  description:
    "Auto-populated from the Hire Military Talent form on the public website.",
};

export async function findOrCreateIntakeList(
  spec: ListSpec,
): Promise<{ ok: true; listId: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data: existing, error: findErr } = await supabase
    .from("prospect_lists")
    .select("id")
    .eq("name", spec.name)
    .maybeSingle();
  if (findErr) return { ok: false, error: findErr.message };
  if (existing) return { ok: true, listId: existing.id };

  const { data: created, error: createErr } = await supabase
    .from("prospect_lists")
    .insert({
      name: spec.name,
      kind: spec.kind,
      description: spec.description,
      source: "Inbound (Website)",
      consent_confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (createErr || !created) {
    return {
      ok: false,
      error: createErr?.message ?? "Could not create intake list.",
    };
  }
  return { ok: true, listId: created.id };
}

// Returns true when an identical-email lead landed in this list within
// the last 24h - treat as a double-submit and skip the insert.
export async function isRecentDuplicate(
  listId: string,
  email: string,
): Promise<boolean> {
  if (!email.trim()) return false;
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId)
    .ilike("email", email.trim())
    .gte("created_at", since);
  return (count ?? 0) > 0;
}
