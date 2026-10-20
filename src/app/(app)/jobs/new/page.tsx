import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../../_components/page-header";
import { ErrorState } from "../../_components/states";
import { listCompanyOptions } from "@/lib/db/queries";
import { JobForm } from "../_components/job-form";
import { jobFormDefaults, type JobFormValues } from "../schema";

type SearchParams = Promise<{ company?: string }>;

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { data: companies, error } = await listCompanyOptions();

  // If we arrived from a company detail page (?company=<uuid>), pre-select it.
  const presetCompany = sp.company && companies.some((c) => c.id === sp.company)
    ? sp.company
    : "";

  const defaultValues: JobFormValues = {
    ...jobFormDefaults,
    company_id: presetCompany,
  };

  return (
    <>
      <PageHeader title="New job" description="Add a role to the pipeline." />
      <Card>
        <CardContent className="pt-6">
          {error ? (
            <ErrorState message={error} />
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You need to add a company first.{" "}
              <Link
                href="/companies/new"
                className="text-primary hover:underline"
              >
                Create a company
              </Link>
              .
            </p>
          ) : (
            <JobForm
              mode="create"
              companies={companies}
              defaultValues={defaultValues}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
