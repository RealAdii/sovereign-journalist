import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";
import { buildArticlePrompt, buildInterviewSystemPrompt, parseArticleResponse } from "./prompts";

export { parseArticleResponse };

export const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

// Data boundary: every message passed to these functions is sent to Google's
// Generative Language API. Nothing here can hide the text from Google. Select
// this backend with AI_PROVIDER=gemini; the default is the local Ollama backend.

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
  if (!res.ok) throw new Error(`The AI provider returned status ${res.status}`);
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
  if (!res.ok) throw new Error(`The AI provider returned status ${res.status}`);

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
              const text = JSON.parse(json).candidates?.[0]?.content?.parts?.[0]?.text;
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

export async function generateArticle(messages: ChatMessage[], credential: VerifiedCredential): Promise<ArticleDraft> {
  const response = await callGemini([{ role: "user", parts: [{ text: buildArticlePrompt(messages, credential) }] }]);
  return parseArticleResponse(response);
}
