import Link from "next/link";
import { Sparkles } from "lucide-react";

import type { ProspectOrigin } from "@/lib/db/queries";

export function ProspectOriginBanner({
  origin,
  via,
}: {
  origin: ProspectOrigin | null;
  // "candidate" = banner is on the candidate page, "company" = company page,
  // "placement-via-candidate" = placement page (origin was resolved through
  // the candidate this placement is for).
  via: "candidate" | "company" | "placement-via-candidate";
}) {
  if (!origin) return null;

  const phrase =
    via === "placement-via-candidate"
      ? "Candidate originally added from prospect list"
      : "Originally added from prospect list";

  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Sparkles
        className="mt-0.5 size-3.5 shrink-0 text-amber-600"
        aria-hidden
      />
      <span>
        {phrase}{" "}
        <Link
          href={`/prospects/${origin.list_id}`}
          className="font-medium text-foreground hover:underline"
        >
          {origin.list_name}
        </Link>
        {origin.source ? (
          <>
            {" "}
            · <span className="italic">{origin.source}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
