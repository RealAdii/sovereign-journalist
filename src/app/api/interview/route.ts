import { NextRequest } from "next/server";
import { recordAiRequest, requireBondedCapability } from "@/lib/session";
import { conductInterviewStream, geminiConfigured } from "@/lib/gemini";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";
import { validMessages } from "@/lib/messages";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (rateLimited(req, "interview", 40, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ messages?: unknown; token?: string }>(req);
  if (!body) return jsonError("Invalid request body", 400);

  const gate = requireBondedCapability(body.token);
  if ("error" in gate) {
    return gate.error === "bond-blocked"
      ? jsonError("The interview requires a confirmed bond, which is blocked on Sepolia", 403)
      : jsonError("Invalid or expired session", 401);
  }
  if (!validMessages(body.messages)) return jsonError("Invalid messages", 400);
  if (!geminiConfigured()) return jsonError("The AI interview is not configured", 503);
  if (!recordAiRequest(body.token!)) {
    return jsonError("This session has reached its AI request limit", 429);
  }

  try {
    const stream = await conductInterviewStream(body.messages, gate.record.credential);
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interview request failed";
    return jsonError(message, message.includes("429") ? 429 : 502);
  }
}
