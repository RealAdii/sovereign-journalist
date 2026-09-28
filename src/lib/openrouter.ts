import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";
import { buildArticlePrompt, buildInterviewSystemPrompt, parseArticleResponse } from "./prompts";

// Hosted open-weights backend through OpenRouter (OpenAI-compatible API),
// pinned to the provider "phala", whose endpoints run the model inside NVIDIA
// GPU TEEs with Intel TDX hosts. The text leaves this server and reaches
// OpenRouter (the router) and Phala (the TEE host). OpenRouter does not pass
// Phala's attestation or signed receipts through, so this path is disclosed as
// "runs in a TEE per routing, not independently verified". The direct Phala
// backend (src/lib/phala.ts) is the verifiable one.
// Checked 2026-09-28: deepseek/deepseek-v3.2 (default), qwen/qwen3.8-27b, z-ai/glm-5.3 (reasoning only),
// qwen/qwen3.8-27b all list a Phala endpoint.

// GLM 5.3 Flash on Phala forces reasoning on and exhausts the budget before any
// content; DeepSeek V3.2 and Qwen3.8 27B answer normally (checked 2026-09-29).
export const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-v3.2";
export const OPENROUTER_PROVIDER = "phala";
const BASE = "https://openrouter.ai/api/v1/chat/completions";

export function openrouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
export function openrouterModel() {
  return process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;
}
export function openrouterProvider() {
  return process.env.OPENROUTER_PROVIDER || OPENROUTER_PROVIDER;
}
function routing() {
  // Never fall back to a non-TEE host silently.
  return { only: [openrouterProvider()], allow_fallbacks: false };
}
function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": process.env.APP_PUBLIC_URL || "http://localhost:3000",
    "X-Title": "Sovereign Journalist",
  };
}

/** Turns an OpenAI-style SSE stream into plain text tokens. */
export function sseTextStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
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
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.error) throw new Error(parsed.error.message || "provider error");
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) controller.enqueue(encoder.encode(text));
            } catch (err) {
              if (err instanceof Error && err.message !== "Unexpected end of JSON input" && !(err instanceof SyntaxError)) throw err;
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });
}

export async function conductInterviewStream(messages: ChatMessage[], credential: VerifiedCredential) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: openrouterModel(),
      provider: routing(),
      stream: true,
      temperature: 0.7,
      max_tokens: 700,
      messages: [
        { role: "system", content: buildInterviewSystemPrompt(credential) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`The AI provider returned status ${res.status}`);
  return sseTextStream(res.body);
}

export async function generateArticle(messages: ChatMessage[], credential: VerifiedCredential): Promise<ArticleDraft> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: openrouterModel(),
      provider: routing(),
      stream: false,
      temperature: 0.5,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildArticlePrompt(messages, credential) }],
    }),
  });
  if (!res.ok) throw new Error(`The AI provider returned status ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "provider error");
  return parseArticleResponse(data.choices?.[0]?.message?.content || "");
}
