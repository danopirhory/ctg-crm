import { notFound } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getJob, listCompanyOptions } from "@/lib/db/queries";
import { JOB_STATUSES } from "@/lib/db/constants";
import { PageHeader } from "../../../_components/page-header";
import { ErrorState } from "../../../_components/states";
import { JobForm } from "../../_components/job-form";
import type { JobFormValues } from "../../schema";

const statusValue = (v: string): JobFormValues["status"] =>
  (JOB_STATUSES as readonly string[]).includes(v)
    ? (v as JobFormValues["status"])
    : "Open";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: job, error }, { data: companies }] = await Promise.all([
    getJob(id),
    listCompanyOptions(),
  ]);

  if (error) {
    return (
      <>
        <PageHeader
          title="Edit job"
          actions={
            <Button variant="outline" asChild>
              <Link href="/jobs">Back</Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }

  if (!job) notFound();

  const defaultValues: JobFormValues = {
    company_id: job.company_id,
    title: job.title,
    location: job.location ?? "",
    salary_min: job.salary_min == null ? "" : String(job.salary_min),
    salary_max: job.salary_max == null ? "" : String(job.salary_max),
    job_type: job.job_type ?? "",
    description: job.description ?? "",
    requirements: job.requirements ?? "",
    status: statusValue(job.status),
  };

  return (
    <>
      <PageHeader
        title={`Edit ${job.title}`}
        description={job.company?.company_name ?? "-"}
      />
      <Card>
        <CardContent className="pt-6">
          <JobForm
            mode="edit"
            jobId={job.id}
            companies={companies}
            defaultValues={defaultValues}
          />
        </CardContent>
      </Card>
    </>
  );
}
