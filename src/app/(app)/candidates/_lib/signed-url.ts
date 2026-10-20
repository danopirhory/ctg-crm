import "server-only";

import { createClient } from "@/lib/supabase/server";
import { RESUME_BUCKET } from "./resume";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes - long enough to click, short enough to be safe if a URL leaks

export async function createResumeSignedUrl(
  path: string,
  opts?: { downloadAs?: string },
): Promise<{ url: string | null; error: string | null }> {
  if (!path) return { url: null, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
      download: opts?.downloadAs ?? undefined,
    });

  if (error) {
    console.error("[storage]", error.message);
    return { url: null, error: error.message };
  }
  return { url: data?.signedUrl ?? null, error: null };
}
