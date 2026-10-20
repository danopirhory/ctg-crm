"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useCanWrite } from "../../../_components/role-context";
import { addCandidateNote } from "../actions";

export function AddNoteForm({ candidateId }: { candidateId: string }) {
  const canWrite = useCanWrite();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) return;

    startTransition(async () => {
      const r = await addCandidateNote(candidateId, text);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Note added.");
      setText("");
      formRef.current?.reset();
      router.refresh();
    });
  }

  if (!canWrite) return null;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-2">
      <Textarea
        name="note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note about this candidate…"
        rows={3}
        maxLength={5000}
        disabled={isPending}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !text.trim()}>
          {isPending ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
