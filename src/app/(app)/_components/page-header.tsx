export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    // sm:flex-wrap lets the whole action group drop to its own line when
    // the title + buttons don't fit, instead of crushing the title.
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0 sm:flex-1 sm:basis-48">
        {/* break-words so a long name or an unbreakable token like an
            email wraps inside this column rather than spilling out under
            the buttons. */}
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground break-words">
            {description}
          </p>
        ) : null}
      </div>
      {/* Wrap so button-heavy headers (e.g. the candidate detail page)
          stack onto multiple rows on narrow screens instead of
          overflowing horizontally. */}
      {actions ? (
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
