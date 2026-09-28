import { NextRequest, NextResponse } from "next/server";
import { BOND_AMOUNT_STRK, BOND_MISSING, DEV_BYPASS_ACTIVE } from "@/lib/capabilities";
import { BondError, bondBlockers, bondConfigured, issueBondQuote, poolFeeFri, sweepExpiringBonds, treasuryAddress } from "@/lib/bond";
import { getCapability } from "@/lib/session";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET: public bond status. "enabled" means the private path is configured and
// a quote can be issued; "dev-bypass" means no bond is collected (development
// only); "blocked" lists exactly what is missing.
export async function GET() {
  const base = { network: "SN_SEPOLIA" as const, token: "STRK" as const, amount: BOND_AMOUNT_STRK, refundable: true };
  if (DEV_BYPASS_ACTIVE) {
    return NextResponse.json({ ...base, status: "dev-bypass", missing: BOND_MISSING });
  }
  if (!bondConfigured()) {
    return NextResponse.json({ ...base, status: "blocked", missing: [...bondBlockers(), ...BOND_MISSING] });
  }
  let poolFee: string | null = null;
  try {
    poolFee = (await poolFeeFri()).toString();
  } catch {
    poolFee = null;
  }
  // Opportunistic refund of bonds whose sessions are about to expire.
  void sweepExpiringBonds().catch(() => undefined);
  return NextResponse.json({
    ...base,
    status: "enabled",
    treasury: treasuryAddress(),
    poolFeeFri: poolFee,
    provingService: process.env.PROVING_SERVICE_URL,
    missing: [],
  });
}

// POST: issue the quote for a session. Public transfer receipts are never
// accepted; the only way to confirm a bond is the treasury discovering the
// private note with the session's exact amount (POST /api/bond/status).
export async function POST(req: NextRequest) {
  if (await rateLimited(req, "bond-quote", 20, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ token?: string; recipient?: string }>(req);
  if (!(await getCapability(body?.token))) return jsonError("Invalid or expired session", 401);
  if (!bondConfigured()) {
    return jsonError(
      "The anonymous bond is not configured on this server. Public transfer receipts are not accepted because they would link you to this interview.",
      503,
      { missing: [...bondBlockers(), ...BOND_MISSING] },
    );
  }
  try {
    return NextResponse.json(await issueBondQuote(body!.token!, body?.recipient), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BondError) return jsonError(error.message, error.status);
    return jsonError("Could not issue a bond quote", 502);
  }
}
