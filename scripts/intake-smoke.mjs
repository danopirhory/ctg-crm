// Intake contract smoke test. Run against a dev or preview server:
//
//   npm run smoke:intake                     (default http://localhost:3000)
//   BASE_URL=https://preview-url npm run smoke:intake
//
// Asserts the behavior contract in docs/intake-contract.md:
//   talent + employer happy paths, 24h dedupe, honeypot silence,
//   validation 400s. Cleans up its own rows when a service-role key is
//   available in .env.local (otherwise leaves rows with a
//   smoke+<ts>@ctgcrm-smoke.test email you can delete by hand).
//
// NOTE: the per-IP rate limit is 5 req / 10 min / endpoint. This suite
// makes exactly 4 requests per endpoint, so a full run fits; a second
// run within 10 minutes will trip 429s on purpose - that's the rate
// limiter working, not a failure of the deploy.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
// Local dev origin: always present in the intake CORS allowlist.
const TEST_ORIGIN = "http://localhost:3001";
const ts = Date.now();
const TALENT_EMAIL = `smoke+talent-${ts}@ctgcrm-smoke.test`;
const EMPLOYER_EMAIL = `smoke+employer-${ts}@ctgcrm-smoke.test`;

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response - leave null
  }
  return { status: res.status, json };
}

const talentBody = {
  first_name: "Smoke",
  last_name: "Test",
  email: TALENT_EMAIL,
  military_branch: "Army",
  location: "Testville, TX",
  marketing_consent: true,
  website: "",
};

const employerBody = {
  company_name: "Smoke Test Co",
  contact_name: "Smokey Tester",
  contact_email: EMPLOYER_EMAIL,
  hiring_needs: "Contract-test hiring needs",
  timeline: "Q4",
  website: "",
};

// ---- talent ----
{
  const r = await post("/api/intake/talent", talentBody);
  record(
    "talent: happy path 200 ok",
    r.status === 200 && r.json?.ok === true,
    `status ${r.status}`,
  );
}
{
  const r = await post("/api/intake/talent", talentBody);
  record(
    "talent: resubmit dedupes",
    r.status === 200 && r.json?.ok === true && r.json?.deduped === true,
    JSON.stringify(r.json),
  );
}
{
  const r = await post("/api/intake/talent", {
    ...talentBody,
    email: `smoke+honeypot-${ts}@ctgcrm-smoke.test`,
    website: "https://spam.example.com",
  });
  record(
    "talent: honeypot silent 200",
    r.status === 200 && r.json?.ok === true && !r.json?.deduped,
    `status ${r.status}`,
  );
}
{
  const r = await post("/api/intake/talent", {
    ...talentBody,
    email: "not-an-email",
  });
  record("talent: invalid email 400", r.status === 400, `status ${r.status}`);
}

// ---- employer ----
{
  const r = await post("/api/intake/employer", employerBody);
  record(
    "employer: happy path 200 ok",
    r.status === 200 && r.json?.ok === true,
    `status ${r.status}`,
  );
}
{
  const r = await post("/api/intake/employer", employerBody);
  record(
    "employer: resubmit dedupes",
    r.status === 200 && r.json?.ok === true && r.json?.deduped === true,
    JSON.stringify(r.json),
  );
}
{
  const r = await post("/api/intake/employer", { contact_email: EMPLOYER_EMAIL });
  record(
    "employer: missing company_name 400",
    r.status === 400,
    `status ${r.status}`,
  );
}
{
  const res = await fetch(`${BASE_URL}/api/intake/employer`, {
    method: "OPTIONS",
    headers: { Origin: TEST_ORIGIN },
  });
  record(
    "employer: OPTIONS preflight 204 + CORS",
    res.status === 204 &&
      res.headers.get("access-control-allow-origin") === TEST_ORIGIN,
    `status ${res.status}`,
  );
}

// ---- cleanup (best-effort, needs service role key) ----
function readEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (supabaseUrl && serviceKey) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(supabaseUrl, serviceKey);
    const { error } = await admin
      .from("prospects")
      .delete()
      .like("email", `smoke+%${ts}@ctgcrm-smoke.test`);
    console.log(error ? `cleanup failed: ${error.message}` : "cleanup: smoke rows deleted");
  } catch (e) {
    console.log(`cleanup skipped: ${e instanceof Error ? e.message : e}`);
  }
} else {
  console.log("cleanup skipped: no service role key in env/.env.local");
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
