// Client-only Excel-to-TSV parser. Runs in the browser via dynamic import so
// the ~100 KB read-excel-file bundle isn't loaded until the user actually
// picks a file.

export type ParsedRow = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  company_name: string;
  industry: string;
  location: string;
  hiring_needs: string;
};

type Field = keyof ParsedRow;

// What kind of list the user is importing into determines the positional
// fallback when no recognized header is found. The actual server-side
// parser uses kind-aware positions too - see prospects/actions.ts.
export type ListKind = "Candidate" | "Company";

// Aliases people commonly use in spreadsheet headers. Case-insensitive.
const HEADER_ALIASES: Record<string, Field> = {
  "first name": "first_name",
  firstname: "first_name",
  first_name: "first_name",
  first: "first_name",
  "given name": "first_name",
  fname: "first_name",

  "last name": "last_name",
  lastname: "last_name",
  last_name: "last_name",
  last: "last_name",
  surname: "last_name",
  "family name": "last_name",
  lname: "last_name",

  email: "email",
  "email address": "email",
  "e-mail": "email",
  "e mail": "email",

  phone: "phone",
  "phone number": "phone",
  tel: "phone",
  telephone: "phone",
  mobile: "phone",
  cell: "phone",

  title: "title",
  "job title": "title",
  position: "title",
  role: "title",

  company: "company_name",
  "company name": "company_name",
  organization: "company_name",
  organisation: "company_name",
  employer: "company_name",
  account: "company_name",

  location: "location",
  city: "location",
  address: "location",
  "city, state": "location",
  region: "location",

  // Company-kind extras.
  industry: "industry",
  sector: "industry",
  vertical: "industry",

  "hiring needs": "hiring_needs",
  hiring: "hiring_needs",
  needs: "hiring_needs",
  "open roles": "hiring_needs",
  notes: "hiring_needs",

  // Contact-* (Company-kind) aliases map onto first/last for the contact.
  "contact name": "first_name",
  "contact first": "first_name",
  "contact last": "last_name",
  "contact email": "email",
  "contact phone": "phone",
  contact: "first_name",
};

// Positional fallback when no header is detected. Differs by kind.
const POSITIONAL_CANDIDATE: Field[] = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "title",
  "company_name",
  "location",
];
const POSITIONAL_COMPANY: Field[] = [
  "company_name",
  "industry",
  "first_name",
  "last_name",
  "email",
  "phone",
  "location",
  "hiring_needs",
];

// Output TSV column order is positional-by-kind so the existing server-side
// parser reads it back identically.
const OUTPUT_CANDIDATE: Field[] = POSITIONAL_CANDIDATE;
const OUTPUT_COMPANY: Field[] = POSITIONAL_COMPANY;

function normalizeCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export type ParseResult = {
  tsv: string;
  rowCount: number;
  headerDetected: boolean;
  skipped: number;
};

/**
 * Parse an .xlsx/.xls file (first sheet) into a TSV string ready to drop into
 * the bulk-import textarea. Detects a header row by matching aliases; falls
 * back to positional column order otherwise.
 *
 * Throws if the file is unreadable. Returns `rowCount = 0` for empty sheets.
 */
export async function parseExcelToTSV(
  file: File,
  kind: ListKind = "Candidate",
): Promise<ParseResult> {
  // Dynamic import keeps the ~100KB lib out of the initial bundle.
  // read-excel-file only exposes sub-path entries; /browser is the right one
  // for client-side .xlsx parsing.
  const { default: readXlsxFile } = await import("read-excel-file/browser");

  // read-excel-file v9 returns Sheet[] shaped as
  // [{ sheet: "Sheet1", data: Cell[][] }, ...]. Older versions returned the
  // rows directly as Cell[][]. Handle both - we only ever want the first
  // sheet's rows.
  const result = (await readXlsxFile(file)) as unknown;
  let rows: unknown[][] = [];
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (Array.isArray(first)) {
      // Legacy shape: array of row arrays.
      rows = result as unknown[][];
    } else if (
      first &&
      typeof first === "object" &&
      Array.isArray((first as { data?: unknown }).data)
    ) {
      // v9 shape: array of { sheet, data } objects.
      rows = (first as { data: unknown[][] }).data;
    }
  }

  if (rows.length === 0) {
    return { tsv: "", rowCount: 0, headerDetected: false, skipped: 0 };
  }

  // Defensive: bail with a clear message instead of crashing if some future
  // version changes shape again.
  if (!Array.isArray(rows[0])) {
    throw new Error(
      "Unexpected parser output. The Excel file may be empty or corrupted.",
    );
  }

  // Try to detect a header row in row 0.
  const headerCells = (rows[0] as unknown[]).map((c) =>
    normalizeCell(c).toLowerCase(),
  );
  const headerMapping: (Field | null)[] = headerCells.map(
    (h) => HEADER_ALIASES[h] ?? null,
  );
  const headerDetected = headerMapping.some((c) => c !== null);

  const positional =
    kind === "Company" ? POSITIONAL_COMPANY : POSITIONAL_CANDIDATE;
  const mapping: (Field | null)[] = headerDetected
    ? headerMapping
    : positional.map((p) => p as Field | null);
  const dataRows = headerDetected ? rows.slice(1) : rows;

  const parsed: ParsedRow[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const out: ParsedRow = {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      title: "",
      company_name: "",
      industry: "",
      location: "",
      hiring_needs: "",
    };
    const cap = Math.min(mapping.length, row.length);
    for (let i = 0; i < cap; i++) {
      const field = mapping[i];
      if (!field) continue;
      const val = normalizeCell(row[i]);
      if (val) out[field] = val.slice(0, 500);
    }
    // Per-kind required-field gate: skip rows missing the essential key.
    const missing =
      kind === "Company"
        ? !out.company_name
        : !out.first_name && !out.last_name;
    if (missing) {
      skipped += 1;
      continue;
    }
    parsed.push(out);
  }

  // Emit TSV in the canonical positional order for the chosen kind, so the
  // existing server-side parser reads it back identically.
  const output = kind === "Company" ? OUTPUT_COMPANY : OUTPUT_CANDIDATE;
  const tsv = parsed
    .map((p) => output.map((f) => p[f]).join("\t"))
    .join("\n");

  return { tsv, rowCount: parsed.length, headerDetected, skipped };
}
