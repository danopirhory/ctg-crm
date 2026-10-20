"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

import { JOB_STATUSES } from "@/lib/db/constants";
import type { CompanyOption } from "@/lib/db/queries";

import { jobFormSchema, type JobFormValues } from "../schema";
import { createJob, updateJob } from "../actions";

type Props =
  | {
      mode: "create";
      jobId?: undefined;
      companies: CompanyOption[];
      defaultValues: JobFormValues;
    }
  | {
      mode: "edit";
      jobId: string;
      companies: CompanyOption[];
      defaultValues: JobFormValues;
    };

export function JobForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: props.defaultValues,
  });

  function onSubmit(values: JobFormValues) {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createJob(values)
          : await updateJob(props.jobId, values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        props.mode === "create" ? "Job created." : "Job updated.",
      );
      router.push(`/jobs/${result.id}`);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        {/* Identity */}
        <section className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Program Manager - Cleared"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {JOB_STATUSES.map((s) => (
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

        {/* Company + type */}
        <section className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <FormField
            control={form.control}
            name="company_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a company…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.companies.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No companies yet. Add one first.
                      </div>
                    ) : (
                      props.companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.company_name}
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
            name="job_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job type</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Full-time, Contract, Remote"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Location + salary */}
        <section className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Denver, CO or Remote"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="salary_min"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary - min (USD)</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" placeholder="e.g. 110000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="salary_max"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary - max (USD)</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" placeholder="e.g. 145000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder="What does this role involve? Team, scope, day-to-day."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="requirements"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requirements</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder="Must-have skills, clearances, certs, education, experience."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                One requirement per line works well for matching later.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Saving…"
              : props.mode === "create"
                ? "Create job"
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
