import { NextRequest, NextResponse } from "next/server";
import { cancelCapability, getCapability } from "@/lib/session";
import { jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await readJson<{ token?: string }>(req);
  const record = getCapability(body?.token);
  if (!record) return jsonError("Invalid or expired session", 401);
  cancelCapability(body?.token);
  return NextResponse.json({
    cancelled: true,
    bondStatus: record.bondStatus,
    refund:
      record.bondStatus === "confirmed"
        ? "A refund would be issued here. No bond path is live on Sepolia yet."
        : "No bond was collected, so there is nothing to refund.",
  });
}
