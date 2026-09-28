import { NextRequest, NextResponse } from "next/server";
import { recordAiRequest, requireBondedCapability } from "@/lib/session";
import { generateArticle, geminiConfigured } from "@/lib/gemini";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";
import { validMessages } from "@/lib/messages";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (rateLimited(req, "generate", 10, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ messages?: unknown; token?: string }>(req);
  if (!body) return jsonError("Invalid request body", 400);

  const gate = requireBondedCapability(body.token);
  if ("error" in gate) {
    return gate.error === "bond-blocked"
      ? jsonError("Article drafting requires a confirmed bond, which is blocked on Sepolia", 403)
      : jsonError("Invalid or expired session", 401);
  }
  if (!validMessages(body.messages) || body.messages.length < 4) {
    return jsonError("The interview is too short to draft an article", 400);
  }
  if (!geminiConfigured()) return jsonError("The AI interview is not configured", 503);
  if (!recordAiRequest(body.token!)) {
    return jsonError("This session has reached its AI request limit", 429);
  }

  try {
    const article = await generateArticle(body.messages, gate.record.credential);
    return NextResponse.json({ article });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Article drafting failed";
    return jsonError(message, 502);
  }
}
