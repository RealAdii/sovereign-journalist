import { NextRequest, NextResponse } from "next/server";
import { BondError, bondConfigured, refundBond } from "@/lib/bond";
import { getCapability } from "@/lib/session";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Refund the confirmed bond to the recipient the source chose, as a private
// transfer submitted by the treasury. Only the session holder can trigger it,
// and it is idempotent: a refunded session returns the same quote again.
export async function POST(req: NextRequest) {
  if (rateLimited(req, "bond-refund", 10, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ token?: string }>(req);
  if (!getCapability(body?.token)) return jsonError("Invalid or expired session", 401);
  if (!bondConfigured()) return jsonError("The private bond is not configured on this server", 503);
  try {
    return NextResponse.json(await refundBond(body!.token!), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BondError) return jsonError(error.message, error.status);
    const message = error instanceof Error ? error.message : "Refund failed";
    return jsonError(`Refund did not go through: ${message}. It will be retried automatically.`, 502);
  }
}
