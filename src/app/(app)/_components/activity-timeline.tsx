import {
  ArrowRightLeft,
  Briefcase,
  CheckSquare,
  FileText,
  Globe,
  MessageSquare,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listActivitiesFor, type ActivityItem } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/date-format";

// Server component: unified activity timeline rendered on candidate and
// company detail pages. One icon per verb family.

const VERB_ICONS: Record<string, LucideIcon> = {
  status_changed: ArrowRightLeft,
  match_added: Briefcase,
  match_removed: Briefcase,
  note_added: MessageSquare,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  review_generated: Sparkles,
  snapshot_taken: FileText,
  intake_received: Globe,
  returned_to_leads: ArrowRightLeft,
  candidate_created: UserPlus,
};

export async function ActivityTimeline({
  subject,
}: {
  subject:
    | { candidateId: string }
    | { companyId: string }
    | { prospectId: string };
}) {
  const { data: items, error } = await listActivitiesFor(subject);
  if (error) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity recorded yet. Status changes, notes, job matches,
            tasks, and AI reviews will show up here.
          </p>
        ) : (
          <ol className="relative grid gap-0 border-l border-border/70 pl-5">
            {items.map((a) => (
              <TimelineRow key={a.id} item={a} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineRow({ item }: { item: ActivityItem }) {
  const Icon = VERB_ICONS[item.verb] ?? MessageSquare;
  const who = item.actor
    ? `${item.actor.first_name} ${item.actor.last_name}`
    : "System";
  return (
    <li className="relative pb-4 last:pb-0">
      <span
        aria-hidden
        className="absolute -left-[27px] top-0.5 grid size-4 place-items-center rounded-full border bg-background"
      >
        <Icon className="size-2.5 text-muted-foreground" />
      </span>
      <p className="text-sm leading-tight">{item.summary}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {who} · {formatDateTime(item.created_at)}
      </p>
    </li>
  );
}
