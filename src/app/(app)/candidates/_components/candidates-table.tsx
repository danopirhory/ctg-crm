import Link from "next/link";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { CandidateBoardData } from "@/lib/db/queries";

import { StatusBadge } from "../../_components/status-badge";

// Flat alternative to the kanban: every active candidate on one page
// with their matched roles. Same data payload as the board, so the
// toggle is free.
export function CandidatesTable({ data }: { data: CandidateBoardData }) {
  const jobTitlesByCandidate = new Map<string, string[]>();
  for (const job of data.jobs) {
    for (const cid of job.matched_candidate_ids) {
      const list = jobTitlesByCandidate.get(cid) ?? [];
      list.push(job.title);
      jobTitlesByCandidate.set(cid, list);
    }
  }

  const rows = [...data.candidates].sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(
      `${b.last_name} ${b.first_name}`,
    ),
  );

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Matched roles</TableHead>
            <TableHead className="hidden sm:table-cell">Resume</TableHead>
            <TableHead className="hidden lg:table-cell">Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                No active candidates.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((c) => {
              const jobs = jobTitlesByCandidate.get(c.id) ?? [];
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/candidates/${c.id}`}
                      className="hover:underline"
                    >
                      {c.first_name} {c.last_name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {c.email ?? "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {jobs.length === 0 ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {jobs.map((t, i) => (
                          <Badge
                            key={`${c.id}-${i}`}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {t}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {c.resume_url ? (
                      <FileText
                        className="size-4 text-emerald-600 dark:text-emerald-400"
                        aria-label="Resume on file"
                      />
                    ) : (
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        None
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {c.target_location ?? "-"}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
