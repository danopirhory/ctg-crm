"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ProspectListKind } from "@/lib/db/constants";

import { useCanWrite } from "../../_components/role-context";
import { moveProspectListToParent, updateProspectList } from "../actions";

const TOP_LEVEL = "__top__";

export function EditListDialog({
  list,
  parentOptions = [],
  hasChildren = false,
}: {
  list: {
    id: string;
    name: string;
    description: string | null;
    source: string | null;
    kind: ProspectListKind;
    parent_list_id: string | null;
  };
  // Eligible parents: same-kind, top-level lists other than this one.
  parentOptions?: { id: string; name: string }[];
  // A list that already has sub-lists can't be nested (one level deep).
  hasChildren?: boolean;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [source, setSource] = useState(list.source ?? "");
  const [parentId, setParentId] = useState(list.parent_list_id ?? TOP_LEVEL);

  // Reset local state to whatever's currently in the DB whenever the dialog
  // closes (covers Cancel + outside-click + Esc).
  function resetFromList() {
    setName(list.name);
    setDescription(list.description ?? "");
    setSource(list.source ?? "");
    setParentId(list.parent_list_id ?? TOP_LEVEL);
  }

  if (!canWrite) return null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("List name is required.");
      return;
    }
    const nextParent = parentId === TOP_LEVEL ? null : parentId;
    const parentChanged = nextParent !== list.parent_list_id;
    startTransition(async () => {
      const r = await updateProspectList(list.id, {
        name,
        description,
        source,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (parentChanged) {
        const m = await moveProspectListToParent(list.id, nextParent);
        if (!m.ok) {
          toast.error(m.error);
          return;
        }
      }
      toast.success("List updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetFromList();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="size-4" aria-hidden />
          Edit list
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit list</DialogTitle>
          <DialogDescription>
            Update the list&apos;s name, description, or source. Doesn&apos;t
            affect prospects already in the list - but if you&apos;ve already
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">List type</label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">
                {list.kind === "Company"
                  ? "Company (businesses)"
                  : "Candidate (individuals)"}
              </span>
              <span className="text-xs text-muted-foreground">
                - fixed at creation
              </span>
            </div>
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="list-name">
              Name
            </label>
            <Input
              id="list-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              maxLength={200}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="list-source">
              Source <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="list-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={isPending}
              maxLength={200}
              placeholder="e.g. CSV export"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="list-parent">
              Parent list <span className="text-muted-foreground">(optional)</span>
            </label>
            {hasChildren ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                This list has its own sub-lists, so it can&apos;t be nested
                (sub-lists are one level deep). Move its sub-lists out first.
              </p>
            ) : (
              <>
                <Select
                  value={parentId}
                  onValueChange={setParentId}
                  disabled={isPending}
                >
                  <SelectTrigger id="list-parent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TOP_LEVEL}>None (top-level list)</SelectItem>
                    {parentOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Move this {list.kind} list inside another {list.kind} list, or
                  set to top-level.
                </p>
              </>
            )}
          </div>
          <div className="grid gap-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="list-description"
            >
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="list-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              maxLength={2000}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
