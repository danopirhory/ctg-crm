// Tiny CSV builder for the export endpoints. No dependency - the data
// volumes here (≤ a few thousand rows) never justify a streaming lib.

export type CsvColumn<Row> = {
  label: string;
  value: (row: Row) => string | number | boolean | null | undefined;
};

function escapeCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  // Quote when the cell contains a delimiter, quote, or newline.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((r) =>
    columns.map((c) => escapeCell(c.value(r))).join(","),
  );
  // CRLF + UTF-8 BOM so Excel opens it with correct encoding and breaks.
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function csvDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
