import { cn } from "@/lib/utils";

// 3-pip role-fit bar that maps a 0..3 score onto the green-dot row from
// the PDF template. null scores render as an empty pip row so a
// not-yet-generated review still aligns visually.
export function RoleFitBar({
  score,
  label,
}: {
  score: number | null;
  label?: string;
}) {
  const filled = score == null ? 0 : Math.round(Math.max(0, Math.min(3, score)));
  return (
    <div className="inline-flex items-center gap-1.5">
      {label ? (
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "h-2.5 w-2.5 rounded-full border",
              i < filled
                ? "border-emerald-500 bg-emerald-500"
                : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
            )}
          />
        ))}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {score == null ? "-" : score.toFixed(1)}
      </span>
    </div>
  );
}
