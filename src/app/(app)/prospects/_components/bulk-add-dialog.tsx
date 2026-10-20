"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { ProspectListKind } from "@/lib/db/constants";

import { useCanWrite } from "../../_components/role-context";
import { addProspectsToList } from "../actions";
import { parseExcelToTSV } from "../_lib/parse-excel";

const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring";

const KIND_HINT: Record<
  ProspectListKind,
  { columns: string; placeholder: string }
> = {
  Candidate: {
    columns: "First, Last, Email, Phone, Title, Company, Location",
    placeholder:
      "Jordan, Reyes, jordan@example.com\n" +
      "Sam, Khan, sam@example.com, , Director, Acme\n" +
      "Riley, Chen",
  },
  Company: {
    columns:
      "Company Name, Industry, Contact First, Contact Last, Email, Phone, Location, Hiring Needs",
    placeholder:
      "Acme Robotics, Manufacturing, Pat, Recruiter, pat@example.com, , Austin TX, 3 ops leads\n" +
      "Example Aerospace, Aerospace & Defense, , , , , Denver CO, Cleared PMs\n" +
      "Sample Fintech Co, Fintech, Sam, Khan, sam@example.com",
  },
};

export function BulkAddDialog({
  listId,
  listKind,
}: {
  listId: string;
  listKind: ProspectListKind;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [parsing, setParsing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!canWrite) return null;

  const isCompany = listKind === "Company";
  const hint = KIND_HINT[listKind];

  // Live row count - mirrors the kind-aware logic in the new-list form.
  const usableRowCount = pasted
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (
        /\b(first|last|name|email|phone|company|title|location|industry|needs)\b/i.test(
          l,
        ) &&
        pasted.startsWith(l)
      ) {
        return false;
      }
      const parts = l.split(/[\t,]/).map((p) => p.trim());
      if (isCompany) return Boolean(parts[0]);
      return Boolean(parts[0] || parts[1]);
    }).length;

  function reset() {
    setPasted("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleExcelFile(file: File) {
    setParsing(true);
    try {
      const { tsv, rowCount, skipped, headerDetected } =
        await parseExcelToTSV(file, listKind);
      if (rowCount === 0) {
        toast.error("No usable rows found in the file.");
        return;
      }
      setPasted((prev) => (prev.trim() ? `${prev.trimEnd()}\n${tsv}` : tsv));
      const parts = [`Parsed ${rowCount} row${rowCount === 1 ? "" : "s"}`];
      if (headerDetected) parts.push("header detected");
      if (skipped > 0) parts.push(`${skipped} skipped`);
      toast.success(parts.join(" · "));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Failed to parse: ${e.message}`
          : "Failed to parse Excel file.",
      );
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const r = await addProspectsToList(listId, pasted);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const noun = isCompany ? "companies" : "prospects";
      const singular = isCompany ? "company" : "prospect";
      toast.success(
        `Added ${r.inserted} ${r.inserted === 1 ? singular : noun}.`,
      );
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="size-4" aria-hidden />
          Bulk add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Bulk-add {isCompany ? "companies" : "prospects"} to this list
          </DialogTitle>
          <DialogDescription>
            Paste rows or upload an Excel file. New {isCompany ? "companies" : "prospects"} inherit this
            list&apos;s consent confirmation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              One row per line - {hint.columns}.
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleExcelFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || parsing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              {parsing ? "Parsing…" : "Upload Excel"}
            </Button>
          </div>
          <textarea
            rows={10}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={hint.placeholder}
            disabled={isPending}
            className={textareaClass}
          />
          <p className="text-xs text-muted-foreground">
            {usableRowCount > 0
              ? `${usableRowCount} usable row${usableRowCount === 1 ? "" : "s"} detected.`
              : "No usable rows yet."}
          </p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || usableRowCount === 0}
            >
              {isPending
                ? "Adding…"
                : `Add ${usableRowCount} to list`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
