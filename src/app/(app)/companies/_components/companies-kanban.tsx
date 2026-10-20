"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
} from "../../_components/kanban/board";
import type {
  ClientBoardData,
  ClientProspectKanbanCard as ProspectCard,
  CompanyKanbanCard as CompanyCard,
} from "@/lib/db/queries";

import { moveCompaniesKanbanCard } from "./kanban-actions";
import { QuickAddJobDialog } from "./quick-add-job-dialog";

type Props = { data: ClientBoardData };

export function CompaniesKanban({ data }: Props) {
  const router = useRouter();

  function handleMove(input: {
    cardId: string;
    fromColumn: string;
    toColumn: string;
  }) {
    void (async () => {
      const r = await moveCompaniesKanbanCard(input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Moved.");
      router.refresh();
    })();
  }

  function findCardById(cardDragId: string) {
    const [kind, id] = cardDragId.split(":");
    if (kind === "prospect")
      return data.prospects.find((p) => p.id === id) ?? null;
    if (kind === "company")
      return (
        data.companyProspects.find((c) => c.id === id) ??
        data.companies.find((c) => c.id === id) ??
        null
      );
    return null;
  }

  return (
    <KanbanBoard
      onMove={handleMove}
      renderOverlay={(activeId) => {
        const card = findCardById(activeId);
        if (!card) return null;
        if ("contact_name" in card && "job_count" in card) {
          return <CompanyCardBody card={card as CompanyCard} />;
        }
        return <ProspectCardBody card={card as ProspectCard} />;
      }}
    >
      <KanbanColumn
        id="prospects"
        title="Company Leads"
        subtitle={`${data.prospects.length} cards`}
        accent="bg-amber-50/60 dark:bg-amber-950/20"
        emptyHint="No company leads to qualify."
      >
        {data.prospects.map((p) => (
          <KanbanCard
            key={p.id}
            id={`prospect:${p.id}`}
            columnId="prospects"
            onClick={() => router.push(`/prospects/${p.list_id}/${p.id}`)}
          >
            <ProspectCardBody card={p} />
          </KanbanCard>
        ))}
      </KanbanColumn>

      <KanbanColumn
        id="company_prospects"
        title="Company Prospects"
        subtitle={`${data.companyProspects.length} qualifying`}
        accent="bg-violet-50/60 dark:bg-violet-950/20"
        emptyHint="Drag company leads here to start qualifying."
      >
        {data.companyProspects.map((c) => (
          <KanbanCard
            key={c.id}
            id={`company:${c.id}`}
            columnId="company_prospects"
            onClick={() => router.push(`/companies/${c.id}`)}
          >
            <CompanyCardBody card={c} />
          </KanbanCard>
        ))}
      </KanbanColumn>

      <KanbanColumn
        id="companies"
        title="Companies"
        subtitle={`${data.companies.length} active`}
        accent="bg-blue-50/60 dark:bg-blue-950/20"
        emptyHint="Drag company prospects here once they progress."
      >
        {data.companies.map((c) => (
          <KanbanCard
            key={c.id}
            id={`company:${c.id}`}
            columnId="companies"
            onClick={() => router.push(`/companies/${c.id}`)}
          >
            <CompanyCardBody card={c} />
          </KanbanCard>
        ))}
      </KanbanColumn>
    </KanbanBoard>
  );
}

function ProspectCardBody({ card }: { card: ProspectCard }) {
  return (
    <div className="grid gap-1">
      <div className="font-medium leading-tight">
        {card.company_name ?? "-"}
      </div>
      {card.contact_name ? (
        <div className="truncate text-xs text-muted-foreground">
          {card.contact_name}
          {card.email ? ` · ${card.email}` : ""}
        </div>
      ) : card.email ? (
        <div className="truncate text-xs text-muted-foreground">
          {card.email}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        {card.industry ? (
          <Badge variant="outline" className="text-[10px]">
            {card.industry}
          </Badge>
        ) : null}
        {card.location ? <span>{card.location}</span> : null}
      </div>
    </div>
  );
}

function CompanyCardBody({ card }: { card: CompanyCard }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-tight">{card.company_name}</div>
        <QuickAddJobDialog
          companyId={card.id}
          companyName={card.company_name}
        />
      </div>
      {card.contact_name ? (
        <div className="truncate text-xs text-muted-foreground">
          {card.contact_name}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">
          {card.status}
        </Badge>
        {card.industry ? <span>· {card.industry}</span> : null}
        {card.job_count > 0 ? (
          <span className="ml-auto text-[10px] font-medium text-foreground">
            {card.job_count} open job{card.job_count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
