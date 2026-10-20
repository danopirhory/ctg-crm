"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  PROSPECT_LIST_KINDS,
  type ProspectListKind,
} from "@/lib/db/constants";

import { createProspectList } from "../actions";
import { parseExcelToTSV } from "../_lib/parse-excel";

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring";

const KIND_HINT: Record<
  ProspectListKind,
  { columns: string; placeholder: string; help: string }
> = {
  Candidate: {
    columns:
      "First Name, Last Name, Email, Phone, Title, Company, Location",
    placeholder:
      "Jordan, Reyes, jordan@example.com, , Director, Acme Corp, Austin TX\n" +
      "Sam, Khan, sam@example.com\n" +
      "Riley, Chen, , , Manager, Example Aerospace",
    help: "Each row is an individual you'd contact about a role.",
  },
  Company: {
    columns:
      "Company Name, Industry, Contact First, Contact Last, Email, Phone, Location, Hiring Needs",
    placeholder:
      "Acme Robotics, Manufacturing, Pat, Recruiter, pat@example.com, , Austin TX, 3 ops leads\n" +
      "Example Aerospace, Aerospace & Defense, , , , , Denver CO, Cleared PMs\n" +
      "Sample Fintech Co, Fintech, Sam, Khan, sam@example.com",
    help: "Each row is a target company. Contact person is optional.",
  },
};

type TopLevelList = { id: string; name: string; kind: ProspectListKind };

const NO_PARENT = "__none__";

export function NewListForm({
  topLevelLists = [],
  presetParent = null,
}: {
  topLevelLists?: TopLevelList[];
  // When arriving from a parent list's "New sub-list" button, the parent
  // is fixed and the kind is locked to match it.
  presetParent?: TopLevelList | null;
} = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [kind, setKind] = useState<ProspectListKind>(
    presetParent?.kind ?? "Candidate",
  );
  const [parentId, setParentId] = useState<string>(
    presetParent?.id ?? NO_PARENT,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [pasted, setPasted] = useState("");
  const [consent, setConsent] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hint = KIND_HINT[kind];

  // Only same-kind top-level lists can be parents. Picking one locks the
  // kind to match (a Candidate sub-list can't live under a Company list).
  const parentOptions = topLevelLists.filter((l) => l.kind === kind);
  const kindLocked = Boolean(presetParent);

  // Live row count - uses positional split + the kind-aware required-field
  // rule (Candidate needs first OR last; Company needs company name).
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
      if (kind === "Company") return Boolean(parts[0]);
      return Boolean(parts[0] || parts[1]);
    }).length;

  async function handleExcelFile(file: File) {
    setParsing(true);
    try {
      const { tsv, rowCount, skipped, headerDetected } =
        await parseExcelToTSV(file, kind);
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
    if (!consent) {
      toast.error("Confirm lawful basis before saving.");
      return;
    }
    startTransition(async () => {
      const r = await createProspectList({
        name,
        description,
        source,
        kind,
        parent_list_id: parentId === NO_PARENT ? null : parentId,
        consent_confirmed: consent as true,
        pasted,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const noun = kind === "Company" ? "companies" : "prospects";
      const singular = kind === "Company" ? "company" : "prospect";
      toast.success(
        `List created with ${r.inserted} ${r.inserted === 1 ? singular : noun}.`,
      );
      router.push(`/prospects/${r.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      {/* List type - locked after creation */}
      <div className="grid gap-1">
        <label className="block text-sm font-medium" htmlFor="kind">
          List type
        </label>
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v as ProspectListKind);
            // Changing kind can invalidate the chosen parent.
            setParentId(NO_PARENT);
          }}
          disabled={isPending || kindLocked}
        >
          <SelectTrigger id="kind" className="w-full sm:w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROSPECT_LIST_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k === "Candidate"
                  ? "Candidate (individuals)"
                  : "Company (businesses)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{hint.help}</p>
        <p className="text-xs text-muted-foreground">
          {kindLocked
            ? "Type matches the parent list and is fixed."
            : "Type is fixed once the list is created."}
        </p>
      </div>

      {/* Parent list - nest this as a sub-list. Fixed when arriving from
          a parent's "New sub-list" button. */}
      {presetParent ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          Creating a sub-list under{" "}
          <span className="font-medium">{presetParent.name}</span>.
        </div>
      ) : parentOptions.length > 0 ? (
        <div className="grid gap-1">
          <label className="block text-sm font-medium" htmlFor="parent">
            Parent list{" "}
            <span className="text-muted-foreground">(optional)</span>
          </label>
          <Select
            value={parentId}
            onValueChange={setParentId}
            disabled={isPending}
          >
            <SelectTrigger id="parent" className="w-full sm:w-[360px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT}>None (top-level list)</SelectItem>
              {parentOptions.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Nest this under an existing {kind} list to keep related lists
            grouped.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="name">
            List name
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              kind === "Company"
                ? "e.g. Aerospace Hiring Targets Q1"
                : "e.g. LinkedIn Cybersecurity Q1"
            }
            required
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="source">
            Source <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. CSV export"
            disabled={isPending}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="description">
          Description <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's the campaign or strategy behind this list?"
          disabled={isPending}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium" htmlFor="pasted">
            Paste or upload {kind === "Company" ? "companies" : "prospects"}
          </label>
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
        <p className="mb-1 text-xs text-muted-foreground">
          One row per line. Columns separated by tab or comma. Order:
          <strong> {hint.columns}</strong>. Headers are optional and
          auto-detected.
        </p>
        <textarea
          id="pasted"
          rows={10}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={hint.placeholder}
          required
          disabled={isPending}
          className={`${inputClass} font-mono text-xs`}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {usableRowCount > 0
            ? `${usableRowCount} usable row${usableRowCount === 1 ? "" : "s"} detected.`
            : "No usable rows yet."}
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-md border bg-muted/30 p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 rounded border-input"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={isPending}
        />
        <span>
          I confirm I have a lawful basis (consent, legitimate interest, or
          B2B exemption) to contact these{" "}
          {kind === "Company" ? "companies" : "prospects"} on behalf of
          Command Talent Group. <span className="text-destructive">*</span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isPending || !consent || usableRowCount === 0}
        >
          {isPending ? "Saving…" : `Create list (${usableRowCount})`}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.push("/prospects")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
