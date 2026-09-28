import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";

export const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

// Data boundary: every message passed to these functions is sent to Google's
// Generative Language API. Nothing here can hide the text from Google. The UI
// must disclose this before the interview starts.

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

// Only the provider name reaches the model. Credential parameter values may
// contain identifying data, so they are never included in prompts.
function credentialSummary(credential: VerifiedCredential) {
  return `provider ${credential.provider}, fields disclosed: ${Object.keys(credential.parameters).join(", ") || "none"}`;
}

function buildInterviewSystemPrompt(credential: VerifiedCredential): string {
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

function buildArticlePrompt(messages: ChatMessage[], credential: VerifiedCredential): string {
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
  "body": "Full article in Markdown with ## section headings, at most 12000 characters"
}

Rules:
- Write in third person.
- Every claim from the source is an allegation reported by the source. Label it that way. Do not describe any claim as verified, confirmed, or corroborated unless the transcript cites a public record that the reader can check.
- Include a short section titled "What has been proven" that states only that the source proved the credential, and a section titled "What has not been independently corroborated".
- Do not include any detail that could identify the source. Remove names, dates of specific personal events, team sizes, office locations, and unique phrasing from documents.
- Do not include a confidence score or any numeric rating.
- Do not use em dashes or en dashes.
- Output only valid JSON, no Markdown code fences.`;
}

async function callGemini(contents: GeminiContent[], systemInstruction?: string): Promise<string> {
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 8192, responseMimeType: "application/json" },
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

  const res = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`The AI provider returned status ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function conductInterviewStream(
  messages: ChatMessage[],
  credential: VerifiedCredential,
): Promise<ReadableStream<Uint8Array>> {
  const contents: GeminiContent[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(GEMINI_STREAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: buildInterviewSystemPrompt(credential) }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    throw new Error(`The AI provider returned status ${res.status}`);
  }

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json) continue;
            try {
              const parsed = JSON.parse(json);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
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
    body,
    sourceStatus: "credential-proven",
    allegationStatus: "reported",
  };
}

export async function generateArticle(
  messages: ChatMessage[],
  credential: VerifiedCredential,
): Promise<ArticleDraft> {
  const response = await callGemini([
    { role: "user", parts: [{ text: buildArticlePrompt(messages, credential) }] },
  ]);
  return parseArticleResponse(response);
}
