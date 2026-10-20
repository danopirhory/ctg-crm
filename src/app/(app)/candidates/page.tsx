import Link from "next/link";
import { Download, Kanban, TableProperties } from "lucide-react";

import { Button } from "@/components/ui/button";

import { getCandidateBoardData } from "@/lib/db/queries";

import { PageHeader } from "../_components/page-header";
import { CandidatesKanban } from "./_components/candidates-kanban";
import { CandidatesTable } from "./_components/candidates-table";

// Kanban-style workspace for candidates. Three fixed columns
// (Prospects / Pipeline / Placements) plus a column per active job so
// recruiters can match candidates by drag-and-drop. Cards click through
// to the existing detail pages for full editing.
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "board";
  const data = await getCandidateBoardData();

  return (
    <>
      <PageHeader
        title="Candidate Pipeline"
        description={
          view === "board"
            ? "Drag prospects into Pipeline, then between Pipeline, Placements, and active job columns."
            : "Every active candidate with their matched roles. Switch to Board to drag."
        }
        actions={
          <>
            <div className="flex items-center rounded-md border p-0.5">
              <Button
                asChild
                size="sm"
                variant={view === "board" ? "default" : "ghost"}
                className="h-7 px-2"
              >
                <Link href="/candidates">
                  <Kanban className="size-4" aria-hidden />
                  Board
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant={view === "table" ? "default" : "ghost"}
                className="h-7 px-2"
              >
                <Link href="/candidates?view=table">
                  <TableProperties className="size-4" aria-hidden />
                  Table
                </Link>
              </Button>
            </div>
            <Button variant="outline" asChild>
              {/* Plain <a>: this is a file download (route handler with
                  Content-Disposition), not a page navigation - <Link>
                  would prefetch and regenerate the CSV on hover. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/candidates/export">
                <Download className="size-4" aria-hidden />
                Export CSV
              </a>
            </Button>
            {/* No "New candidate" button: candidates enter the pipeline
                from the Leads tab (or the intake form), never directly. */}
          </>
        }
      />

      {view === "table" ? (
        <CandidatesTable data={data} />
      ) : (
        <CandidatesKanban data={data} />
      )}
    </>
  );
}
