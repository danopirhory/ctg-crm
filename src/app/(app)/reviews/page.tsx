import Link from "next/link";
import { FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { listReviewSnapshots } from "@/lib/db/queries";

import { PageHeader } from "../_components/page-header";
import { DeleteSnapshotButton } from "./_components/delete-snapshot-button";
import { ErrorState } from "../_components/states";
import { formatDateTime } from "@/lib/date-format";

type SearchParams = Promise<{ q?: string; companyId?: string }>;

export default async function ReviewsLibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { data: snapshots, error } = await listReviewSnapshots({
    q: sp.q,
    companyId: sp.companyId,
  });

  return (
    <>
      <PageHeader
        title="Review snapshots"
        description="Immutable, citable versions of company review documents. Take a snapshot from any company's Candidate Review page; it will appear here forever."
      />

      {error ? (
        <ErrorState message={error} />
      ) : snapshots.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <FileText
              className="mx-auto mb-2 size-6 text-muted-foreground/50"
              aria-hidden
            />
            No snapshots yet. Open any company&apos;s{" "}
            <strong>Candidate Review</strong> page and click{" "}
            <strong>Snapshot</strong> to save the first one.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="hidden sm:table-cell">Scope</TableHead>
                <TableHead className="hidden md:table-cell">Model</TableHead>
                <TableHead className="hidden md:table-cell">By</TableHead>
                <TableHead>Taken</TableHead>
                <TableHead className="w-10" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/reviews/${s.id}`}
                      className="hover:underline"
                    >
                      {s.company_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.label ?? (
                      <span className="text-xs italic text-muted-foreground">
                        unlabeled
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">
                    {s.candidate_count} candidate
                    {s.candidate_count === 1 ? "" : "s"} ·{" "}
                    {s.job_count} job{s.job_count === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {s.ai_model ?? "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {s.taken_by_name ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(s.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteSnapshotButton
                      snapshotId={s.id}
                      snapshotLabel={s.label}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
