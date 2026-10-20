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

import { COMPANY_STATUSES } from "@/lib/db/constants";
import {
  COMPENSATION_TYPES,
  companyFormDefaults,
  companyFormSchema,
  type CompanyFormValues,
} from "../schema";
import { createCompany, updateCompany } from "../actions";
import { updateProspectAsCompany } from "../../prospects/actions";

type Props =
  | { mode: "create"; companyId?: undefined; defaultValues?: undefined }
  | {
      mode: "edit";
      companyId: string;
      defaultValues: CompanyFormValues;
    }
  | {
      mode: "prospect-edit";
      prospectId: string;
      listId: string;
      defaultValues: CompanyFormValues;
    };

export function CompanyForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues:
      props.mode === "create" ? companyFormDefaults : props.defaultValues,
  });

  function onSubmit(values: CompanyFormValues) {
    startTransition(async () => {
      let result: { ok: true; id: string } | { ok: false; error: string };
      let successMsg: string;
      let redirect: string;
      if (props.mode === "create") {
        result = await createCompany(values);
        successMsg = "Company created.";
        redirect = result.ok ? `/companies/${result.id}` : "";
      } else if (props.mode === "edit") {
        result = await updateCompany(props.companyId, values);
        successMsg = "Company updated.";
        redirect = result.ok ? `/companies/${result.id}` : "";
      } else {
        result = await updateProspectAsCompany(props.prospectId, values);
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
            name="company_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company name</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
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
                    {COMPANY_STATUSES.map((s) => (
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

        {/* Contact */}
        <section className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="contact_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary contact</FormLabel>
                <FormControl>
                  <Input autoComplete="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact phone</FormLabel>
                <FormControl>
                  <Input type="tel" autoComplete="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Details */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Aerospace & Defense, Manufacturing"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
        </section>

        {/* Long text */}
        <FormField
          control={form.control}
          name="hiring_needs"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hiring needs</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="What roles is this company hiring for? Any specifics on volume, timing, or seniority?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Compensation - drives Invoicing auto-calculation. */}
        <section className="grid gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-[180px_1fr_1fr]">
          <FormField
            control={form.control}
            name="compensation_type"
            render={({ field }) => (
              <FormItem className="sm:col-span-3">
                <FormLabel>Compensation model</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COMPENSATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === "Flat" ? "Flat fee" : "Percent of salary"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Drives the auto-calculated invoice amount on the Invoicing
                  tab.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="compensation_flat_fee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Flat fee (USD)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="10000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="compensation_fee_percentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Percent of base salary (%)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="20" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="General overview of this company. Dated notes go in the timeline on the detail page."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Pinned to the profile. Add timestamped notes on the detail page.
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
                ? "Create company"
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
