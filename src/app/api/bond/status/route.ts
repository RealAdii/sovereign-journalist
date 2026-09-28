import { NextRequest, NextResponse } from "next/server";
import { BondError, bondConfigured, checkBondPaid } from "@/lib/bond";
import { getCapability } from "@/lib/session";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Polled by the bond page after the source signs the private transfer. The
// server discovers the treasury's notes and confirms when one carries the
// session's exact amount. Nothing about the source is read from the chain.
export async function POST(req: NextRequest) {
  if (await rateLimited(req, "bond-status", 120, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ token?: string }>(req);
  if (!(await getCapability(body?.token))) return jsonError("Invalid or expired session", 401);
  if (!bondConfigured()) return jsonError("The private bond is not configured on this server", 503);
  try {
    return NextResponse.json(await checkBondPaid(body!.token!), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BondError) return jsonError(error.message, error.status);
    return NextResponse.json({ status: "quoted", detail: "Discovery failed, retrying" }, { status: 200 });
  }
}
