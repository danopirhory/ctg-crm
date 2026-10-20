"use server";

import { createClient } from "@/lib/supabase/server";

// Global search backing the Ctrl+K palette. One round trip fans out to
// the four record types in parallel; each returns at most 6 hits.
// ilike with no wildcards in user text = case-insensitive substring
// after we wrap it ourselves; strip PostgREST or() syntax characters.

export type SearchHit = {
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
};

export type GlobalSearchResults = {
  candidates: SearchHit[];
  companies: SearchHit[];
  jobs: SearchHit[];
  leads: SearchHit[];
};

const EMPTY: GlobalSearchResults = {
  candidates: [],
  companies: [],
  jobs: [],
  leads: [],
};

export async function globalSearch(q: string): Promise<GlobalSearchResults> {
  const term = q.trim();
  if (term.length < 2) return EMPTY;

  // Commas / parens would break the .or() filter string; % and _ would
  // act as extra wildcards inside ilike.
  const safe = term.replace(/[,()%_]/g, " ").trim();
  if (safe.length < 2) return EMPTY;
  const p = `%${safe}%`;

  const supabase = await createClient();
  const [cands, comps, jobs, leads] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, first_name, last_name, email, status")
      .or(`first_name.ilike.${p},last_name.ilike.${p},email.ilike.${p}`)
      .limit(6),
    supabase
      .from("companies")
      .select("id, company_name, status, location")
      .ilike("company_name", p)
      .limit(6),
    supabase
      .from("jobs")
      .select("id, title, status, company:companies(company_name)")
      .ilike("title", p)
      .limit(6),
    supabase
      .from("prospects")
      .select(
        "id, list_id, first_name, last_name, company_name, email, list:prospect_lists(name)",
      )
      .or(
        `first_name.ilike.${p},last_name.ilike.${p},email.ilike.${p},company_name.ilike.${p}`,
      )
      .limit(6),
  ]);

  return {
    candidates: (cands.data ?? []).map((c) => ({
      id: c.id,
      href: `/candidates/${c.id}`,
      title: `${c.first_name} ${c.last_name}`.trim() || "(unnamed)",
      subtitle: [c.status, c.email].filter(Boolean).join(" · ") || null,
    })),
    companies: (comps.data ?? []).map((c) => ({
      id: c.id,
      href: `/companies/${c.id}`,
      title: c.company_name,
      subtitle: [c.status, c.location].filter(Boolean).join(" · ") || null,
    })),
    jobs: (jobs.data ?? []).map((j) => {
      const company = Array.isArray(j.company) ? j.company[0] : j.company;
      return {
        id: j.id,
        href: `/jobs/${j.id}`,
        title: j.title,
        subtitle:
          [company?.company_name, j.status].filter(Boolean).join(" · ") ||
          null,
      };
    }),
    leads: (leads.data ?? []).map((p) => {
      const list = Array.isArray(p.list) ? p.list[0] : p.list;
      const person = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      return {
        id: p.id,
        href: `/prospects/${p.list_id}/${p.id}`,
        title: person || p.company_name || "(unnamed)",
        subtitle:
          [list?.name, p.email].filter(Boolean).join(" · ") || null,
      };
    }),
  };
}
