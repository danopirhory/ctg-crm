"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/db/activity";
import { getCurrentEmployee } from "@/lib/db/queries";
import {
  getMailer,
  renderHtml,
  renderMerge,
  renderTextWithFooter,
  unsubscribeUrlFor,
  type MergeRecipient,
} from "@/lib/email/mailer";

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

// ---------- Draft CRUD ----------

const attachmentSchema = z.object({
  path: z.string().min(1).max(500),
  filename: z.string().min(1).max(200),
  size: z.number().int().min(1),
});
export type CampaignAttachment = z.infer<typeof attachmentSchema>;

const campaignSchema = z.object({
  name: z.string().trim().min(1, "Name the campaign").max(200),
  list_id: z.string().uuid("Pick a list"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(10, "Write the message body").max(50_000),
  from_name: z.string().trim().min(1).max(100).default("Command Talent Group"),
  reply_to: z
    .string()
    .trim()
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "Invalid reply-to email")
    .default(""),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

export type CampaignInput = z.infer<typeof campaignSchema>;

export async function createCampaign(
  input: CampaignInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid campaign.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const employee = await getCurrentEmployee();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      name: parsed.data.name,
      list_id: parsed.data.list_id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      from_name: parsed.data.from_name,
      reply_to: parsed.data.reply_to || null,
      attachments: parsed.data.attachments,
      created_by: "error" in employee ? null : employee.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/campaigns");
  return { ok: true, id: data.id };
}

export async function updateCampaign(
  id: string,
  input: CampaignInput,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing campaign id." };
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid campaign.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_campaigns")
    .update({
      name: parsed.data.name,
      list_id: parsed.data.list_id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      from_name: parsed.data.from_name,
      reply_to: parsed.data.reply_to || null,
      attachments: parsed.data.attachments,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "Draft");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing campaign id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  const supabase = await createClient();

  // Clean up attachment files first (best-effort; orphans are harmless).
  const { data: existing } = await supabase
    .from("email_campaigns")
    .select("attachments")
    .eq("id", id)
    .maybeSingle();
  const files = (existing?.attachments ?? []) as CampaignAttachment[];
  if (files.length > 0) {
    try {
      const admin = createAdminClient();
      await admin.storage
        .from(ATTACHMENT_BUCKET)
        .remove(files.map((f) => f.path));
    } catch {
      // proceed with the row delete regardless
    }
  }

  const { error } = await supabase
    .from("email_campaigns")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/campaigns");
  return { ok: true };
}

// ---------- Attachments ----------

const ATTACHMENT_BUCKET = "email-attachments";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per file
// Base64 inflates ~33% and Resend caps total email size at 40MB.
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "txt", "csv",
]);

export async function uploadCampaignAttachment(
  formData: FormData,
): Promise<ActionResult<{ attachment: CampaignAttachment }>> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file received." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File too large - 8MB max per file." };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `File type .${ext} not allowed. Use documents, spreadsheets, or images.`,
    };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 150);
  const path = `campaigns/${randomUUID()}-${safeName}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    attachment: { path, filename: safeName, size: file.size },
  };
}

export async function removeCampaignAttachment(
  path: string,
): Promise<ActionResult> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  if (!path.startsWith("campaigns/")) {
    return { ok: false, error: "Invalid attachment path." };
  }
  const admin = createAdminClient();
  await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
  return { ok: true };
}

// Downloads every attachment once and base64-encodes for Resend.
async function loadAttachmentContents(
  files: CampaignAttachment[],
): Promise<
  | { ok: true; payload: { filename: string; content: string }[] }
  | { ok: false; error: string }
> {
  if (files.length === 0) return { ok: true, payload: [] };
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: "Attachments exceed 15MB total - trim the files and try again.",
    };
  }
  const admin = createAdminClient();
  const payload: { filename: string; content: string }[] = [];
  for (const f of files) {
    const { data, error } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .download(f.path);
    if (error || !data) {
      return {
        ok: false,
        error: `Could not load attachment "${f.filename}": ${error?.message ?? "missing file"}`,
      };
    }
    const buf = Buffer.from(await data.arrayBuffer());
    payload.push({ filename: f.filename, content: buf.toString("base64") });
  }
  return { ok: true, payload };
}

// ---------- Draft from a bulk selection ----------

// "Email selected" on the lead table: spins up a Draft locked to the
// checked prospect ids, then the composer takes over. Recipients are
// frozen at selection time (still consent/suppression-filtered at
// send).
export async function createCampaignFromSelection(
  listId: string,
  prospectIds: string[],
): Promise<ActionResult<{ id: string }>> {
  const ids = z.array(z.string().uuid()).min(1).max(500).safeParse(prospectIds);
  if (!ids.success) return { ok: false, error: "Invalid selection." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const employee = await getCurrentEmployee();
  const supabase = await createClient();
  const { data: list } = await supabase
    .from("prospect_lists")
    .select("name")
    .eq("id", listId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      name: `Email to ${ids.data.length} selected - ${list?.name ?? "leads"}`,
      list_id: listId,
      recipient_prospect_ids: ids.data,
      subject: "",
      body: "",
      created_by: "error" in employee ? null : employee.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/campaigns");
  return { ok: true, id: data.id };
}

// ---------- Quick send ----------

const quickSendSchema = z.object({
  prospectIds: z.array(z.string().uuid()).min(1).max(500),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(10, "Write the message body").max(50_000),
  reply_to: z
    .string()
    .trim()
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "Invalid reply-to email")
    .default(""),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

export type QuickSendInput = z.infer<typeof quickSendSchema>;

// One-off blast straight from a lead selection: no draft, no composer
// page. Creates a kind='quick' campaign row behind the scenes (so the
// unsubscribe tokens, suppression checks, and webhook stats all work
// exactly like a campaign) and delivers immediately.
export async function quickSendEmail(
  input: QuickSendInput,
): Promise<
  | { ok: true; sent: number; failed: number; skipped: number; campaignId: string }
  | { ok: false; error: string }
> {
  const parsed = quickSendSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid email.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const mailer = getMailer();
  if (!mailer.ok) return { ok: false, error: mailer.error };

  const employee = await getCurrentEmployee();
  const supabase = await createClient();
  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .insert({
      kind: "quick",
      name: `Quick: ${parsed.data.subject}`.slice(0, 200),
      list_id: null,
      recipient_prospect_ids: parsed.data.prospectIds,
      subject: parsed.data.subject,
      body: parsed.data.body,
      reply_to: parsed.data.reply_to || null,
      attachments: parsed.data.attachments,
      created_by: "error" in employee ? null : employee.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const r = await sendCampaign(campaign.id);
  if (!r.ok) {
    // Leave the draft behind so nothing typed is lost - it can be sent
    // or deleted from /campaigns.
    return {
      ok: false,
      error: `${r.error} (your message was saved as a draft under Campaigns)`,
    };
  }
  return { ...r, campaignId: campaign.id };
}

// ---------- Templates ----------

const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(10).max(50_000),
});

export async function saveTemplate(input: {
  name: string;
  subject: string;
  body: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid template.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const employee = await getCurrentEmployee();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      ...parsed.data,
      created_by: "error" in employee ? null : employee.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/campaigns");
  return { ok: true, id: data.id };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing template id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/campaigns");
  return { ok: true };
}

// ---------- Test send ----------

export async function sendTestEmail(
  campaignId: string,
): Promise<ActionResult> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  const employee = await getCurrentEmployee();
  if ("error" in employee) return { ok: false, error: employee.error };

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("subject, body, from_name, reply_to, attachments")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const attachmentsResult = await loadAttachmentContents(
    (campaign.attachments ?? []) as CampaignAttachment[],
  );
  if (!attachmentsResult.ok) {
    return { ok: false, error: attachmentsResult.error };
  }

  const mailer = getMailer();
  if (!mailer.ok) return { ok: false, error: mailer.error };

  const me: MergeRecipient = {
    first_name: employee.first_name,
    last_name: employee.last_name,
    email: employee.email,
    company_name: "Example Co",
    location: "Example, ST",
  };
  const subject = `[TEST] ${renderMerge(campaign.subject, me)}`;
  const bodyText = renderMerge(campaign.body, me);
  // Test sends use a dummy unsubscribe target.
  const unsub = unsubscribeUrlFor("test");

  const fromHeader = `${campaign.from_name} <${mailer.from.replace(/^.*<|>$/g, "")}>`;
  const { error } = await mailer.resend.emails.send({
    from: fromHeader,
    to: employee.email,
    subject,
    html: renderHtml(bodyText, unsub),
    text: renderTextWithFooter(bodyText, unsub),
    // Always give recipients a monitored reply path.
    replyTo: campaign.reply_to ?? "careers@example.com",
    attachments:
      attachmentsResult.payload.length > 0
        ? attachmentsResult.payload
        : undefined,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------- The real send ----------

const BATCH_SIZE = 50;

export async function sendCampaign(
  campaignId: string,
): Promise<
  | { ok: true; sent: number; failed: number; skipped: number }
  | { ok: false; error: string }
> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  if (!campaignId) return { ok: false, error: "Missing campaign id." };

  const mailer = getMailer();
  if (!mailer.ok) return { ok: false, error: mailer.error };

  const supabase = await createClient();
  const { data: campaign, error: cErr } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (campaign.status !== "Draft") {
    return { ok: false, error: `Campaign is ${campaign.status} - only Drafts can be sent.` };
  }

  const attachmentsResult = await loadAttachmentContents(
    (campaign.attachments ?? []) as CampaignAttachment[],
  );
  if (!attachmentsResult.ok) {
    return { ok: false, error: attachmentsResult.error };
  }
  const attachments = attachmentsResult.payload;
  const selectionIds = campaign.recipient_prospect_ids ?? null;
  if (!campaign.list_id && !selectionIds?.length) {
    return { ok: false, error: "Campaign has no list." };
  }

  // Recipient set: either the hand-picked selection or the whole list -
  // in both cases only rows with an email AND marketing consent,
  // deduped (lowercase), minus the global suppression list.
  let prospectsQuery = supabase
    .from("prospects")
    .select("id, first_name, last_name, email, company_name, location, marketing_consent")
    .not("email", "is", null)
    .limit(5000);
  prospectsQuery = selectionIds?.length
    ? prospectsQuery.in("id", selectionIds)
    : prospectsQuery.eq("list_id", campaign.list_id!);
  const { data: prospects, error: pErr } = await prospectsQuery;
  if (pErr) return { ok: false, error: pErr.message };

  const byEmail = new Map<
    string,
    { id: string } & MergeRecipient
  >();
  for (const p of prospects ?? []) {
    if (!p.marketing_consent) continue;
    const e = p.email!.toLowerCase().trim();
    if (!e || byEmail.has(e)) continue;
    byEmail.set(e, {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: e,
      company_name: p.company_name,
      location: p.location,
    });
  }

  const allEmails = [...byEmail.keys()];
  let suppressed = new Set<string>();
  if (allEmails.length > 0) {
    const { data: sup } = await supabase
      .from("email_suppressions")
      .select("email")
      .in("email", allEmails);
    suppressed = new Set((sup ?? []).map((s) => s.email));
  }
  const recipients = allEmails
    .filter((e) => !suppressed.has(e))
    .map((e) => byEmail.get(e)!);

  if (recipients.length === 0) {
    return {
      ok: false,
      error:
        "No mailable recipients: everyone is either missing an email, lacking marketing consent, or unsubscribed.",
    };
  }

  // Create the per-recipient send rows up front (gives each its
  // unsubscribe token) and flip the campaign to Sending.
  const { data: sendRows, error: insErr } = await supabase
    .from("email_sends")
    .insert(
      recipients.map((r) => ({
        campaign_id: campaignId,
        prospect_id: r.id,
        email: r.email,
      })),
    )
    .select("id, email, unsubscribe_token");
  if (insErr) return { ok: false, error: insErr.message };

  const tokenByEmail = new Map(
    (sendRows ?? []).map((s) => [s.email, { id: s.id, token: s.unsubscribe_token }]),
  );

  await supabase
    .from("email_campaigns")
    .update({ status: "Sending", total_recipients: recipients.length })
    .eq("id", campaignId);

  const fromAddress = mailer.from.replace(/^.*<|>$/g, "");
  const fromHeader = `${campaign.from_name} <${fromAddress}>`;

  let sent = 0;
  let failed = 0;

  const buildEmail = (r: (typeof recipients)[number]) => {
    const meta = tokenByEmail.get(r.email)!;
    const unsub = unsubscribeUrlFor(meta.token);
    const bodyText = renderMerge(campaign.body, r);
    return {
      from: fromHeader,
      to: r.email,
      subject: renderMerge(campaign.subject, r),
      html: renderHtml(bodyText, unsub),
      text: renderTextWithFooter(bodyText, unsub),
      // Always give recipients a monitored reply path.
      replyTo: campaign.reply_to ?? "careers@example.com",
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  };

  if (attachments.length > 0) {
    // Resend's batch endpoint doesn't accept attachments, so attached
    // campaigns go one email at a time, throttled under the 2 req/s
    // API limit.
    for (const r of recipients) {
      const rowId = tokenByEmail.get(r.email)!.id;
      try {
        const { data: res, error } = await mailer.resend.emails.send({
          ...buildEmail(r),
          attachments,
        });
        if (error || !res) {
          failed += 1;
          await supabase
            .from("email_sends")
            .update({ status: "failed", error: error?.message ?? "Send failed" })
            .eq("id", rowId);
        } else {
          sent += 1;
          await supabase
            .from("email_sends")
            .update({ status: "sent", resend_id: res.id })
            .eq("id", rowId);
        }
      } catch (e) {
        failed += 1;
        await supabase
          .from("email_sends")
          .update({
            status: "failed",
            error: e instanceof Error ? e.message : "Send threw",
          })
          .eq("id", rowId);
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  } else {
    // No attachments: batched via Resend's batch endpoint; modest
    // batches + a breather between them stays under rate limits.
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const payload = batch.map(buildEmail);

      try {
        const { data: res, error } = await mailer.resend.batch.send(payload);
        if (error || !res) {
          failed += batch.length;
          await supabase
            .from("email_sends")
            .update({ status: "failed", error: error?.message ?? "Batch send failed" })
            .in("id", batch.map((r) => tokenByEmail.get(r.email)!.id));
        } else {
          sent += batch.length;
          // Stamp each row with its Resend id so webhooks can find it.
          await Promise.all(
            res.data.map((item, idx) => {
              const r = batch[idx];
              return supabase
                .from("email_sends")
                .update({ status: "sent", resend_id: item.id })
                .eq("id", tokenByEmail.get(r.email)!.id);
            }),
          );
        }
      } catch (e) {
        failed += batch.length;
        await supabase
          .from("email_sends")
          .update({
            status: "failed",
            error: e instanceof Error ? e.message : "Batch send threw",
          })
          .in("id", batch.map((r) => tokenByEmail.get(r.email)!.id));
      }

      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  await supabase
    .from("email_campaigns")
    .update({
      status: failed > 0 && sent === 0 ? "Failed" : "Sent",
      sent_count: sent,
      failed_count: failed,
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  await logActivity({
    verb: "campaign_sent",
    summary: `Campaign sent: ${campaign.name} (${sent} delivered to Resend${failed ? `, ${failed} failed` : ""})`,
    metadata: { campaign_id: campaignId, sent, failed },
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true,
    sent,
    failed,
    skipped: allEmails.length - recipients.length,
  };
}
