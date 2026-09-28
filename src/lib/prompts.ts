import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";

// Only the provider name and the disclosed field names reach a model. Credential
// parameter values may contain identifying data and are never included.
export function credentialSummary(credential: VerifiedCredential) {
  return `provider ${credential.provider}, fields disclosed: ${Object.keys(credential.parameters).join(", ") || "none"}`;
}

export function buildInterviewSystemPrompt(credential: VerifiedCredential): string {
  return `You are an investigative journalist conducting a structured interview with a source.

The source has proven a credential through Reclaim Protocol (${credentialSummary(credential)}). The credential proves that the source could log in to the provider; it does not prove that any claim they make is true.

Your job:
1. Understand what the source wants to report.
2. Ask specific follow-up questions, one at a time.
3. Ask what evidence exists and how it could be corroborated from public information, without asking the source to upload files.
4. After five to eight exchanges, summarize the account and confirm it with the source.

Rules:
- Never ask for the source's name, email, employee ID, location, team, or any other identifying detail.
- Never try to narrow the source's identity through indirect questions.
- If the source volunteers identifying detail, remind them that it may end up in a public article and that they can leave it out.
- Be professional and careful. Ask one question at a time. Keep responses to two to four short paragraphs.
- Do not use em dashes or en dashes in your writing.

Begin by acknowledging that the credential was proven and asking what the source wants to report.`;
}

export function buildArticlePrompt(messages: ChatMessage[], credential: VerifiedCredential): string {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "SOURCE" : "JOURNALIST"}: ${m.content}`)
    .join("\n\n");

  return `Write a draft news article from this interview transcript between a journalist and a source whose credential was proven through Reclaim Protocol (${credentialSummary(credential)}).

TRANSCRIPT:
${transcript}

Return JSON with exactly this structure and nothing else:
{
  "title": "Headline, at most 120 characters",
  "subtitle": "Two sentence summary, at most 300 characters",
  "body": "Full article in Markdown with ## section headings, between 2000 and 8000 characters"
}

Rules:
- Write in third person.
- Every claim from the source is an allegation reported by the source. Label it that way. Do not describe any claim as verified, confirmed, or corroborated unless the transcript cites a public record that the reader can check.
- The body MUST contain these two Markdown headings, spelled exactly, each followed by one or two sentences: "## What has been proven" (stating only that the source proved the credential) and "## What has not been independently corroborated". Put them after the main account. Drafts without both headings are rejected.
- Do not include any detail that could identify the source. Remove names, dates of specific personal events, team sizes, office locations, and unique phrasing from documents.
- Do not include a confidence score or any numeric rating.
- Do not use em dashes or en dashes.
- Output only valid JSON, no Markdown code fences.`;
}

export const PROVEN_HEADING = "## What has been proven";
export const UNCORROBORATED_HEADING = "## What has not been independently corroborated";

const PROVEN_TEXT =
  "The source proved a credential through Reclaim Protocol before the interview. Nothing else in this article is proven by that credential.";
const UNCORROBORATED_TEXT =
  "Every claim above is the source's account as reported to the AI journalist. None of it has been independently corroborated.";

function hasHeading(body: string, heading: string) {
  const title = heading.replace(/^#+\s*/, "").toLowerCase();
  return body
    .split("\n")
    .some((line) => /^#{1,6}\s+/.test(line) && line.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === title);
}

/**
 * Guarantees the two honesty sections are present. Models sometimes skip
 * them (DeepSeek V3.2 via OpenRouter did on 2026-09-29), so missing sections
 * are appended with fixed wording rather than rejecting the draft.
 */
export function ensureRequiredSections(body: string) {
  let out = body.trimEnd();
  if (!hasHeading(out, PROVEN_HEADING)) out += `\n\n${PROVEN_HEADING}\n\n${PROVEN_TEXT}`;
  if (!hasHeading(out, UNCORROBORATED_HEADING)) out += `\n\n${UNCORROBORATED_HEADING}\n\n${UNCORROBORATED_TEXT}`;
  return out;
}

export function parseArticleResponse(raw: string): ArticleDraft {
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const title = String(parsed.title ?? "").trim();
  const body = String(parsed.body ?? "").trim();
  if (!title || !body) throw new Error("The AI draft was missing a title or body");
  return {
    version: 1,
    title,
    subtitle: String(parsed.subtitle ?? "").trim(),
    body: ensureRequiredSections(body),
    sourceStatus: "credential-proven",
    allegationStatus: "reported",
  };
}
