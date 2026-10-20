import { z } from "zod";
import { JOB_STATUSES } from "@/lib/db/constants";

const shortText = z.string().trim().max(500);
const longText = z.string().trim().max(10000);

const salaryField = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^\d+(\.\d+)?$/.test(v),
    "Must be a number",
  )
  .refine(
    (v) => v === "" || Number(v) <= 100_000_000,
    "Number is too large",
  );

export const jobFormSchema = z
  .object({
    company_id: z.string().uuid("Pick a company"),
    title: z.string().trim().min(1, "Required").max(200),
    location: shortText,
    salary_min: salaryField,
    salary_max: salaryField,
    job_type: shortText,
    description: longText,
    requirements: longText,
    status: z.enum(JOB_STATUSES),
  })
  .refine(
    (data) => {
      if (data.salary_min === "" || data.salary_max === "") return true;
      return Number(data.salary_min) <= Number(data.salary_max);
    },
    { message: "Max salary must be greater than or equal to min", path: ["salary_max"] },
  );

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const jobFormDefaults: JobFormValues = {
  company_id: "",
  title: "",
  location: "",
  salary_min: "",
  salary_max: "",
  job_type: "",
  description: "",
  requirements: "",
  status: "Open",
};

export function toDbPayload(v: JobFormValues) {
  return {
    company_id: v.company_id,
    title: v.title.trim(),
    location: v.location.trim() || null,
    salary_min: v.salary_min === "" ? null : Number(v.salary_min),
    salary_max: v.salary_max === "" ? null : Number(v.salary_max),
    job_type: v.job_type.trim() || null,
    description: v.description.trim() || null,
    requirements: v.requirements.trim() || null,
    status: v.status,
  };
}
