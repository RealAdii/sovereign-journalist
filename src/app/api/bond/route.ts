import { NextRequest, NextResponse } from "next/server";
import { BOND_AMOUNT_STRK, BOND_MISSING, DEV_BYPASS_ACTIVE } from "@/lib/capabilities";
import { getCapability } from "@/lib/session";
import { jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    network: "SN_SEPOLIA",
    token: "STRK",
    amount: BOND_AMOUNT_STRK,
    refundable: true,
    status: DEV_BYPASS_ACTIVE ? "dev-bypass" : "blocked",
    missing: BOND_MISSING,
  });
}

// Any attempt to submit a bond receipt is refused. There is no verified private
// receipt format yet, and a public transfer hash would link the payer to this
// session. The server never accepts one.
export async function POST(req: NextRequest) {
  const body = await readJson<{ token?: string }>(req);
  if (!(await getCapability(body?.token))) return jsonError("Invalid or expired session", 401);
  return jsonError(
    "The anonymous bond is blocked on Sepolia. Public transfer receipts are not accepted because they would link you to this interview.",
    503,
    { missing: BOND_MISSING },
  );
}
