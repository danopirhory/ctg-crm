import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getProspectList, listProspectLists } from "@/lib/db/queries";

import { PageHeader } from "../../_components/page-header";
import { NewListForm } from "../_components/new-list-form";

export default async function NewProspectListPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const { parent: parentId } = await searchParams;

  // When creating a sub-list, resolve the parent so we can lock the kind
  // and show the context. Only top-level lists can be parents.
  const parent = parentId ? (await getProspectList(parentId)).data : null;
  const validParent = parent && !parent.parent_list_id ? parent : null;

  // Top-level lists available to nest under (used by the in-form parent
  // picker when not arriving with a ?parent= preset).
  const { data: allLists } = await listProspectLists({});
  const topLevelLists = allLists
    .filter((l) => !l.parent_list_id)
    .map((l) => ({ id: l.id, name: l.name, kind: l.kind }));

  return (
    <>
      <PageHeader
        title={validParent ? "New sub-list" : "New prospect list"}
        description={
          validParent
            ? `Nested under “${validParent.name}”. Paste a CSV/TSV of leads.`
            : "Paste a CSV/TSV of leads. They'll be reachable from Campaigns for mass email."
        }
        actions={
          validParent ? (
            <Button variant="outline" asChild>
              <Link href={`/prospects/${validParent.id}`}>Back to parent</Link>
            </Button>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="pt-6">
          <NewListForm
            topLevelLists={topLevelLists}
            presetParent={
              validParent
                ? { id: validParent.id, name: validParent.name, kind: validParent.kind }
                : null
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
