import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { listCampaigns } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/date-format";

import { PageHeader } from "../_components/page-header";
import { ErrorState } from "../_components/states";
import { StatusBadge } from "../_components/status-badge";
import { RoleGate } from "../_components/role-gate";
import { DeleteCampaignButton } from "./_components/delete-campaign-button";

export default async function CampaignsPage() {
  const { data: campaigns, error } = await listCampaigns();

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Mass email to your lead lists, delivered via Resend. Consent-filtered, unsubscribe-compliant, opens and clicks tracked."
        actions={
          <RoleGate allow={["Admin", "Recruiter"]}>
            <Button asChild>
              <Link href="/campaigns/new">
                <Plus className="size-4" aria-hidden />
                New campaign
              </Link>
            </Button>
          </RoleGate>
        }
      />

      {error ? (
        <ErrorState message={error} />
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaigns yet. Click <strong>New campaign</strong>, pick a lead
            list, and compose your first send.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="hidden sm:table-cell">List</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell tabular-nums">
                  Recipients
                </TableHead>
                <TableHead className="hidden md:table-cell tabular-nums">
                  Sent
                </TableHead>
                <TableHead className="hidden lg:table-cell">When</TableHead>
                <TableHead className="w-10" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground sm:hidden">
                      {c.list_name ?? "-"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {c.list_name ?? "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm tabular-nums">
                    {c.total_recipients || "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm tabular-nums">
                    {c.status === "Draft" ? "-" : c.sent_count}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                    {c.sent_at
                      ? formatDateTime(c.sent_at)
                      : `Created ${formatDateTime(c.created_at)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteCampaignButton
                      campaignId={c.id}
                      campaignName={c.name}
                      status={c.status}
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
