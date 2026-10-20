import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";

import { getProspect, getProspectList } from "@/lib/db/queries";
import type {
  ClearanceLevel,
  MilitaryBranch,
} from "@/lib/db/constants";

import { PageHeader } from "../../../../_components/page-header";
import { ErrorState } from "../../../../_components/states";
import { CandidateForm } from "../../../../candidates/_components/candidate-form";
import { CompanyForm } from "../../../../companies/_components/company-form";

export default async function ProspectEditPage({
  params,
}: {
  params: Promise<{ id: string; prospectId: string }>;
}) {
  const { id: listId, prospectId } = await params;

  const [{ data: list, error: listError }, { data: prospect, error: pError }] =
    await Promise.all([getProspectList(listId), getProspect(prospectId)]);

  if (listError || pError) {
    return (
      <>
        <PageHeader
          title="Edit prospect"
          actions={
            <Button variant="outline" asChild>
              <Link href={`/prospects/${listId}/${prospectId}`}>Back</Link>
            </Button>
          }
        />
        <ErrorState message={listError ?? pError ?? "Failed to load."} />
      </>
    );
  }

  if (!list || !prospect || prospect.list_id !== listId) notFound();

  const fullName =
    [prospect.first_name, prospect.last_name].filter(Boolean).join(" ") ||
    prospect.company_name ||
    "Prospect";

  const backHref = `/prospects/${listId}/${prospectId}`;

  if (list.kind === "Company") {
    const contactName = [prospect.first_name, prospect.last_name]
      .filter(Boolean)
      .join(" ");
    return (
      <>
        <PageHeader
          title={`Edit - ${fullName}`}
          description={`${list.name} · Company list`}
          actions={
            <Button variant="outline" asChild>
              <Link href={backHref}>Back</Link>
            </Button>
          }
        />
        <CompanyForm
          mode="prospect-edit"
          prospectId={prospect.id}
          listId={list.id}
          defaultValues={{
            company_name: prospect.company_name ?? "",
            contact_name: contactName,
            contact_email: prospect.email ?? "",
            contact_phone: prospect.phone ?? "",
            industry: prospect.industry ?? "",
            location: prospect.location ?? "",
            hiring_needs: prospect.hiring_needs ?? "",
            status: "Prospect",
            notes: prospect.notes ?? "",
            // Prospects don't carry compensation yet - the row gets it on
            // promotion via the company table's defaults.
            compensation_type: "Flat",
            compensation_flat_fee: "0",
            compensation_fee_percentage: "0",
          }}
        />
      </>
    );
  }

  // Candidate-kind: same exact form candidates use.
  return (
    <>
      <PageHeader
        title={`Edit - ${fullName}`}
        description={`${list.name} · Candidate list`}
        actions={
          <Button variant="outline" asChild>
            <Link href={backHref}>Back</Link>
          </Button>
        }
      />
      <CandidateForm
        mode="prospect-edit"
        prospectId={prospect.id}
        listId={list.id}
        defaultValues={{
          first_name: prospect.first_name ?? "",
          last_name: prospect.last_name ?? "",
          email: prospect.email ?? "",
          phone: prospect.phone ?? "",
          military_branch: (prospect.military_branch ?? "") as
            | MilitaryBranch
            | "",
          rank: prospect.rank ?? "",
          mos_or_specialty: prospect.mos_or_specialty ?? "",
          clearance: (prospect.clearance ?? "") as ClearanceLevel | "",
          years_of_service:
            prospect.years_of_service != null
              ? String(prospect.years_of_service)
              : "",
          target_industry: prospect.industry ?? "",
          target_location: prospect.location ?? "",
          status: "New",
          source: prospect.source ?? list.source ?? "",
          tags: prospect.tags.join(", "),
          marketing_consent: prospect.marketing_consent,
          linkedin: prospect.linkedin ?? "",
          resume_url: prospect.resume_url ?? "",
        }}
      />
    </>
  );
}
