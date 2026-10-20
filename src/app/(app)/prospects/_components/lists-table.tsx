"use client";

import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { LEAD_LIST_ASSIGNEES } from "@/lib/db/constants";
import type { LeadListAssignee } from "@/lib/db/constants";

import { assignProspectList, reorderProspectLists } from "../actions";

const UNASSIGNED = "__none__";

// The lead-list table with drag-to-reorder rows and one level of
// sub-lists. Top-level lists are draggable; their sub-lists render
// indented directly beneath them and move with the parent. Order is
// persisted as prospect_lists.sort_order via reorderProspectLists
// (top-level only). Reordering is offered only on the full, unfiltered
// view (canReorder) - reordering a filtered subset would scramble
// hidden lists.
//
// `created` is pre-formatted on the server so SSR and client HTML agree
// regardless of locale.
export type LeadListRowData = {
  id: string;
  name: string;
  description: string | null;
  source: string | null;
  kind: "Candidate" | "Company";
  assigned_to: LeadListAssignee | null;
  parent_list_id: string | null;
  prospect_count: number;
  created: string;
};

export function LeadListsTable({
  lists,
  canReorder,
  collapseByDefault = false,
}: {
  lists: LeadListRowData[];
  canReorder: boolean;
  // Start every list with sub-lists collapsed (file-manager folder view).
  collapseByDefault?: boolean;
}) {
  const [items, setItems] = React.useState(lists);
  // Parent ids whose sub-lists are hidden. Local UI state - resets on
  // reload. Seeded from collapseByDefault: when true, every parent that
  // has children starts collapsed.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => {
    if (!collapseByDefault) return new Set();
    const parents = new Set<string>();
    for (const l of lists) if (l.parent_list_id) parents.add(l.parent_list_id);
    return parents;
  });

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Don't hijack plain clicks on the handle area.
      activationConstraint: { distance: 6 },
    }),
  );

  // Group into top-level lists + their sub-lists. A child whose parent
  // isn't in the current set (e.g. when filtering) falls back to being
  // shown at the top level so it never disappears.
  const idSet = React.useMemo(() => new Set(items.map((l) => l.id)), [items]);
  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, LeadListRowData[]>();
    for (const l of items) {
      if (l.parent_list_id && idSet.has(l.parent_list_id)) {
        const arr = map.get(l.parent_list_id) ?? [];
        arr.push(l);
        map.set(l.parent_list_id, arr);
      }
    }
    // Sub-lists always display alphabetically (top-level lists keep their
    // manual drag order).
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [items, idSet]);
  const topLevel = React.useMemo(
    () => items.filter((l) => !l.parent_list_id || !idSet.has(l.parent_list_id)),
    [items, idSet],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const topIds = topLevel.map((l) => l.id);
    const oldPos = topIds.indexOf(String(active.id));
    const newPos = topIds.indexOf(String(over.id));
    if (oldPos < 0 || newPos < 0) return;

    const newTopIds = arrayMove(topIds, oldPos, newPos);
    const byId = new Map(items.map((l) => [l.id, l]));
    // Rebuild the flat array so each parent is immediately followed by
    // its children, in the new top-level order.
    const next: LeadListRowData[] = [];
    for (const tid of newTopIds) {
      const parent = byId.get(tid);
      if (parent) next.push(parent);
      for (const child of childrenByParent.get(tid) ?? []) next.push(child);
    }

    const previous = items;
    setItems(next);
    // Persist top-level order only; children keep their own sort_order.
    void reorderProspectLists(newTopIds).then((r) => {
      if (!r.ok) {
        setItems(previous);
        toast.error(r.error);
      }
    });
  }

  function handleAssign(listId: string, assignee: LeadListAssignee | null) {
    const previous = items;
    setItems((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, assigned_to: assignee } : l)),
    );
    void assignProspectList(listId, assignee).then((r) => {
      if (!r.ok) {
        setItems(previous);
        toast.error(r.error);
      }
    });
  }

  return (
    <Card className="overflow-hidden p-0">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {canReorder ? (
                <TableHead className="w-8" aria-label="Reorder" />
              ) : null}
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead className="tabular-nums">Count</TableHead>
              <TableHead className="hidden sm:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableContext
              items={topLevel.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {topLevel.map((l) => {
                const children = childrenByParent.get(l.id) ?? [];
                const isCollapsed = collapsed.has(l.id);
                return (
                  <React.Fragment key={l.id}>
                    <SortableListRow
                      list={l}
                      canReorder={canReorder}
                      onAssign={handleAssign}
                      childCount={children.length}
                      collapsed={isCollapsed}
                      onToggleCollapse={toggleCollapse}
                    />
                    {!isCollapsed &&
                      children.map((child) => (
                        <ChildListRow
                          key={child.id}
                          list={child}
                          indentReorder={canReorder}
                          onAssign={handleAssign}
                        />
                      ))}
                  </React.Fragment>
                );
              })}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>
    </Card>
  );
}

