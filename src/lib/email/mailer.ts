import "server-only";

import { Resend } from "resend";

// =====================================================================
// Resend delivery layer for the in-CRM campaign engine.
//
// Env contract (all server-side):
//   RESEND_API_KEY    - required to send
//   RESEND_FROM_EMAIL - verified sender, e.g.
//                       "Command Talent Group <talent@example.com>"
//   NEXT_PUBLIC_APP_URL - CRM origin used to build unsubscribe links,
//                       e.g. https://crm.example.com
// =====================================================================

export function getMailer():
  | { ok: true; resend: Resend; from: string }
  | { ok: false; error: string } {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY is not set. Create an API key in Resend and add it to the server env to enable sending.",
    };
  }
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    return {
      ok: false,
      error:
        'RESEND_FROM_EMAIL is not set. Add a verified sender like "Command Talent Group <talent@example.com>".',
    };
  }
  return { ok: true, resend: new Resend(key), from };
}

export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

// ---------- Merge fields ----------

export type MergeRecipient = {
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  location: string | null;
};

// {{first_name}}, {{last_name}}, {{full_name}}, {{email}},
// {{company_name}}, {{location}} - unknown tokens render as "".
export function renderMerge(text: string, r: MergeRecipient): string {
  const map: Record<string, string> = {
    first_name: r.first_name ?? "",
    last_name: r.last_name ?? "",
    full_name: [r.first_name, r.last_name].filter(Boolean).join(" "),
    email: r.email,
    company_name: r.company_name ?? "",
    location: r.location ?? "",
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, token: string) => {
    return map[token.toLowerCase()] ?? "";
  });
}

// ---------- HTML rendering ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Plain text → simple, deliverability-friendly HTML. Double newline =
// paragraph; single = <br>. No images, no heavy styling - text-forward
// emails consistently score better with spam filters.
export function renderHtml(bodyText: string, unsubscribeUrl: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;">
    <div style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a202c;">
      ${paragraphs}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 12px 0;"/>
      <p style="margin:0;font-size:12px;color:#718096;">
        You're receiving this because you're part of the Command Talent
        Group network.
        <a href="${unsubscribeUrl}" style="color:#718096;text-decoration:underline;">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;
}

export function renderTextWithFooter(
  bodyText: string,
  unsubscribeUrl: string,
): string {
  return `${bodyText}\n\n--\nYou're receiving this because you're part of the Command Talent Group network.\nUnsubscribe: ${unsubscribeUrl}`;
}

export function unsubscribeUrlFor(token: string): string {
  return `${appOrigin()}/api/email/unsubscribe?token=${token}`;
}
