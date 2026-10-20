import "server-only";

import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { REVIEW_DEFAULT_MODEL } from "./review";

// =====================================================================
// Lightweight AI assists: outreach drafting,
// natural-language candidate search translation, and call-note
// structuring. All run on the same OpenAI key as the review engine.
// =====================================================================

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      ok: false as const,
      error:
        "OPENAI_API_KEY is not set. Add it to the server env to enable AI features.",
    };
  }
  return { ok: true as const, client: createOpenAI({ apiKey: key }) };
}

type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------- Outreach drafting ----------

export const outreachDraftSchema = z.object({
  subject: z
    .string()
    .max(90)
    .describe("Email subject line. Empty string for LinkedIn messages."),
  body: z
    .string()
    .min(40)
    .max(1500)
    .describe("The message body, plain text, ready to send."),
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

export type OutreachInput = {
  channel: "email" | "linkedin";
  recipient: {
    first_name: string | null;
    last_name: string | null;
    military_branch: string | null;
    rank: string | null;
    mos_or_specialty: string | null;
    clearance: string | null;
    location: string | null;
    target_industry: string | null;
  };
  job: { title: string; company_name: string; location: string | null } | null;
  senderName: string | null;
};

export async function generateOutreachDraft(
  input: OutreachInput,
): Promise<AiResult<OutreachDraft>> {
  const cfg = getClient();
  if (!cfg.ok) return { ok: false, error: cfg.error };

  const lengthRule =
    input.channel === "email"
      ? "120-180 words. Include a subject line."
      : "60-100 words. subject must be an empty string.";

  const recipientFacts = [
    input.recipient.military_branch &&
      `Branch: ${input.recipient.military_branch}`,
    input.recipient.rank && `Rank: ${input.recipient.rank}`,
    input.recipient.mos_or_specialty &&
      `MOS/Specialty: ${input.recipient.mos_or_specialty}`,
    input.recipient.clearance && `Clearance: ${input.recipient.clearance}`,
    input.recipient.location && `Location: ${input.recipient.location}`,
    input.recipient.target_industry &&
      `Target industry: ${input.recipient.target_industry}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: cfg.client(REVIEW_DEFAULT_MODEL),
      schema: outreachDraftSchema,
      system: `You write first-touch recruiting outreach for Command Talent Group, a firm that places transitioning military veterans. Rules:
1. Respectful, direct, zero fluff. No "I hope this finds you well". No exclamation marks.
2. Reference ONE specific detail from the recipient's background - their branch, specialty, or clearance - so it reads personal, not mail-merged.
3. ${lengthRule}
4. End with a low-pressure ask (15-minute call, reply if interested).
5. Sign with the sender's first name only.
6. Never invent facts about the role or the recipient.`,
      prompt: `Channel: ${input.channel}
Recipient: ${[input.recipient.first_name, input.recipient.last_name].filter(Boolean).join(" ") || "(name unknown)"}
${recipientFacts || "(no background details on file)"}

${
  input.job
    ? `Role to pitch: ${input.job.title} at ${input.job.company_name}${input.job.location ? ` (${input.job.location})` : ""}`
    : "No specific role - this is a network-building / talent-community touch."
}

Sender: ${input.senderName ?? "the recruiter"}`,
      temperature: 0.4,
    });
    return { ok: true, data: object };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Outreach drafting failed.",
    };
  }
}

// ---------- Natural-language candidate search ----------

export const searchFilterSchema = z.object({
  military_branch: z
    .string()
    .describe("Branch filter like 'Army', 'Navy'. Empty string if not specified.")
    .default(""),
  clearance_required: z
    .boolean()
    .describe("True if the query asks for candidates holding any clearance.")
    .default(false),
  clearance_level: z
    .string()
    .describe("Specific clearance like 'Top Secret'. Empty if unspecified.")
    .default(""),
  location_terms: z
    .array(z.string())
    .max(4)
    .describe("Location words to match, e.g. ['Texas', 'TX'].")
    .default([]),
  industry_terms: z
    .array(z.string())
    .max(4)
    .describe("Target-industry words, e.g. ['sales', 'logistics'].")
    .default([]),
  min_years_of_service: z.number().nullable().default(null),
  name_terms: z
    .array(z.string())
    .max(3)
    .describe("Only when the query is clearly about a person's name.")
    .default([]),
});

export type SearchFilters = z.infer<typeof searchFilterSchema>;

export async function translateSearchQuery(
  query: string,
): Promise<AiResult<SearchFilters>> {
  const cfg = getClient();
  if (!cfg.ok) return { ok: false, error: cfg.error };
  try {
    const { object } = await generateObject({
      // Mini is plenty for filter extraction and keeps palette latency low.
      model: cfg.client("gpt-4o-mini"),
      schema: searchFilterSchema,
      system:
        "Translate a recruiter's natural-language candidate search into structured filters. Extract only what is explicitly stated; leave everything else at its default. US state abbreviations should expand into both forms (e.g. 'TX' -> ['Texas','TX']).",
      prompt: query,
      temperature: 0,
    });
    return { ok: true, data: object };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Search translation failed.",
    };
  }
}

// ---------- Call-note structuring ----------

export const structuredNotesSchema = z.object({
  summary: z
    .string()
    .max(400)
    .describe("2-3 sentence summary of the conversation."),
  key_points: z
    .array(z.string().max(160))
    .min(1)
    .max(8)
    .describe("The facts worth remembering, one per bullet."),
  action_items: z
    .array(z.string().max(120))
    .max(6)
    .describe("Concrete follow-ups phrased as task titles, e.g. 'Send resume to hiring manager'."),
});

export type StructuredNotes = z.infer<typeof structuredNotesSchema>;

export async function structureCallNotes(
  raw: string,
): Promise<AiResult<StructuredNotes>> {
  const cfg = getClient();
  if (!cfg.ok) return { ok: false, error: cfg.error };
  try {
    const { object } = await generateObject({
      model: cfg.client(REVIEW_DEFAULT_MODEL),
      schema: structuredNotesSchema,
      system:
        "You turn a recruiter's raw, messy call notes into a clean structured note. Preserve every concrete fact (dates, numbers, names, preferences). Do not invent anything. Action items must be things the RECRUITER needs to do.",
      prompt: raw.slice(0, 12_000),
      temperature: 0.1,
    });
    return { ok: true, data: object };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Note structuring failed.",
    };
  }
}
