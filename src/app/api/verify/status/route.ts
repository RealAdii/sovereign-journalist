import { NextRequest, NextResponse } from "next/server";
import { fetchReclaimSession, verifyReclaimProofs } from "@/lib/reclaim";
import { consumeVerificationRecord, issueCapability, peekVerificationRecord } from "@/lib/session";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";
import type { IssuedCapability } from "@/lib/types";

export const dynamic = "force-dynamic";

// Server-driven completion. The browser polls this after launching the portal.
// The server asks Reclaim's session endpoint whether a proof was submitted for
// the session it created, verifies it, and issues the capability. The browser
// never handles the proof. The verification record is consumed only once a
// proof exists, so pending polls do not burn it.
export async function POST(req: NextRequest) {
  if (rateLimited(req, "verify-status", 120, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ verificationId?: string }>(req);
  if (!body || typeof body.verificationId !== "string") return jsonError("verificationId is required", 400);

  const record = peekVerificationRecord(body.verificationId);
  if (!record) return jsonError("This verification request has expired or was already used", 410);

  let status;
  try {
    status = await fetchReclaimSession(record.reclaimSessionId);
  } catch {
    return NextResponse.json({ status: "pending", detail: "Reclaim status lookup failed, retrying" });
  }
  const session = status.session;
  const state = session?.statusV2 || "UNKNOWN";
  if (state.startsWith("ERROR") || state.endsWith("FAILED")) {
    consumeVerificationRecord(body.verificationId);
    return NextResponse.json({ status: "failed", detail: `Reclaim reported ${state}` }, { status: 409 });
  }
  const proofs = session?.proofs || [];
  if (proofs.length === 0) return NextResponse.json({ status: "pending", detail: state });

  // A proof exists: consume the record first so a concurrent poll cannot issue twice.
  const consumed = consumeVerificationRecord(body.verificationId);
  if (!consumed) return jsonError("This verification request was already used", 410);
  try {
    const credential = await verifyReclaimProofs(
      [proofs[0]],
      body.verificationId,
      consumed.challenge,
      consumed.reclaimSessionId,
      consumed.providerVersion,
    );
    const issued = issueCapability(credential);
    const response: IssuedCapability & { status: "issued" } = {
      status: "issued",
      ...issued,
      credential: { provider: credential.provider, disclosedFields: Object.keys(credential.parameters) },
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proof verification failed";
    return NextResponse.json({ status: "failed", detail: message }, { status: 401 });
  }
}
