import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Campaign engine reads. Send-path writes live in
// src/app/(app)/campaigns/actions.ts.
// =====================================================================

type CampaignRow = Database["public"]["Tables"]["email_campaigns"]["Row"];

export type CampaignListItem = CampaignRow & {
  list_name: string | null;
};

export async function listCampaigns(): Promise<Result<CampaignListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaigns")
    .select("*, list:prospect_lists(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return fail([], error.message);
  return {
    data: (data ?? []).map((r) => {
      const list = Array.isArray(r.list) ? r.list[0] : r.list;
      const row = { ...r, list: undefined } as unknown as CampaignRow;
      return { ...row, list_name: list?.name ?? null };
    }),
    error: null,
  };
}

export type CampaignStats = {
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  unsubscribed: number;
};

export type CampaignDetail = CampaignListItem & {
  stats: CampaignStats;
};

export async function getCampaign(
  id: string,
): Promise<Result<CampaignDetail | null>> {
  const supabase = await createClient();
  const [{ data, error }, { data: sends, error: sendsErr }] =
    await Promise.all([
      supabase
        .from("email_campaigns")
        .select("*, list:prospect_lists(name)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("email_sends").select("status").eq("campaign_id", id),
    ]);
  if (error) return fail(null, error.message);
  if (!data) return { data: null, error: null };
  if (sendsErr) return fail(null, sendsErr.message);

  const stats: CampaignStats = {
    queued: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
    unsubscribed: 0,
  };
  for (const s of sends ?? []) {
    if (s.status in stats) stats[s.status as keyof CampaignStats] += 1;
  }

  const list = Array.isArray(data.list) ? data.list[0] : data.list;
  const row = { ...data, list: undefined } as unknown as CampaignRow;
  return {
    data: {
      ...row,
      list_name: list?.name ?? null,
      stats,
    },
    error: null,
  };
}

export type EmailTemplate =
  Database["public"]["Tables"]["email_templates"]["Row"];

export async function listEmailTemplates(): Promise<Result<EmailTemplate[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

export type MailableCounts = {
  mailable: number;
  suppressed: number;
  noConsent: number;
};

// Recipient preview for the composer: how many of these leads are
// actually mailable (email + consent + not suppressed)? Selector is
// either a whole list or a hand-picked id set ("Email selected").
export async function countMailableRecipients(
  selector: { listId: string } | { prospectIds: string[] },
): Promise<Result<MailableCounts>> {
  const supabase = await createClient();
  let query = supabase
    .from("prospects")
    .select("email, marketing_consent")
    .not("email", "is", null)
    .limit(5000);
  if ("listId" in selector) {
    query = query.eq("list_id", selector.listId);
  } else {
    if (selector.prospectIds.length === 0) {
      return { data: { mailable: 0, suppressed: 0, noConsent: 0 }, error: null };
    }
    query = query.in("id", selector.prospectIds);
  }
  const { data: rows, error } = await query;
  if (error) return fail({ mailable: 0, suppressed: 0, noConsent: 0 }, error.message);

  const emails = [
    ...new Set(
      (rows ?? [])
        .filter((r) => r.email)
        .map((r) => r.email!.toLowerCase().trim()),
    ),
  ];
  let suppressedSet = new Set<string>();
  if (emails.length > 0) {
    const { data: sup } = await supabase
      .from("email_suppressions")
      .select("email")
      .in("email", emails);
    suppressedSet = new Set((sup ?? []).map((s) => s.email));
  }

  let mailable = 0;
  let suppressed = 0;
  let noConsent = 0;
  const seen = new Set<string>();
  for (const r of rows ?? []) {
    const e = r.email?.toLowerCase().trim();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    if (!r.marketing_consent) noConsent += 1;
    else if (suppressedSet.has(e)) suppressed += 1;
    else mailable += 1;
  }
  return { data: { mailable, suppressed, noConsent }, error: null };
}
