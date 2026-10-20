import { getClientBoardData } from "@/lib/db/queries";

import { PageHeader } from "../_components/page-header";
import { CompaniesKanban } from "./_components/companies-kanban";

// Kanban-style companies workspace: company leads → company prospects
// → companies. Every company starts as a lead on the Leads tab, so
// there's no "New company" button here. Each company card has a
// quick-add-job button that creates an Open job - that job then
// becomes a column on the Candidate Pipeline board.
export default async function CompaniesPage() {
  const data = await getClientBoardData();
  return (
    <>
      <PageHeader
        title="Companies"
        description="Drag company leads into Company Prospects, then into Companies as they progress. Add jobs from a company card to create candidate buckets."
      />
      <CompaniesKanban data={data} />
    </>
  );
}
