import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Service-role Supabase client. Bypasses RLS entirely - use ONLY in server
 * actions that have already verified the caller's permissions.
 *
 * Currently used only by /settings/employees actions to:
 *   - create auth users (auth.admin.createUser)
 *   - insert/update rows in public.employees (which the caller's own session
 *     could do too, but going through service-role keeps the create flow
 *     atomic + makes failure rollback explicit).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Service role client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
