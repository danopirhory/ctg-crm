import { z } from "zod";
import { COMPANY_STATUSES } from "@/lib/db/constants";

const shortText = z.string().trim().max(500);
const longText = z.string().trim().max(5000);
const optionalEmail = z.union([
  z.string().trim().email("Invalid email"),
  z.literal(""),
]);

// String-form numeric inputs so the form (RHF) handles them without
// having to coerce on every keystroke - converted to numbers in
// toDbPayload below.
const moneyField = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{0,2})?$/.test(v), "Must be a number")
  .refine((v) => v === "" || Number(v) <= 10_000_000, "Number is too large");

const percentField = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine(
    (v) => v === "" || (Number(v) >= 0 && Number(v) <= 100),
    "Must be between 0 and 100",
  );

export const COMPENSATION_TYPES = ["Flat", "Percent"] as const;
export type CompensationType = (typeof COMPENSATION_TYPES)[number];

export const companyFormSchema = z.object({
  company_name: z.string().trim().min(1, "Required").max(200),
  contact_name: shortText,
  contact_email: optionalEmail,
  contact_phone: shortText,
  industry: shortText,
  location: shortText,
  hiring_needs: longText,
  status: z.enum(COMPANY_STATUSES),
  notes: longText,
  compensation_type: z.enum(COMPENSATION_TYPES),
  compensation_flat_fee: moneyField,
  compensation_fee_percentage: percentField,
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

export const companyFormDefaults: CompanyFormValues = {
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  industry: "",
  location: "",
  hiring_needs: "",
  status: "Prospect",
  notes: "",
  compensation_type: "Flat",
  compensation_flat_fee: "0",
  compensation_fee_percentage: "0",
};

export function toDbPayload(v: CompanyFormValues) {
  return {
    company_name: v.company_name.trim(),
    contact_name: v.contact_name.trim() || null,
    contact_email: v.contact_email.trim() || null,
    contact_phone: v.contact_phone.trim() || null,
    industry: v.industry.trim() || null,
    location: v.location.trim() || null,
    hiring_needs: v.hiring_needs.trim() || null,
    status: v.status,
    notes: v.notes.trim() || null,
    compensation_type: v.compensation_type,
    compensation_flat_fee:
      v.compensation_flat_fee === "" ? 0 : Number(v.compensation_flat_fee),
    compensation_fee_percentage:
      v.compensation_fee_percentage === ""
        ? 0
        : Number(v.compensation_fee_percentage),
  };
}
