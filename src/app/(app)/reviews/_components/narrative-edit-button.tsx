"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import { editCompanyNarrative, type NarrativePatch } from "../actions";

// Pencil button rendered inside a NarrativePanel header on the LIVE
// document only (snapshots are frozen). Bullets edit as one-per-line
// text; saving persists to the companies.review_* column and leaves
// the AI generated_at stamp alone.
export function NarrativeEditButton({
  companyId,
  field,
  title,
  initial,
}: {
  companyId: string;
  field: keyof NarrativePatch;
  title: string;
  initial: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(initial.join("\n"));
  const [isPending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const bullets = text
      .split("\n")
      .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
    startTransition(async () => {
      const r = await editCompanyNarrative(companyId, { [field]: bullets });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${title} updated.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setText(initial.join("\n"));
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-muted-foreground"
          aria-label={`Edit ${title}`}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {title}</DialogTitle>
          <DialogDescription>
            One bullet per line (max 8). Your edits persist until the next{" "}
            <em>Generate analysis</em> run replaces them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"First bullet\nSecond bullet"}
            autoFocus
          />
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
