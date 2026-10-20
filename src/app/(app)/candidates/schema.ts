import { z } from "zod";
import {
  CANDIDATE_STATUSES,
  CLEARANCE_LEVELS,
  MILITARY_BRANCHES,
} from "@/lib/db/constants";

// Schema is intentionally transform-free so Zod's input and output types
// match. This keeps React Hook Form happy (its `TTransformedValues` generic
// defaults to `TFieldValues`).

const optionalText = z.string().trim().max(500);

const optionalEmail = z.union([
  z.string().trim().email("Invalid email"),
  z.literal(""),
]);

const branchOrEmpty = z.union([
  z.enum(MILITARY_BRANCHES),
  z.literal(""),
]);

const clearanceOrEmpty = z.union([
  z.enum(CLEARANCE_LEVELS),
  z.literal(""),
]);

const yearsOfService = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || (/^\d+(\.\d)?$/.test(v) && Number(v) <= 60),
    "Must be a number between 0 and 60",
  );

export const candidateFormSchema = z.object({
  first_name: z.string().trim().min(1, "Required").max(120),
  last_name: z.string().trim().min(1, "Required").max(120),
  email: optionalEmail,
  phone: optionalText,
  military_branch: branchOrEmpty,
  rank: optionalText,
  mos_or_specialty: optionalText,
  clearance: clearanceOrEmpty,
  years_of_service: yearsOfService,
  target_industry: optionalText,
  target_location: optionalText,
  status: z.enum(CANDIDATE_STATUSES),
  source: optionalText,
  tags: z.string(),
  marketing_consent: z.boolean(),
  linkedin: z.union([z.string().trim().url("Enter a valid URL"), z.literal("")]),
  resume_url: z.string().trim().max(500),
});

export type CandidateFormValues = z.infer<typeof candidateFormSchema>;

export const candidateFormDefaults: CandidateFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  military_branch: "",
  rank: "",
  mos_or_specialty: "",
  clearance: "",
  years_of_service: "",
  target_industry: "",
  target_location: "",
  status: "New",
  source: "",
  tags: "",
  marketing_consent: false,
  linkedin: "",
  resume_url: "",
};

// Convert form values → DB insert/update shape.
export function toDbPayload(values: CandidateFormValues) {
  const tagsArray = values.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    email: values.email.trim() || null,
    phone: values.phone.trim() || null,
    military_branch: values.military_branch || null,
    rank: values.rank.trim() || null,
    mos_or_specialty: values.mos_or_specialty.trim() || null,
    clearance: values.clearance || null,
    years_of_service:
      values.years_of_service === "" ? null : Number(values.years_of_service),
    target_industry: values.target_industry.trim() || null,
    target_location: values.target_location.trim() || null,
    status: values.status,
    source: values.source.trim() || null,
    tags: tagsArray,
    marketing_consent: values.marketing_consent,
    linkedin: values.linkedin.trim() || null,
    resume_url: values.resume_url.trim() || null,
  };
}
