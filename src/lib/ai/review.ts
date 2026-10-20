import "server-only";

import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

// =====================================================================
// AI-assisted candidate-for-job review generator.
//
// The CRM never speaks to OpenAI directly. This module is the single
// entry point: every call goes through `generateCandidateJobReview`,
// which validates configuration, fans a structured prompt at OpenAI,
// and returns a Zod-typed object the rest of the app can persist.
// =====================================================================

export const REVIEW_DEFAULT_MODEL = "gpt-4o";

// Shape the AI must return. Zod gives us runtime validation AND
// generateObject auto-coerces / retries against this schema.
//
// Every text field is an array of SHORT phrases - never sentences,
// never narrative. The max(80) char ceiling on each bullet is wider
// than the recruiter's stated target (~6 words) but tight enough to
// actively push back if the model starts essay-writing.
const bulletField = z.string().min(2).max(80);

export const candidateReviewSchema = z.object({
  background: z
    .array(bulletField)
    .min(3)
    .max(6)
    .describe(
      "Resume line items - credentials, roles, programs. 3-5 short phrases. NEVER prose.",
    ),
  strengths: z
    .array(bulletField)
    .min(3)
    .max(6)
    .describe(
      "Traits and compressed accomplishments grounded in the resume. 3-5 short phrases.",
    ),
  areas_to_validate: z
    .array(bulletField)
    .min(2)
    .max(6)
    .describe(
      "Name the GAP in 2-6 words. Never tell the interviewer what to do - just point at the unknown.",
    ),
  interview_focus: z
    .array(bulletField)
    .min(2)
    .max(6)
    .describe(
      "Topic to probe, 2-4 words each. No verbs like 'Explore', 'Pressure-test', 'Investigate'.",
    ),
  role_fit_score: z
    .number()
    .min(0)
    .max(3)
    .describe(
      "Overall role fit on a 0..3 scale. 0=no fit, 1=stretch, 2=solid, 3=clear yes.",
    ),
  rubric_scores: z
    .array(
      z.object({
        criterion: z.string().max(120),
        score: z.number().min(0).max(3),
        weight: z.number().min(1).max(5),
      }),
    )
    .describe(
      "Per-criterion scores against the rubric the caller supplied. Echo each criterion + its weight + your 0..3 score.",
    ),
});

export type CandidateReview = z.infer<typeof candidateReviewSchema>;

// Compact rubric entries the prompt sees. Recruiter-edited weights stay
// authoritative - the AI never invents new weights.
export type RoleRubricEntry = { criterion: string; weight: number };

export type GenerateInput = {
  candidate: {
    first_name: string | null;
    last_name: string | null;
    location: string | null;
    military_branch: string | null;
    rank: string | null;
    mos_or_specialty: string | null;
    clearance: string | null;
    years_of_service: number | null;
    target_industry: string | null;
    target_location: string | null;
    source: string | null;
    tags: string[];
  };
  job: {
    title: string;
    company_name: string;
    location: string | null;
    description: string | null;
    requirements: string | null;
  };
  rubric: RoleRubricEntry[]; // empty array → AI infers a sensible rubric
  resumeText: string | null; // null means "Pending Resume" - caller handles
  houseStylePrompt?: string;
  model?: string;
};

export type GenerateResult =
  | { ok: true; data: CandidateReview; model: string }
  | { ok: false; error: string; reason: "no-resume" | "no-key" | "ai" };

// Fail-fast configuration check. The OPENAI_API_KEY env var is the only
// runtime dependency - without it we return a clean error so the UI
// can render "Configure OpenAI to generate" instead of crashing.
function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      ok: false as const,
      error:
        "OPENAI_API_KEY is not set. Add it to the server env (Vercel → Project → Settings → Environment Variables) and redeploy to enable AI generation.",
    };
  }
  return { ok: true as const, client: createOpenAI({ apiKey: key }) };
}

