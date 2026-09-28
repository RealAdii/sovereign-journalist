import { NextRequest, NextResponse } from "next/server";
import { createReclaimRequest, reclaimConfigured } from "@/lib/reclaim";
import { createVerificationRecord, saveVerificationRecord } from "@/lib/session";
import { jsonError, rateLimited, tooManyRequests } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (await rateLimited(req, "verify-start", 10, 10 * 60 * 1000)) return tooManyRequests();
  if (!reclaimConfigured()) {
    return jsonError("Reclaim is not configured on this server", 503);
  }
  try {
    const { verificationId, challenge } = createVerificationRecord();
    const { requestJson, reclaimSessionId, providerVersion } = await createReclaimRequest(verificationId, challenge);
    await saveVerificationRecord(verificationId, challenge, reclaimSessionId, providerVersion);
    return NextResponse.json({ verificationId, requestJson });
  } catch {
    return jsonError("Could not start a verification request", 500);
  }
}
