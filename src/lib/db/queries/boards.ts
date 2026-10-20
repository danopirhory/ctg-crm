import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CandidateStatus, JobStatus } from "../types";

// =====================================================================
// Kanban board data - one-shot loaders for the Candidates and Clients
// boards. Returns plain row-shaped DTOs the client board renders.
// =====================================================================

export type CandidateKanbanCard = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  target_industry: string | null;
  target_location: string | null;
  status: CandidateStatus;
  // Drives the resume indicator on cards - the AI review workflow
  // needs a resume on file, so surface it without opening the page.
  resume_url: string | null;
};

export type CandidateProspectKanbanCard = {
  id: string;
  list_id: string;
  list_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  rank: string | null;
  location: string | null;
};

export type JobKanbanColumn = {
  id: string;
  title: string;
  status: JobStatus;
  location: string | null;
  company: { id: string; company_name: string } | null;
  matched_candidate_ids: string[];
};

export type CandidateBoardData = {
  prospects: CandidateProspectKanbanCard[];
  candidates: CandidateKanbanCard[];
  jobs: JobKanbanColumn[];
};

export async function getCandidateBoardData(): Promise<CandidateBoardData> {
  const supabase = await createClient();

  const { data: prospects } = await supabase
    .from("prospects")
    .select(
      "id, list_id, first_name, last_name, email, rank, location, list:prospect_lists!inner(name, kind)",
    )
    .eq("pipeline_stage", "Prospect")
    .eq("list.kind", "Candidate")
    .order("last_name", { ascending: true, nullsFirst: false })
    .limit(500);

  const { data: candidates } = await supabase
    .from("candidates")
    .select(
      "id, first_name, last_name, email, target_industry, target_location, status, resume_url",
    )
    .neq("status", "Archived")
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      "id, title, status, location, company:companies(id, company_name)",
    )
    .in("status", ["Open", "Paused"])
    .order("created_at", { ascending: false })
    .limit(50);

  const jobIds = (jobs ?? []).map((j) => j.id);
  const matchMap = new Map<string, string[]>();
  if (jobIds.length) {
    const { data: matches } = await supabase
      .from("candidate_job_matches")
      .select("candidate_id, job_id")
      .in("job_id", jobIds);
    for (const m of matches ?? []) {
      const list = matchMap.get(m.job_id) ?? [];
      list.push(m.candidate_id);
      matchMap.set(m.job_id, list);
    }
  }

  return {
    prospects: (prospects ?? []).map((p) => {
      const listInfo = Array.isArray(p.list) ? p.list[0] : p.list;
      return {
        id: p.id,
        list_id: p.list_id,
        list_name: listInfo?.name ?? "",
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        rank: p.rank,
        location: p.location,
      };
    }),
    candidates: (candidates ?? []) as CandidateKanbanCard[],
    jobs: (jobs ?? []).map((j) => {
      const company = Array.isArray(j.company) ? j.company[0] : j.company;
      return {
        id: j.id,
        title: j.title,
        status: j.status,
        location: j.location,
        company: company
          ? { id: company.id, company_name: company.company_name }
          : null,
        matched_candidate_ids: matchMap.get(j.id) ?? [],
      };
    }),
  };
}

export type ClientProspectKanbanCard = {
  id: string;
  list_id: string;
  list_name: string;
  company_name: string | null;
  industry: string | null;
  location: string | null;
  contact_name: string | null;
  email: string | null;
};

export type CompanyKanbanCard = {
  id: string;
  company_name: string;
  industry: string | null;
  location: string | null;
  status: string;
  contact_name: string | null;
  job_count: number;
};

export type ClientBoardData = {
  prospects: ClientProspectKanbanCard[];
  // Converted companies still in the qualification stage (status
  // 'Prospect') vs. companies that have progressed beyond it.
  companyProspects: CompanyKanbanCard[];
  companies: CompanyKanbanCard[];
};

export async function getClientBoardData(): Promise<ClientBoardData> {
  const supabase = await createClient();

  const { data: prospects } = await supabase
    .from("prospects")
    .select(
      "id, list_id, first_name, last_name, email, company_name, industry, location, list:prospect_lists!inner(name, kind)",
    )
    .eq("pipeline_stage", "Prospect")
    .eq("list.kind", "Company")
    .order("company_name", { ascending: true, nullsFirst: false })
    .limit(500);

  const { data: companies } = await supabase
    .from("companies")
    .select(
      "id, company_name, industry, location, status, contact_name",
    )
    .neq("status", "Inactive")
    .order("company_name", { ascending: true })
    .limit(500);

  const companyIds = (companies ?? []).map((c) => c.id);
  const jobCounts = new Map<string, number>();
  if (companyIds.length) {
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("company_id")
      .in("company_id", companyIds)
      .in("status", ["Open", "Paused"]);
    for (const r of jobRows ?? []) {
      jobCounts.set(r.company_id, (jobCounts.get(r.company_id) ?? 0) + 1);
    }
  }

  const companyCards: CompanyKanbanCard[] = (companies ?? []).map((c) => ({
    id: c.id,
    company_name: c.company_name,
    industry: c.industry,
    location: c.location,
    status: c.status,
    contact_name: c.contact_name,
    job_count: jobCounts.get(c.id) ?? 0,
  }));

  return {
    prospects: (prospects ?? []).map((p) => {
      const listInfo = Array.isArray(p.list) ? p.list[0] : p.list;
      const contact =
        [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
      return {
        id: p.id,
        list_id: p.list_id,
        list_name: listInfo?.name ?? "",
        company_name: p.company_name,
        industry: p.industry,
        location: p.location,
        contact_name: contact,
        email: p.email,
      };
    }),
    companyProspects: companyCards.filter((c) => c.status === "Prospect"),
    companies: companyCards.filter((c) => c.status !== "Prospect"),
  };
}

