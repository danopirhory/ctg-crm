// Shared date / time formatters. Every CRM screen renders timestamps
// from Supabase in this single timezone so the values are stable
// whether the page is rendered on the user's laptop (Node respects the
// host TZ) or in a serverless container (Vercel + most Postgres hosts
// default to UTC).
//
// The team works on US Eastern time; pinning to
// America/New_York means the formatter respects DST automatically
// (EST in winter, EDT in summer) without us having to track which
// season we're in.
const CRM_TIME_ZONE = "America/New_York";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: CRM_TIME_ZONE,
};

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: CRM_TIME_ZONE,
  timeZoneName: "short",
};

// Format a date-only string (YYYY-MM-DD) without timezone shift.
// Treating it as a calendar date keeps "2026-06-04" from showing as
// "Jun 3" for anyone west of UTC.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";

  // Plain YYYY-MM-DD - render as a calendar date, ignore any clock
  // interpretation entirely.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(
      undefined,
      { year: "numeric", month: "short", day: "numeric" },
    );
  }

  return new Date(iso).toLocaleDateString(undefined, DATE_FORMAT);
}

// Format a full timestamp (note creation, audit stamps, etc.).
// Always renders in America/New_York with an inline EST/EDT label so
// recruiters reading at 11:54 AM Eastern see "11:54 AM EDT" instead of
// the raw UTC value.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, DATE_TIME_FORMAT);
}

// Coarse "x time ago" used on dashboards. Direction-agnostic (positive
// only) - anything in the future renders as "just now". Independent of
// timezone since we compare two absolute instants.
export function relativeFromNow(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  if (diffMs <= 0) return "just now";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours <= 0) {
      const minutes = Math.floor(diffMs / (1000 * 60));
      if (minutes <= 1) return "just now";
      return `${minutes}m ago`;
    }
    return hours === 1 ? "1 hour ago" : `${hours}h ago`;
  }
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}
