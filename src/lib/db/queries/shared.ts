import "server-only";

// All queries return a uniform { data, error } so pages can render error
// states without crashing the whole route. We log errors server-side so
// they land in Vercel logs.
export type Result<T> = { data: T; error: string | null };

export function fail<T>(fallback: T, message: string): Result<T> {
  console.error("[db]", message);
  return { data: fallback, error: message };
}
