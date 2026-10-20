"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import * as React from "react";

import { cn } from "@/lib/utils";

// =====================================================================
// Generic Kanban primitives over @dnd-kit. Boards are composed by
// rendering <KanbanBoard onMove=...>{columns}</KanbanBoard>, where each
// column is a <KanbanColumn id> containing <KanbanCard id> draggables.
// =====================================================================

type KanbanContextValue = {
  activeId: string | null;
  activeCardRenderer: React.ReactNode;
};

const KanbanCtx = React.createContext<KanbanContextValue>({
  activeId: null,
  activeCardRenderer: null,
});

export function KanbanBoard({
  onMove,
  renderOverlay,
  containerClassName,
  containerStyle,
  children,
}: {
  onMove: (event: { cardId: string; fromColumn: string; toColumn: string }) => void;
  renderOverlay?: (cardId: string) => React.ReactNode;
  // Override the default flex columns layout - e.g. pass a CSS grid
  // class/style to position columns in a staircase / multi-row pattern.
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Track which column each card started in by stamping it on drag start
  // (the drag event doesn't natively carry this for free-form dnd).
  const fromColumnRef = React.useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid hijacking clicks on cards that also navigate.
      activationConstraint: { distance: 6 },
    }),
  );

  function handleDragStart(event: { active: { id: string | number; data: { current?: { columnId?: string } } } }) {
    setActiveId(String(event.active.id));
    fromColumnRef.current = event.active.data.current?.columnId ?? null;
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { over, active } = event;
    const from = fromColumnRef.current;
    fromColumnRef.current = null;
    if (!over || !from) return;
    const to = String(over.id);
    if (to === from) return;
    onMove({ cardId: String(active.id), fromColumn: from, toColumn: to });
  }

  return (
    <KanbanCtx.Provider
      value={{
        activeId,
        activeCardRenderer:
          activeId && renderOverlay ? renderOverlay(activeId) : null,
      }}
    >
      <DndContext
        id="ctg-kanban"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          fromColumnRef.current = null;
        }}
      >
        <div
          className={cn(
            containerClassName ?? "flex gap-3 overflow-x-auto pb-4",
          )}
          style={containerStyle}
        >
          {children}
        </div>
        <DragOverlay>
          <KanbanOverlay />
        </DragOverlay>
      </DndContext>
    </KanbanCtx.Provider>
  );
}

function KanbanOverlay() {
  const { activeId, activeCardRenderer } = React.useContext(KanbanCtx);
  if (!activeId) return null;
  return (
    <div className="rotate-2 opacity-95 shadow-xl">{activeCardRenderer}</div>
  );
}

export function KanbanColumn({
  id,
  title,
  subtitle,
  accent,
  headerExtra,
  children,
  emptyHint,
  style,
  className,
}: {
  id: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  emptyHint?: React.ReactNode;
  // Allow the caller to position the column in a parent grid (gridColumn,
  // gridRow, etc.). When the column lives inside a CSS grid the
  // intrinsic w-[300px] is overridden by the grid track sizing.
  style?: React.CSSProperties;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const hasChildren =
    React.Children.toArray(children).filter(Boolean).length > 0;
  return (
    <section
      style={style}
      className={cn(
        "flex w-[300px] shrink-0 flex-col rounded-lg border bg-card",
        isOver && "ring-2 ring-primary/40",
        className,
      )}
    >
      <header
        className={cn(
          "flex items-start justify-between gap-2 border-b px-3 py-2",
          accent,
        )}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          {subtitle ? (
            <div className="truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>
        {headerExtra}
      </header>
      <div
        ref={setNodeRef}
        className="grid flex-1 gap-2 overflow-y-auto p-2 min-h-[120px]"
      >
        {children}
        {!hasChildren ? (
          <div className="grid place-items-center rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            {emptyHint ?? "Drop cards here"}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function KanbanCard({
  id,
  columnId,
  onClick,
  children,
}: {
  id: string;
  columnId: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { columnId },
    });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        // Hide the source card while the overlay shows the floating copy
        opacity: isDragging ? 0 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Suppress click navigation if a drag was actually performed.
        if (isDragging) return;
        onClick?.();
        e.stopPropagation();
      }}
      className={cn(
        "rounded-md border bg-background p-3 text-sm shadow-sm transition-colors",
        "hover:border-primary/40 cursor-grab active:cursor-grabbing",
      )}
    >
      {children}
    </div>
  );
}
