"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { INVOICE_STATUSES } from "@/lib/db/constants";
import type {
  CandidatePickerOption,
  JobPickerOption,
} from "@/lib/db/queries";

import {
  placementFormSchema,
  type PlacementFormValues,
} from "../schema";
import { createPlacement, updatePlacement } from "../actions";

type Props =
  | {
      mode: "create";
      placementId?: undefined;
      candidates: CandidatePickerOption[];
      jobs: JobPickerOption[];
      defaultValues: PlacementFormValues;
    }
  | {
      mode: "edit";
      placementId: string;
      candidates: CandidatePickerOption[];
      jobs: JobPickerOption[];
      defaultValues: PlacementFormValues;
    };

export function PlacementForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<PlacementFormValues>({
    resolver: zodResolver(placementFormSchema),
    defaultValues: props.defaultValues,
  });

  // When the user picks a job, auto-populate company_id from the job's
  // parent. We display the resulting company name for confirmation but the
  // user doesn't pick it separately - it's always implied by the job.
  function onJobChange(jobId: string) {
    form.setValue("job_id", jobId, { shouldValidate: true });
    const job = props.jobs.find((j) => j.id === jobId);
    if (job) {
      form.setValue("company_id", job.company_id, { shouldValidate: true });
    } else {
      form.setValue("company_id", "");
    }
  }

  const selectedJobId = useWatch({ control: form.control, name: "job_id" });
  const selectedJob = props.jobs.find((j) => j.id === selectedJobId);

  function onSubmit(values: PlacementFormValues) {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createPlacement(values)
          : await updatePlacement(props.placementId, values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        props.mode === "create"
          ? "Placement created."
          : "Placement updated.",
      );
      router.push(`/placements/${result.id}`);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        {/* Who + what */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="candidate_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Candidate</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a candidate…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.candidates.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No candidates yet.
                      </div>
                    ) : (
                      props.candidates.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.first_name} {c.last_name}
                          {c.email ? ` - ${c.email}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="job_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job</FormLabel>
                <Select value={field.value} onValueChange={onJobChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a job…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.jobs.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No jobs yet.
                      </div>
                    ) : (
                      props.jobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.title}
                          {j.company_name ? ` - ${j.company_name}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Company is set automatically from the selected job.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Hidden company_id - derived from job. Render a tiny readout. */}
          <FormField
            control={form.control}
            name="company_id"
            render={({ field }) => (
              <input type="hidden" {...field} />
            )}
          />
          <div className="sm:col-span-2 -mt-2 text-xs text-muted-foreground">
            Company:{" "}
            {selectedJob?.company_name ?? (
              <span className="italic">pick a job</span>
            )}
          </div>
        </section>

        {/* Dates + invoice */}
        <section className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="placement_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Placement date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="guarantee_end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Guarantee end date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="invoice_status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INVOICE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Financials */}
        <section className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="starting_salary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starting salary (USD)</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    placeholder="e.g. 125000"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fee_percentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee percentage</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 20 (means 20%)"
                    {...field}
                  />
                </FormControl>
                <FormDescription>0-100; used only if no flat fee.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="flat_fee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Flat fee (USD)</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    placeholder="e.g. 10000"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Takes precedence over salary × fee %.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Saving…"
              : props.mode === "create"
                ? "Create placement"
                : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
