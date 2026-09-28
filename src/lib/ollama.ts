import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";
import { buildArticlePrompt, buildInterviewSystemPrompt, parseArticleResponse } from "./prompts";

// Local open-model backend. Ollama runs on this machine (or a host the operator
// controls); no third-party AI service receives the text. The server operator
// can still read it. Wire format verified against Ollama /api/chat: NDJSON
// lines of { message: { role, content }, done } with a final done: true line.

export const OLLAMA_DEFAULT_MODEL = "qwen2.5:7b";
const NUM_CTX = 16384;

export function ollamaBaseUrl() {
  return (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
}

export function ollamaModel() {
  return process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL;
}

export function ollamaConfigured() {
  return Boolean(ollamaBaseUrl());
}

export async function ollamaReachable(timeoutMs = 2000) {
  if (!ollamaConfigured()) return false;
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models || []).some((m) => m.name === ollamaModel());
  } catch {
    return false;
  }
}

type ChatLine = { message?: { content?: string }; done?: boolean; error?: string };

/** Turns an Ollama NDJSON chat stream into a stream of plain text tokens. */
export function ndjsonTextStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const emit = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let parsed: ChatLine;
        try {
          parsed = JSON.parse(trimmed) as ChatLine;
        } catch {
          return; // a partial line is kept in the buffer; a malformed one is skipped
        }
        if (parsed.error) throw new Error(`The local model returned an error: ${parsed.error}`);
        const text = parsed.message?.content;
        if (text) controller.enqueue(encoder.encode(text));
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) emit(line);
        }
        if (buffer) emit(buffer);
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });
}

export async function conductInterviewStream(
  messages: ChatMessage[],
  credential: VerifiedCredential,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      stream: true,
      messages: [
        { role: "system", content: buildInterviewSystemPrompt(credential) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      options: { temperature: 0.7, num_ctx: NUM_CTX, num_predict: 700 },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`The local model returned status ${res.status}`);
  return ndjsonTextStream(res.body);
}

export async function generateArticle(messages: ChatMessage[], credential: VerifiedCredential): Promise<ArticleDraft> {
  const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      stream: false,
      format: "json",
      messages: [{ role: "user", content: buildArticlePrompt(messages, credential) }],
      options: { temperature: 0.5, num_ctx: NUM_CTX, num_predict: 4096 },
    }),
  });
  if (!res.ok) throw new Error(`The local model returned status ${res.status}`);
  const data = (await res.json()) as ChatLine;
  if (data.error) throw new Error(`The local model returned an error: ${data.error}`);
  return parseArticleResponse(data.message?.content || "");
}
