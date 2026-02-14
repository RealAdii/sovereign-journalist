import type { ChatMessage, VerifiedCredential, IPFSArticle } from "./types";
import crypto from "crypto";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_STREAM_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse";

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

function sanitizeCredential(credential: VerifiedCredential): string {
  // Only expose non-PII fields. Strip emails, names, IDs.
  const safeFields: Record<string, string> = {};
  const piiPatterns = /email|name|id$|phone|address|ssn|dob|birth/i;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const [key, value] of Object.entries(credential.parameters)) {
    if (piiPatterns.test(key)) continue;
    if (emailPattern.test(value)) continue;
    safeFields[key] = value;
  }

  if (Object.keys(safeFields).length > 0) {
    return Object.entries(safeFields)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }

  return credential.provider;
}

function buildInterviewSystemPrompt(credential: VerifiedCredential): string {
  const safeCredInfo = sanitizeCredential(credential);

  return `You are the Sovereign Journalist — an autonomous AI investigative journalist.

You are speaking with a verified source who has proven their credentials via zkTLS (zero-knowledge Transport Layer Security) through Reclaim Protocol. Their verified credential type: ${safeCredInfo} (provider: ${credential.provider}).
Their identity is cryptographically hidden from you — you do not and cannot know who they are.

Your job:
1. Understand what they want to report
2. Ask specific, probing follow-up questions (one at a time)
3. Request any evidence they can share (documents, screenshots, data)
4. Identify claims that could be verified against public information
5. After 5-8 exchanges, summarize findings and confirm accuracy with the source

Rules:
- NEVER ask for their name, email, employee ID, or any identifying information
- NEVER try to narrow down their identity through indirect questions
- Be professional, empathetic, and thorough
- Ask ONE question at a time
- Keep responses concise (2-4 paragraphs max)

Start by acknowledging their verified credential and asking what story they want to share.`;
}

function buildArticlePrompt(
  messages: ChatMessage[],
  credential: VerifiedCredential
): string {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "SOURCE" : "JOURNALIST"}: ${m.content}`)
    .join("\n\n");

  const safeCredInfo = sanitizeCredential(credential);

  return `Based on this interview transcript between an AI journalist and an anonymous verified source, write a professional investigative article.

SOURCE CREDENTIAL (verified via zkTLS): ${safeCredInfo} (provider: ${credential.provider})

TRANSCRIPT:
${transcript}

Generate a JSON response with this exact structure:
{
  "title": "Article headline (compelling, journalistic)",
  "subtitle": "2-3 sentence summary for article cards",
  "body": "Full article in markdown format. Professional journalism style. Reference the source's verified credential without revealing identity. Use sections with ## headings.",
  "confidenceScore": <number 1-100 based on specificity and consistency of claims>,
  "confidenceReason": "2-3 sentences explaining why this confidence level. Reference specific evidence or lack thereof.",
  "tags": ["tag1", "tag2", "tag3"]
}

Rules:
- Write in third person ("A verified employee at..." not "I")
- Include a note about zkTLS verification methodology
- Distinguish between verified claims and unverified allegations
- The confidence score should reflect how specific, consistent, and verifiable the claims are
- Keep the article factual and balanced
- Output ONLY valid JSON, no markdown code fences`;
}

async function callGemini(
  contents: GeminiContent[],
  systemInstruction?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function conductInterviewStream(
  messages: ChatMessage[],
  credential: VerifiedCredential
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = buildInterviewSystemPrompt(credential);

  const contents: GeminiContent[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  };

  const res = await fetch(`${GEMINI_STREAM_URL}&key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errorText}`);
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
            if (line.startsWith("data: ")) {
              const json = line.slice(6).trim();
              if (!json) continue;
              try {
                const parsed = JSON.parse(json);
                const text =
                  parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  controller.enqueue(encoder.encode(text));
                }
              } catch {
                // skip malformed chunks
              }
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

export async function generateArticle(
  messages: ChatMessage[],
  credential: VerifiedCredential
): Promise<IPFSArticle> {
  const prompt = buildArticlePrompt(messages, credential);
  const response = await callGemini([
    { role: "user", parts: [{ text: prompt }] },
  ]);

  const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  const interviewHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(messages))
    .digest("hex")
    .slice(0, 16);

  return {
    version: "1.0",
    publishedAt: new Date().toISOString(),
    article: {
      title: parsed.title,
      subtitle: parsed.subtitle || parsed.summary || "",
      body: parsed.body,
      confidence: parsed.confidenceScore,
      confidenceReason: parsed.confidenceReason || "",
    },
    verification: {
      sourceCredential: `Verified source via ${credential.provider}`,
      proofHash: interviewHash,
      verificationMethod: "zkTLS (Reclaim Protocol)",
      identityKnown: false,
    },
    metadata: {
      agentModel: "gemini-2.5-flash",
      interviewTurns: messages.length,
      tags: parsed.tags || [],
    },
  };
}
