import { createClient } from "@/lib/supabase/server";

// Email-based duplicate lookup used by the manual intake paths
// (new candidate form, add-lead dialog). Exact-match but
// case-insensitive; we deliberately do NOT fuzzy-match names - false
// positives there are worse than the occasional missed duplicate.
//
// Client components import only the DuplicateHit type from here
// (type-only imports are erased at build time), so keep runtime
// exports server-safe.

export type DuplicateHit = {
  kind: "candidate" | "lead";
  id: string;
  name: string;
  // Extra context shown in the confirm prompt - candidate status or
  // the lead list's name.
  detail: string | null;
};

export async function findDuplicatesByEmail(
  email: string,
): Promise<DuplicateHit[]> {
  const e = email.trim();
  if (!e) return [];

  const supabase = await createClient();
  const [cands, leads] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, first_name, last_name, status")
      .ilike("email", e)
      .limit(3),
    supabase
      .from("prospects")
      .select("id, first_name, last_name, company_name, list:prospect_lists(name)")
      .ilike("email", e)
      .limit(3),
  ]);

  const hits: DuplicateHit[] = [];
  for (const c of cands.data ?? []) {
    hits.push({
      kind: "candidate",
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim() || "(unnamed)",
      detail: c.status,
    });
  }
  for (const p of leads.data ?? []) {
    const list = Array.isArray(p.list) ? p.list[0] : p.list;
    const personName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    hits.push({
      kind: "lead",
      id: p.id,
      name: personName || p.company_name || "(unnamed)",
      detail: list?.name ?? null,
    });
  }
  return hits;
}
