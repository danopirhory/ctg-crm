import { z } from "zod";
import { INVOICE_STATUSES } from "@/lib/db/constants";

const numberField = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^\d+(\.\d+)?$/.test(v),
    "Must be a number",
  );

const optionalDate = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Invalid date",
  );

const requiredDate = z
  .string()
  .trim()
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Placement date is required",
  );

export const placementFormSchema = z.object({
  candidate_id: z.string().uuid("Pick a candidate"),
  job_id: z.string().uuid("Pick a job"),
  company_id: z.string().uuid("Pick a company"),
  placement_date: requiredDate,
  starting_salary: numberField,
  fee_percentage: numberField.refine(
    (v) => v === "" || Number(v) <= 100,
    "Must be 0-100",
  ),
  flat_fee: numberField,
  invoice_status: z.enum(INVOICE_STATUSES),
  guarantee_end_date: optionalDate,
});

export type PlacementFormValues = z.infer<typeof placementFormSchema>;

export const placementFormDefaults: PlacementFormValues = {
  candidate_id: "",
  job_id: "",
  company_id: "",
  placement_date: new Date().toISOString().slice(0, 10),
  starting_salary: "",
  fee_percentage: "",
  flat_fee: "",
  invoice_status: "Not Invoiced",
  guarantee_end_date: "",
};

export function toDbPayload(v: PlacementFormValues) {
  return {
    candidate_id: v.candidate_id,
    job_id: v.job_id,
    company_id: v.company_id,
    placement_date: v.placement_date,
    starting_salary: v.starting_salary === "" ? null : Number(v.starting_salary),
    fee_percentage: v.fee_percentage === "" ? null : Number(v.fee_percentage),
    flat_fee: v.flat_fee === "" ? null : Number(v.flat_fee),
    invoice_status: v.invoice_status,
    guarantee_end_date: v.guarantee_end_date || null,
  };
}
