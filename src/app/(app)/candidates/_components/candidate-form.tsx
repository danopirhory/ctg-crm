"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

import {
  CANDIDATE_STATUSES,
  CLEARANCE_LEVELS,
  MILITARY_BRANCHES,
} from "@/lib/db/constants";
import {
  candidateFormDefaults,
  candidateFormSchema,
  type CandidateFormValues,
} from "../schema";
import { createCandidate, updateCandidate } from "../actions";
import type { DuplicateHit } from "@/lib/db/dedupe";
import { updateProspectAsCandidate } from "../../prospects/actions";
import { ResumeUpload } from "./resume-upload";

type Props =
  | { mode: "create"; defaultValues?: undefined; candidateId?: undefined }
  | {
      mode: "edit";
      candidateId: string;
      defaultValues: CandidateFormValues;
    }
  | {
      mode: "prospect-edit";
      prospectId: string;
      listId: string;
      defaultValues: CandidateFormValues;
    };

export function CandidateForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CandidateFormValues>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues:
      props.mode === "create" ? candidateFormDefaults : props.defaultValues,
  });

  function onSubmit(values: CandidateFormValues) {
    startTransition(async () => {
      let result:
        | { ok: true; id: string }
        | { ok: false; error: string; duplicates?: DuplicateHit[] };
      let successMsg: string;
      let redirect: string;
      if (props.mode === "create") {
        result = await createCandidate(values);
        // Duplicate email found - surface who it collides with and let
        // the recruiter decide. Confirming resubmits with the override.
        if (!result.ok && result.duplicates?.length) {
          const lines = result.duplicates
            .map(
              (d) =>
                `• ${d.name} (${d.kind}${d.detail ? ` - ${d.detail}` : ""})`,
            )
            .join("\n");
          const proceed = confirm(
            `This email is already in the CRM:\n\n${lines}\n\nCreate a separate candidate anyway?`,
          );
          if (!proceed) return;
          result = await createCandidate(values, { allowDuplicate: true });
        }
        successMsg = "Candidate created.";
        redirect = result.ok ? `/candidates/${result.id}` : "";
      } else if (props.mode === "edit") {
        result = await updateCandidate(props.candidateId, values);
        successMsg = "Candidate updated.";
        redirect = result.ok ? `/candidates/${result.id}` : "";
      } else {
        result = await updateProspectAsCandidate(props.prospectId, values);
        successMsg = "Prospect updated.";
        redirect = result.ok
          ? `/prospects/${props.listId}/${props.prospectId}`
          : "";
      }

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMsg);
      router.push(redirect);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        {/* Identity */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First name</FormLabel>
                <FormControl>
                  <Input autoComplete="given-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input autoComplete="family-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" autoComplete="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Military background */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="military_branch"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Military branch</FormLabel>
                <Select
                  value={field.value || "_unset"}
                  onValueChange={(v) => field.onChange(v === "_unset" ? "" : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="_unset">- None / Unknown -</SelectItem>
                    {MILITARY_BRANCHES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rank"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rank</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. E-7, O-3" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mos_or_specialty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>MOS / Specialty</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="years_of_service"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Years of service</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 8 or 12.5"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="clearance"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Clearance</FormLabel>
                <Select
                  value={field.value || "_unset"}
                  onValueChange={(v) => field.onChange(v === "_unset" ? "" : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select clearance" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="_unset">- None / Unknown -</SelectItem>
                    {CLEARANCE_LEVELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Target + pipeline */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="target_industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target industry</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Aerospace, Cybersecurity" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="target_location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target location</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Austin, TX or Remote" {...field} />
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
                <FormLabel>Pipeline status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CANDIDATE_STATUSES.map((s) => (
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
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Referral, LinkedIn, Job fair" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Tags</FormLabel>
                <FormControl>
                  <Input placeholder="comma-separated, e.g. veteran, cleared, remote-ok" {...field} />
                </FormControl>
                <FormDescription>
                  Separate multiple tags with commas.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* LinkedIn */}
        <FormField
          control={form.control}
          name="linkedin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>LinkedIn</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder="https://linkedin.com/in/username"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Resume */}
        <FormField
          control={form.control}
          name="resume_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Resume</FormLabel>
              <FormControl>
                <ResumeUpload
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Consent */}
        <FormField
          control={form.control}
          name="marketing_consent"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(Boolean(v))}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Marketing email consent</FormLabel>
                <FormDescription>
                  Candidate agreed to receive marketing emails (CRM campaigns).
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Saving…"
              : props.mode === "create"
                ? "Create candidate"
                : "Save changes"}
          </Button>
          {props.mode === "prospect-edit" ? (
            <span className="ml-3 self-center text-xs text-muted-foreground">
              Editing a prospect - pipeline status comes into play after
              conversion.
            </span>
          ) : null}
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
