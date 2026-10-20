import { createClient } from "@/lib/supabase/server";
import { csvDateStamp, csvResponse, toCsv } from "@/lib/csv";
import type { CandidateRow } from "@/lib/db/types";

// CSV of every candidate (all statuses, Archived included - filtering
// happens fine in the spreadsheet). Auth comes from the session cookie;
// RLS scopes the rows exactly like the UI.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const csv = toCsv<CandidateRow>(
    [
      { label: "First name", value: (r) => r.first_name },
      { label: "Last name", value: (r) => r.last_name },
      { label: "Email", value: (r) => r.email },
      { label: "Phone", value: (r) => r.phone },
      { label: "Status", value: (r) => r.status },
      { label: "Military branch", value: (r) => r.military_branch },
      { label: "Rank", value: (r) => r.rank },
      { label: "MOS / Specialty", value: (r) => r.mos_or_specialty },
      { label: "Clearance", value: (r) => r.clearance },
      { label: "Years of service", value: (r) => r.years_of_service },
      { label: "Target industry", value: (r) => r.target_industry },
      { label: "Target location", value: (r) => r.target_location },
      { label: "Source", value: (r) => r.source },
      { label: "Tags", value: (r) => (r.tags ?? []).join("; ") },
      { label: "LinkedIn", value: (r) => r.linkedin },
      { label: "Has resume", value: (r) => (r.resume_url ? "Yes" : "No") },
      { label: "Marketing consent", value: (r) => (r.marketing_consent ? "Yes" : "No") },
      { label: "Created", value: (r) => r.created_at },
    ],
    (data ?? []) as CandidateRow[],
  );

  return csvResponse(csv, `candidates-${csvDateStamp()}.csv`);
}
