import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";
import { buildArticlePrompt, buildInterviewSystemPrompt, parseArticleResponse } from "./prompts";
import { sseTextStream } from "./openrouter";
import { getAttestedConnection, recordReceipt } from "./attestation";

// Direct Phala confidential inference backend. Every request goes through the
// SPKI-pinned, attestation-verified connection from src/lib/attestation.ts, so
// if the gateway's TDX quote, keyset, compose measurement, or TLS pin fail to
// verify, no request is sent at all. Each exchange returns an x-receipt-id
// header; the gateway signs a receipt binding the request and response body
// hashes to the attested keyset, which /api/attestation audits on demand.
//
// Model list checked live on 2026-09-29 (GET /v1/models, public):
// deepseek/deepseek-v3.2, qwen/qwen3.8-27b, z-ai/glm-5.3 (reasoning only),
// openai/gpt-oss-120b, moonshotai/kimi-k2.6, meta-llama/llama-3.3-70b-instruct.
// DeepSeek V3.2 answers without a mandatory reasoning budget, so it is the default.

export const PHALA_DEFAULT_MODEL = "deepseek/deepseek-v3.2";

export function phalaConfigured() {
  return Boolean(process.env.PHALA_API_KEY);
}

export function phalaModel() {
  return process.env.PHALA_MODEL || PHALA_DEFAULT_MODEL;
}

function apiKey() {
  const key = process.env.PHALA_API_KEY;
  if (!key) throw new Error("PHALA_API_KEY is not configured");
  return key;
}

async function attestedPost(body: Record<string, unknown>) {
  const conn = await getAttestedConnection();
  if (!conn) throw new Error("The confidential inference gateway could not be attested. Refusing to send text.");
  const res = await conn.fetch(`${conn.baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`The confidential inference gateway returned status ${res.status}`);
  const receiptId = res.headers.get("x-receipt-id");
  if (!receiptId) throw new Error("The confidential inference gateway returned no receipt id");
  return { res, receiptId };
}

export async function conductInterviewStream(
  messages: ChatMessage[],
  credential: VerifiedCredential,
): Promise<ReadableStream<Uint8Array>> {
  const { res, receiptId } = await attestedPost({
    model: phalaModel(),
    stream: true,
    temperature: 0.7,
    max_tokens: 700,
    messages: [
      { role: "system", content: buildInterviewSystemPrompt(credential) },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  if (!res.body) throw new Error("The confidential inference gateway returned no body");
  recordReceipt(credential, { receiptId, purpose: "interview", model: phalaModel(), recordedAt: Date.now() });
  return sseTextStream(res.body);
}

export async function generateArticle(messages: ChatMessage[], credential: VerifiedCredential): Promise<ArticleDraft> {
  const { res, receiptId } = await attestedPost({
    model: phalaModel(),
    stream: false,
    temperature: 0.5,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: buildArticlePrompt(messages, credential) }],
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "provider error");
  recordReceipt(credential, { receiptId, purpose: "draft", model: phalaModel(), recordedAt: Date.now() });
  return parseArticleResponse(data.choices?.[0]?.message?.content || "");
}