function KindBadge({ kind }: { kind: "Candidate" | "Company" }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${
        kind === "Company"
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      }`}
    >
      {kind}
    </span>
  );
}

function AssignSelect({
  list,
  onAssign,
}: {
  list: LeadListRowData;
  onAssign: (listId: string, assignee: LeadListAssignee | null) => void;
}) {
  return (
    <Select
      value={list.assigned_to ?? UNASSIGNED}
      onValueChange={(v) =>
        onAssign(list.id, v === UNASSIGNED ? null : (v as LeadListAssignee))
      }
    >
      <SelectTrigger
        size="sm"
        className={`h-7 w-[110px] text-xs ${list.assigned_to ? "" : "text-muted-foreground"}`}
        aria-label={`Assign ${list.name}`}
      >
        <SelectValue placeholder="Assign" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {LEAD_LIST_ASSIGNEES.map((a) => (
          <SelectItem key={a} value={a}>
            {a}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortableListRow({
  list: l,
  canReorder,
  onAssign,
  childCount,
  collapsed,
  onToggleCollapse,
}: {
  list: LeadListRowData;
  canReorder: boolean;
  onAssign: (listId: string, assignee: LeadListAssignee | null) => void;
  childCount: number;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: l.id, disabled: !canReorder });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 bg-muted shadow-sm" : undefined}
    >
      {canReorder ? (
        <TableCell className="w-8 pr-0">
          <button
            type="button"
            className="grid size-6 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label={`Reorder ${l.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        </TableCell>
      ) : null}
      <TableCell className="font-medium">
        <div className="flex items-center gap-1">
          {childCount > 0 ? (
            <button
              type="button"
              onClick={() => onToggleCollapse(l.id)}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${l.name} sub-lists`}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {collapsed ? (
                <ChevronRight className="size-4" aria-hidden />
              ) : (
                <ChevronDown className="size-4" aria-hidden />
              )}
            </button>
          ) : (
            <span className="inline-block size-5 shrink-0" aria-hidden />
          )}
          <Link href={`/prospects/${l.id}`} className="hover:underline">
            {l.name}
          </Link>
          {childCount > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({childCount})
            </span>
          ) : null}
        </div>
        {l.description ? (
          <p className="truncate max-w-md pl-6 text-xs text-muted-foreground">
            {l.description}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <KindBadge kind={l.kind} />
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground">
        {l.source ?? "-"}
      </TableCell>
      <TableCell>
        <AssignSelect list={l} onAssign={onAssign} />
      </TableCell>
      <TableCell className="tabular-nums">
        {l.prospect_count.toLocaleString()}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground">
        {l.created}
      </TableCell>
    </TableRow>
  );
}

// A sub-list row: indented under its parent, not draggable.
function ChildListRow({
  list: l,
  indentReorder,
  onAssign,
}: {
  list: LeadListRowData;
  // Whether the leading reorder column exists (so this row aligns).
  indentReorder: boolean;
  onAssign: (listId: string, assignee: LeadListAssignee | null) => void;
}) {
  return (
    <TableRow className="bg-muted/20">
      {indentReorder ? <TableCell className="w-8 pr-0" /> : null}
      <TableCell className="font-medium">
        <span className="flex items-center gap-1.5 pl-5">
          <CornerDownRight
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <Link href={`/prospects/${l.id}`} className="hover:underline">
            {l.name}
          </Link>
        </span>
        {l.description ? (
          <p className="ml-[1.625rem] text-xs text-muted-foreground truncate max-w-md">
            {l.description}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <KindBadge kind={l.kind} />
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground">
        {l.source ?? "-"}
      </TableCell>
      <TableCell>
        <AssignSelect list={l} onAssign={onAssign} />
      </TableCell>
      <TableCell className="tabular-nums">
        {l.prospect_count.toLocaleString()}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground">
        {l.created}
      </TableCell>
    </TableRow>
  );
}
