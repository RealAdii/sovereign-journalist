import { NextRequest, NextResponse } from "next/server";
import { cancelCapability, getCapability } from "@/lib/session";
import { refundBond } from "@/lib/bond";
import { jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await readJson<{ token?: string }>(req);
  const record = await getCapability(body?.token);
  if (!record) return jsonError("Invalid or expired session", 401);

  // A confirmed bond is returned before the session is discarded. If the
  // refund cannot be sent right now, the session is kept so the sweeper can
  // retry, and the response says so.
  let refund = "No bond was collected, so there is nothing to refund.";
  if (record.bondStatus === "confirmed") {
    try {
      const quote = await refundBond(body!.token!);
      refund = `Bond refunded privately (transaction ${quote.refundTxHash || "pending"}).`;
    } catch (error) {
      return NextResponse.json(
        {
          cancelled: false,
          bondStatus: record.bondStatus,
          refund: `Refund could not be sent yet: ${error instanceof Error ? error.message : "unknown error"}. Your session is kept and the refund will be retried.`,
        },
        { status: 503 },
      );
    }
  } else if (record.bondStatus === "refunded") {
    refund = "Bond was already refunded.";
  }
  await cancelCapability(body?.token);
  return NextResponse.json({ cancelled: true, bondStatus: record.bondStatus, refund });
}
