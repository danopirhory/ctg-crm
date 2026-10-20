import { createClient } from "@/lib/supabase/server";
import { csvDateStamp, csvResponse, toCsv } from "@/lib/csv";
import { listAllProspectsInList } from "@/lib/db/queries";
import type { Database } from "@/lib/db/types";

type ProspectRow = Database["public"]["Tables"]["prospects"]["Row"];

// CSV of every lead in one list - both Candidate-kind and Company-kind
// columns are included since the row shape is shared; irrelevant ones
// just come out empty.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: list } = await supabase
    .from("prospect_lists")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!list) {
    return Response.json({ error: "List not found." }, { status: 404 });
  }

  const { data: rows, error } = await listAllProspectsInList(id);
  if (error) {
    return Response.json({ error }, { status: 500 });
  }

  const csv = toCsv<ProspectRow>(
    [
      { label: "First name", value: (r) => r.first_name },
      { label: "Last name", value: (r) => r.last_name },
      { label: "Email", value: (r) => r.email },
      { label: "Phone", value: (r) => r.phone },
      { label: "Title", value: (r) => r.title },
      { label: "Company name", value: (r) => r.company_name },
      { label: "Hiring needs", value: (r) => r.hiring_needs },
      { label: "Industry", value: (r) => r.industry },
      { label: "Location", value: (r) => r.location },
      { label: "Military branch", value: (r) => r.military_branch },
      { label: "Rank", value: (r) => r.rank },
      { label: "MOS / Specialty", value: (r) => r.mos_or_specialty },
      { label: "Clearance", value: (r) => r.clearance },
      { label: "Pipeline stage", value: (r) => r.pipeline_stage },
      { label: "Source", value: (r) => r.source },
      { label: "Tags", value: (r) => (r.tags ?? []).join("; ") },
      { label: "Notes", value: (r) => r.notes },
      { label: "Created", value: (r) => r.created_at },
    ],
    rows,
  );

  const slug =
    list.name
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "leads";
  return csvResponse(csv, `${slug}-${csvDateStamp()}.csv`);
}
