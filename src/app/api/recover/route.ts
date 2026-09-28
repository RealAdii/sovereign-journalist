import { NextRequest, NextResponse } from "next/server";
import { recoverCapability } from "@/lib/session";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (await rateLimited(req, "recover", 5, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ recoveryCode?: string }>(req);
  if (!body || typeof body.recoveryCode !== "string" || body.recoveryCode.length < 16) {
    return jsonError("A recovery code is required", 400);
  }
  const recovered = await recoverCapability(body.recoveryCode.trim());
  if (!recovered) return jsonError("No active session matches that recovery code", 404);
  return NextResponse.json(recovered, { headers: { "Cache-Control": "no-store" } });
}
