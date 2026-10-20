import Link from "next/link";

import { Button } from "@/components/ui/button";

import { listEmailTemplates, listProspectLists } from "@/lib/db/queries";

import { PageHeader } from "../../_components/page-header";
import { CampaignComposer } from "../_components/campaign-composer";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const sp = await searchParams;
  const [{ data: lists }, { data: templates }] = await Promise.all([
    listProspectLists({}),
    listEmailTemplates(),
  ]);
  // "Email list" from a lead-list page lands here with ?list=<id>.
  const preselected = lists.find((l) => l.id === sp.list)?.id ?? "";

  return (
    <>
      <PageHeader
        title="New campaign"
        description="Compose once; merge fields personalize each copy. Only contacts with an email and marketing consent receive it."
        actions={
          <Button variant="outline" asChild>
            <Link href="/campaigns">Back</Link>
          </Button>
        }
      />
      <CampaignComposer
        mode="create"
        initial={preselected ? { list_id: preselected } : undefined}
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
      />
    </>
  );
}
