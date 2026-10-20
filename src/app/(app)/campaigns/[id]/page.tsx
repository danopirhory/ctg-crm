import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  countMailableRecipients,
  getCampaign,
  listEmailTemplates,
  listProspectLists,
} from "@/lib/db/queries";
import { getMailer } from "@/lib/email/mailer";
import { formatDateTime } from "@/lib/date-format";

import { PageHeader } from "../../_components/page-header";
import { ErrorState } from "../../_components/states";
import { StatusBadge } from "../../_components/status-badge";
import { CampaignComposer } from "../_components/campaign-composer";
import { SendCampaignPanel } from "../_components/send-campaign-panel";
import { DeleteCampaignButton } from "../_components/delete-campaign-button";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {value.toLocaleString()}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: campaign, error } = await getCampaign(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Campaign"
          actions={
            <Button variant="outline" asChild>
              <Link href="/campaigns">Back</Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }
  if (!campaign) notFound();

  const isDraft = campaign.status === "Draft";

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={
          <span className="flex items-center gap-2 text-xs">
            <StatusBadge value={campaign.status} />
            {campaign.list_name ? <span>List: {campaign.list_name}</span> : null}
            {campaign.sent_at ? (
              <span>Sent {formatDateTime(campaign.sent_at)}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/campaigns">Back</Link>
            </Button>
            {!isDraft ? (
              <DeleteCampaignButton
                campaignId={campaign.id}
                campaignName={campaign.name}
                status={campaign.status}
                variant="label"
              />
            ) : null}
          </>
        }
      />

      {isDraft ? (
        <DraftView campaignId={id} campaign={campaign} />
      ) : (
        <>
          <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Recipients" value={campaign.total_recipients} />
            <Stat
              label="Delivered"
              value={
                campaign.stats.delivered +
                campaign.stats.opened +
                campaign.stats.clicked
              }
            />
            <Stat
              label="Opened"
              value={campaign.stats.opened + campaign.stats.clicked}
            />
            <Stat label="Clicked" value={campaign.stats.clicked} />
          </section>
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat label="Bounced" value={campaign.stats.bounced} />
            <Stat label="Unsubscribed" value={campaign.stats.unsubscribed} />
            <Stat
              label="Spam complaints"
              value={campaign.stats.complained}
            />
          </section>
          <Card className="mt-6">
            <CardContent className="py-4 text-xs text-muted-foreground">
              Delivered / opened / clicked update live as Resend webhooks
              arrive. Bounces and complaints are auto-added to the
              suppression list so those addresses are never mailed again.
              <div className="mt-2 whitespace-pre-line">
                {`Subject: ${campaign.subject}\n\n${campaign.body}`}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

async function DraftView({
  campaignId,
  campaign,
}: {
  campaignId: string;
  campaign: {
    name: string;
    list_id: string | null;
    recipient_prospect_ids: string[] | null;
    subject: string;
    body: string;
    from_name: string;
    reply_to: string | null;
    attachments: { path: string; filename: string; size: number }[];
  };
}) {
  const selectionIds = campaign.recipient_prospect_ids ?? null;
  const [{ data: lists }, { data: templates }, counts] = await Promise.all([
    listProspectLists({}),
    listEmailTemplates(),
    selectionIds?.length
      ? countMailableRecipients({ prospectIds: selectionIds })
      : campaign.list_id
        ? countMailableRecipients({ listId: campaign.list_id })
        : Promise.resolve({
            data: { mailable: 0, suppressed: 0, noConsent: 0 },
            error: null,
          }),
  ]);

  const mailer = getMailer();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <CampaignComposer
        mode="edit"
        campaignId={campaignId}
        initial={{
          name: campaign.name,
          list_id: campaign.list_id ?? "",
          subject: campaign.subject,
          body: campaign.body,
          from_name: campaign.from_name,
          reply_to: campaign.reply_to ?? "",
          attachments: campaign.attachments,
        }}
        lists={lists.map((l) => ({
          id: l.id,
          name: l.name,
          count: l.prospect_count,
        }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body: t.body,
        }))}
        selectionCount={selectionIds?.length}
      />
      <div>
        <SendCampaignPanel
          campaignId={campaignId}
          mailable={counts.data.mailable}
          suppressed={counts.data.suppressed}
          noConsent={counts.data.noConsent}
          configured={mailer.ok}
          configError={mailer.ok ? null : mailer.error}
        />
      </div>
    </div>
  );
}
