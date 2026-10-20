import { notFound } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getCompany } from "@/lib/db/queries";
import { COMPANY_STATUSES } from "@/lib/db/constants";
import { PageHeader } from "../../../_components/page-header";
import { ErrorState } from "../../../_components/states";
import { CompanyForm } from "../../_components/company-form";
import type { CompanyFormValues } from "../../schema";

// Map DB row → form values. If the stored status is somehow outside the
// known set, fall back to Prospect so the form's Select renders something.
const statusValue = (v: string): CompanyFormValues["status"] =>
  (COMPANY_STATUSES as readonly string[]).includes(v)
    ? (v as CompanyFormValues["status"])
    : "Prospect";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: company, error } = await getCompany(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Edit company"
          actions={
            <Button variant="outline" asChild>
              <Link href="/companies">Back</Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }

  if (!company) notFound();

  const defaultValues: CompanyFormValues = {
    company_name: company.company_name,
    contact_name: company.contact_name ?? "",
    contact_email: company.contact_email ?? "",
    contact_phone: company.contact_phone ?? "",
    industry: company.industry ?? "",
    location: company.location ?? "",
    hiring_needs: company.hiring_needs ?? "",
    status: statusValue(company.status),
    notes: company.notes ?? "",
    compensation_type: company.compensation_type,
    compensation_flat_fee: String(company.compensation_flat_fee),
    compensation_fee_percentage: String(company.compensation_fee_percentage),
  };

  return (
    <>
      <PageHeader
        title={`Edit ${company.company_name}`}
        description="Update this company's profile."
      />
      <Card>
        <CardContent className="pt-6">
          <CompanyForm
            mode="edit"
            companyId={company.id}
            defaultValues={defaultValues}
          />
        </CardContent>
      </Card>
    </>
  );
}
