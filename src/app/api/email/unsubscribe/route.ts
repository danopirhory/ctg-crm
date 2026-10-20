import { createAdminClient } from "@/lib/supabase/admin";

// One-click unsubscribe. Linked from every campaign email footer and
// the List-Unsubscribe header (major mailbox providers' bulk-sender rules).
// GET renders a tiny confirmation page; POST (the one-click header
// flow) does the same silently.

async function unsubscribe(token: string): Promise<boolean> {
  if (!token || token === "test") return false;
  const supabase = createAdminClient();

  const { data: send } = await supabase
    .from("email_sends")
    .select("id, email, campaign_id")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!send) return false;

  // 1. Global suppression - never mailed again by any campaign.
  await supabase.from("email_suppressions").upsert(
    {
      email: send.email,
      reason: "unsubscribed",
      source_campaign_id: send.campaign_id,
    },
    { onConflict: "email" },
  );

  // 2. Flip consent off everywhere this email exists, so the CRM UI
  //    reflects reality.
  await Promise.all([
    supabase
      .from("prospects")
      .update({ marketing_consent: false })
      .ilike("email", send.email),
    supabase
      .from("candidates")
      .update({ marketing_consent: false })
      .ilike("email", send.email),
    supabase
      .from("email_sends")
      .update({ status: "unsubscribed" })
      .eq("id", send.id),
  ]);

  return true;
}

function page(title: string, message: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:Arial,Helvetica,sans-serif;background:#f7fafc;">
  <div style="max-width:420px;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
    <h1 style="font-size:18px;margin:0 0 8px 0;color:#1a202c;">${title}</h1>
    <p style="font-size:14px;color:#4a5568;margin:0;">${message}</p>
  </div>
</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await unsubscribe(token);
  return ok
    ? page(
        "You're unsubscribed",
        "You won't receive any more emails from Command Talent Group. If this was a mistake, just reply to any previous email and we'll add you back.",
      )
    : page(
        "Link not recognized",
        "This unsubscribe link is invalid or has already been used.",
      );
}

// RFC 8058 one-click POST from mail clients.
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  await unsubscribe(token);
  return new Response(null, { status: 200 });
}
