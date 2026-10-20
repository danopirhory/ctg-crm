import { createHmac, timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

// Resend webhook receiver. Point a Resend webhook at
//   <crm-origin>/api/email/webhook
// with events: email.delivered, email.opened, email.clicked,
// email.bounced, email.complained.
//
// Signature: Resend signs with Svix. Set RESEND_WEBHOOK_SECRET (the
// "whsec_..." value) to enforce verification; without it we accept
// but log a warning (fine for initial wiring, set it before launch).

type SendStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "unsubscribed";

const EVENT_TO_STATUS: Record<string, SendStatus> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

// Status progression - never downgrade (an "opened" send that later
// reports "delivered" stays opened). Bounce/complaint always win.
const RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  failed: 5,
  unsubscribed: 6,
  bounced: 7,
  complained: 8,
};

function verifySvix(req: Request, payload: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[email-webhook] RESEND_WEBHOOK_SECRET not set - accepting unverified");
    return true;
  }
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatures = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;

  // Reject stale timestamps (>5 min) to block replays.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // Header form: "v1,<base64> v1,<base64> ..."
  for (const part of signatures.split(" ")) {
    const [, sig] = part.split(",");
    if (!sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifySvix(req, payload)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string; to?: string[] } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = event.type ? EVENT_TO_STATUS[event.type] : undefined;
  const resendId = event.data?.email_id;
  if (!status || !resendId) {
    // Unhandled event type - acknowledge so Resend doesn't retry.
    return Response.json({ ok: true, ignored: true });
  }

  const supabase = createAdminClient();
  const { data: send } = await supabase
    .from("email_sends")
    .select("id, email, campaign_id, status")
    .eq("resend_id", resendId)
    .maybeSingle();
  if (!send) return Response.json({ ok: true, unmatched: true });

  if ((RANK[status] ?? 0) > (RANK[send.status] ?? 0)) {
    await supabase
      .from("email_sends")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", send.id);
  }

  // Hard-bounce / complaint → global suppression so we never mail
  // this address again. Complaints also flip consent off.
  if (status === "bounced" || status === "complained") {
    await supabase.from("email_suppressions").upsert(
      {
        email: send.email,
        reason: status === "bounced" ? "bounced" : "complained",
        source_campaign_id: send.campaign_id,
      },
      { onConflict: "email" },
    );
    if (status === "complained") {
      await Promise.all([
        supabase
          .from("prospects")
          .update({ marketing_consent: false })
          .ilike("email", send.email),
        supabase
          .from("candidates")
          .update({ marketing_consent: false })
          .ilike("email", send.email),
      ]);
    }
  }

  return Response.json({ ok: true });
}
