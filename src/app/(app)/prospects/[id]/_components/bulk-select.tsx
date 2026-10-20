"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { bulkDeleteProspects, bulkMoveProspects } from "../../actions";
import { QuickSendDialog } from "./quick-send-dialog";

// Client islands for multi-select on the (otherwise server-rendered)
// lead table: a context provider wraps the table, checkbox cells join
// it, and the action bar renders only when something is selected.

type BulkCtx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
};

const Ctx = React.createContext<BulkCtx | null>(null);

export function BulkSelectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const value = React.useMemo<BulkCtx>(
    () => ({
      selected,
      toggle: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      setMany: (ids, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      clear: () => setSelected(new Set()),
    }),
    [selected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useBulk(): BulkCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("Bulk components must sit inside the provider.");
  return ctx;
}

export function BulkSelectCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useBulk();
  return (
    <Checkbox
      checked={selected.has(id)}
      onCheckedChange={() => toggle(id)}
      aria-label="Select row"
    />
  );
}

// Header checkbox: toggles every row currently visible on this page.
export function BulkSelectAllCheckbox({ pageIds }: { pageIds: string[] }) {
  const { selected, setMany } = useBulk();
  const allOn = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  return (
    <Checkbox
      checked={allOn}
      onCheckedChange={(v) => setMany(pageIds, v === true)}
      aria-label="Select all on page"
    />
  );
}

const NO_TARGET = "none";

export function BulkActionsBar({
  listId,
  otherLists,
}: {
  listId: string;
  otherLists: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { selected, clear } = useBulk();
  const [target, setTarget] = React.useState(NO_TARGET);
  const [isPending, startTransition] = React.useTransition();

  if (selected.size === 0) return null;
  const ids = [...selected];

  function move() {
    if (target === NO_TARGET) {
      toast.error("Pick a destination list first.");
      return;
    }
    startTransition(async () => {
      const r = await bulkMoveProspects(ids, target);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Moved ${r.moved} lead${r.moved === 1 ? "" : "s"}.`);
      clear();
      router.refresh();
    });
  }

  function remove() {
    if (
      !confirm(
        `Permanently delete ${ids.length} selected lead${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await bulkDeleteProspects(ids);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Deleted ${r.deleted} lead${r.deleted === 1 ? "" : "s"}.`);
      clear();
      router.refresh();
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <span className="text-sm font-medium tabular-nums">
        {ids.length} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <QuickSendDialog
          listId={listId}
          prospectIds={ids}
          onSent={clear}
        />
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder="Move to list…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TARGET}>Move to list…</SelectItem>
            {otherLists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={isPending || target === NO_TARGET}
          onClick={move}
        >
          <FolderInput className="size-3.5" aria-hidden />
          Move
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          disabled={isPending}
          onClick={remove}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={clear}
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </Button>
      </div>
    </div>
  );
}