export async function generateCandidateJobReview(
  input: GenerateInput,
): Promise<GenerateResult> {
  if (!input.resumeText || input.resumeText.trim().length < 40) {
    return {
      ok: false,
      reason: "no-resume",
      error:
        "Candidate has no usable resume yet. Upload a resume to enable AI review.",
    };
  }

  const cfg = getClient();
  if (!cfg.ok) return { ok: false, reason: "no-key", error: cfg.error };

  const candidateName =
    [input.candidate.first_name, input.candidate.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "(unnamed)";
  const model = input.model ?? REVIEW_DEFAULT_MODEL;

  const rubricBlock =
    input.rubric.length > 0
      ? `Recruiter-supplied rubric (use these criteria, do not invent your own; respect the weights):\n${input.rubric
          .map((r) => `- ${r.criterion} (weight ${r.weight})`)
          .join("\n")}`
      : `No explicit rubric was supplied. Infer 3-5 sensible criteria from the job description and the role title. Assign a weight 1-5 to each based on apparent importance in the job text.`;

  const candidateFacts = [
    input.candidate.location && `Location: ${input.candidate.location}`,
    input.candidate.military_branch &&
      `Military branch: ${input.candidate.military_branch}`,
    input.candidate.rank && `Rank: ${input.candidate.rank}`,
    input.candidate.mos_or_specialty &&
      `MOS / Specialty: ${input.candidate.mos_or_specialty}`,
    input.candidate.clearance && `Clearance: ${input.candidate.clearance}`,
    input.candidate.years_of_service != null &&
      `Years of service: ${input.candidate.years_of_service}`,
    input.candidate.target_industry &&
      `Target industry: ${input.candidate.target_industry}`,
    input.candidate.target_location &&
      `Target location: ${input.candidate.target_location}`,
    input.candidate.tags.length > 0 &&
      `Tags: ${input.candidate.tags.join(", ")}`,
    input.candidate.source && `Source: ${input.candidate.source}`,
  ]
    .filter(Boolean)
    .join("\n");

  const houseStyle =
    input.houseStylePrompt ??
    "Write like a recruiter scribbling on a notepad before a quick stand-up. Compress relentlessly. Strip articles.";

  const systemPrompt = `You are a senior recruiting analyst at Command Talent Group. You produce a single-page review packet that a partner glances at before an interview.

# OUTPUT STYLE - HARD RULES

1. Every bullet is a PHRASE. Never a sentence. No periods.
2. 2-7 words per bullet. Hard ceiling at 8 words. Hard floor at 2.
3. NEVER start a bullet with: "Clarify", "Confirm", "Investigate", "Explore", "Pressure-test", "Assess", "The candidate", "He has", "She brings", "Led", "Orchestrated", "Developed", "Demonstrated".
4. NO quoted strings of metrics ('4x increase in...'). NO parentheticals explaining context. NO em-dashes joining clauses.
5. NO marketing adjectives ("impressive", "extensive", "remarkable", "robust", "comprehensive", "proven").

${houseStyle}

# FIELD-BY-FIELD STYLE GUIDE

\`background\` - RESUME LINE ITEMS. Credentials, roles, programs. 3-5 items.
  GOOD: "Army Officer (Logistics)" · "Joint operations planning" · "Professional military education graduate" · "Service: 2012 - 2022"
  BAD : "Jordan Reyes has over 10 years of experience in operations leadership..."

\`strengths\` - TRAITS or COMPRESSED RESULTS. 3-5 phrases.
  GOOD: "Strong leadership background" · "Influences without authority" · "Metro-area based, open to travel" · "Cybersecurity program exposure"
  BAD : "Led cross-functional operations supporting $10M+ in annual production"

\`areas_to_validate\` - NAME THE GAP. Do NOT direct the interviewer.
  GOOD: "Limited direct industry experience" · "Generic resume language" · "Strategic planning depth unclear" · "Comfort with client-facing work"
  BAD : "Clarify the specific metrics used to measure 'measurable improvements in cost...'"

\`interview_focus\` - TOPIC TO PROBE. 2-4 words. No verbs.
  GOOD: "Relationship building" · "Personality & likability" · "Communication style" · "Stakeholder management"
  BAD : "Pressure-test the candidate's understanding of project management methodologies"

# REASONING

- Ground every strength and concern in something the resume actually says.
- The 0..3 \`role_fit_score\` must reconcile with the rubric subscores. Do not contradict yourself.
- If a candidate has weak fit, say so via short flat phrases in \`areas_to_validate\`. Do not soften.`;

  const userPrompt = `# Role
${input.job.title} at ${input.job.company_name}${input.job.location ? ` (${input.job.location})` : ""}

## Description
${input.job.description?.trim() || "(none provided)"}

## Requirements
${input.job.requirements?.trim() || "(none provided)"}

## Rubric
${rubricBlock}

# Candidate: ${candidateName}
${candidateFacts || "(no structured fields beyond name)"}

## Resume
${input.resumeText.trim().slice(0, 18_000)}
`;

  try {
    const { object } = await generateObject({
      model: cfg.client(model),
      schema: candidateReviewSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.1,
    });
    return { ok: true, data: object, model };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown OpenAI error.";
    return { ok: false, reason: "ai", error: message };
  }
}

// =====================================================================
// Company-level narrative - the three callout boxes that frame the
// candidate-review document (Key Takeaways, Next Steps, Notes).
//
// This runs after every (candidate, job) review has been generated, so
// the prompt receives the already-distilled bullets rather than raw
// resumes. That keeps token cost predictable even for 8+ candidates
// across 2 roles.
// =====================================================================

export const companyNarrativeSchema = z.object({
  key_takeaways: z
    .array(bulletField)
    .min(2)
    .max(5)
    .describe(
      "Strategic highlights across the candidate pool. Name the strongest fits + standout high-upside picks. 2-5 phrases.",
    ),
  next_steps: z
    .array(bulletField)
    .min(2)
    .max(5)
    .describe(
      "Recommended workflow steps for the recruiter. 2-5 short directives, written like calendar entries.",
    ),
  notes: z
    .array(bulletField)
    .min(2)
    .max(5)
    .describe(
      "Cross-cutting reminders the interviewer should keep top of mind. 2-5 phrases.",
    ),
});

export type CompanyNarrative = z.infer<typeof companyNarrativeSchema>;

export type GenerateCompanyNarrativeInput = {
  company: { company_name: string; industry: string | null };
  jobs: { id: string; title: string }[];
  // One entry per candidate. Each row carries the already-merged bullets
  // we render in the live table so the narrative is consistent with
  // what a reader actually sees.
  candidates: {
    name: string;
    location: string | null;
    background: string[];
    strengths: string[];
    areas_to_validate: string[];
    interview_focus: string[];
    role_fits: { job_title: string; score: number | null }[];
  }[];
  // Per-job ranked candidate names (top first).
  rankings: { job_title: string; ordered_names: string[] }[];
  model?: string;
};

export type GenerateCompanyNarrativeResult =
  | { ok: true; data: CompanyNarrative; model: string }
  | { ok: false; error: string; reason: "no-data" | "no-key" | "ai" };

export async function generateCompanyReviewNarrative(
  input: GenerateCompanyNarrativeInput,
): Promise<GenerateCompanyNarrativeResult> {
  if (input.candidates.length === 0) {
    return {
      ok: false,
      reason: "no-data",
      error:
        "No candidates with reviews yet. Generate at least one candidate review before drafting a narrative.",
    };
  }
  const cfg = getClient();
  if (!cfg.ok) return { ok: false, reason: "no-key", error: cfg.error };

  const model = input.model ?? REVIEW_DEFAULT_MODEL;

  const candidatesBlock = input.candidates
    .map((c, i) => {
      const fits = c.role_fits
        .map(
          (f) =>
            `${f.job_title}: ${f.score == null ? "-" : f.score.toFixed(1)}/3`,
        )
        .join(" · ");
      return [
        `## ${i + 1}. ${c.name}${c.location ? ` (${c.location})` : ""}`,
        `Role fit - ${fits || "(no scores yet)"}`,
        `Background: ${c.background.join(" · ") || "-"}`,
        `Strengths: ${c.strengths.join(" · ") || "-"}`,
        `Areas to validate: ${c.areas_to_validate.join(" · ") || "-"}`,
        `Interview focus: ${c.interview_focus.join(" · ") || "-"}`,
      ].join("\n");
    })
    .join("\n\n");

  const rankingsBlock = input.rankings
    .map(
      (r) =>
        `Best fit for ${r.job_title}: ${
          r.ordered_names.length > 0 ? r.ordered_names.join(" → ") : "(no scores)"
        }`,
    )
    .join("\n");

  const systemPrompt = `You are a senior recruiting analyst at Command Talent Group. You produce the three header/footer callouts that wrap a single-page candidate-review packet.

# OUTPUT STYLE - HARD RULES

1. Every bullet is a PHRASE. Never a sentence. No periods at the end of a phrase.
2. 4-12 words per bullet. Hard ceiling at 14 words.
3. Be SPECIFIC. Name candidates by full name when relevant.
4. NO marketing adjectives ("impressive", "remarkable", "exceptional", "outstanding", "stellar").
5. NO hedging ("perhaps", "may be", "potentially").

# FIELD GUIDE

\`key_takeaways\` - Strategic highlights across the pool.
  GOOD: "Strongest overall: Jordan Reyes and Sam Khan" · "Riley Chen is high-potential with limited industry experience" · "Interview goal: assess personality and relationship-building"
  BAD : "There are many great candidates with diverse skills"

\`next_steps\` - Recruiter workflow directives, calendar-entry style.
  GOOD: "Complete first interviews by end of week" · "Line up finalist interviews next week" · "Evaluate feedback; move forward with top candidates"
  BAD : "The team should evaluate the candidates carefully"

\`notes\` - Cross-cutting interview themes / differentiators.
  GOOD: "Personality and likability are critical across the board" · "Client focus and relationship-building are differentiators" · "Reyes and Khan align with target markets"
  BAD : "Make sure to consider the candidate's overall fit"`;

  const userPrompt = `# Client
${input.company.company_name}${input.company.industry ? ` - ${input.company.industry}` : ""}

# Open roles being reviewed
${input.jobs.map((j) => `- ${j.title}`).join("\n") || "(no jobs)"}

# Per-job ranking
${rankingsBlock}

# Candidates

${candidatesBlock}`;

  try {
    const { object } = await generateObject({
      model: cfg.client(model),
      schema: companyNarrativeSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.2,
    });
    return { ok: true, data: object, model };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown OpenAI error.";
    return { ok: false, reason: "ai", error: message };
  }
}
