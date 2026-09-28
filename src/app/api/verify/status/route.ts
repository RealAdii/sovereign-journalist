import { NextRequest, NextResponse } from "next/server";
import { fetchReclaimSession, verifyReclaimProofs } from "@/lib/reclaim";
import { consumeVerificationRecord, issueCapability, markGenerationFailure, peekVerificationRecord } from "@/lib/session";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";
import type { IssuedCapability } from "@/lib/types";

export const dynamic = "force-dynamic";

// Reclaim's portal retries proof generation internally, so PROOF_GENERATION_FAILED
// is often transient (observed live: FAILED, then PROOF_GENERATION_SUCCESS). The SDK
// itself waits 30 s; the AI-assisted portal can take longer, so we wait 3 minutes.
const GENERATION_FAILURE_GRACE_MS = 3 * 60 * 1000;
const TERMINAL_STATES = new Set(["ERROR_SUBMITTED", "ERROR_SUBMISSION_FAILED", "PROOF_SUBMISSION_FAILED"]);

// Server-driven completion. The browser polls this after launching the portal.
// The server asks Reclaim's session endpoint whether a proof was submitted for
// the session it created, verifies it, and issues the capability. The browser
// never handles the proof. The verification record is consumed only once a
// proof exists, so pending polls do not burn it.
export async function POST(req: NextRequest) {
  if (await rateLimited(req, "verify-status", 120, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ verificationId?: string }>(req);
  if (!body || typeof body.verificationId !== "string") return jsonError("verificationId is required", 400);

  const record = await peekVerificationRecord(body.verificationId);
  if (!record) return jsonError("This verification request has expired or was already used", 410);

  let status;
  try {
    status = await fetchReclaimSession(record.reclaimSessionId);
  } catch {
    return NextResponse.json({ status: "pending", detail: "Reclaim status lookup failed, retrying" });
  }
  const session = status.session;
  const state = session?.statusV2 || "UNKNOWN";
  const now = Date.now();
  let terminal = TERMINAL_STATES.has(state);
  if (state === "PROOF_GENERATION_FAILED") {
    const since = record.generationFailedSince ?? now;
    if (record.generationFailedSince === undefined) await markGenerationFailure(body.verificationId, since);
    if (now - since < GENERATION_FAILURE_GRACE_MS) {
      return NextResponse.json({ status: "pending", detail: "Reclaim is retrying proof generation. Keep the portal open.", reclaimState: state, retrying: true });
    }
    terminal = true;
  } else if (record.generationFailedSince !== undefined) {
    await markGenerationFailure(body.verificationId, undefined);
  }
  if (terminal) {
    await consumeVerificationRecord(body.verificationId);
    const reclaimError = (session as { error?: { type?: string; message?: string } } | undefined)?.error;
    // Session id and state only: no proof, credential, or IP in logs.
    console.warn(`reclaim session ${record.reclaimSessionId} ended in ${state}${reclaimError?.type ? ` (${reclaimError.type})` : ""}`);
    const detail = reclaimError?.message
      ? `Reclaim reported ${state}: ${reclaimError.message}`
      : `Reclaim reported ${state}. The proof could not be generated in Reclaim's portal (often the provider's login did not complete). Retry, or open the portal in a new tab. Reclaim session ${record.reclaimSessionId}.`;
    return NextResponse.json({ status: "failed", detail, reclaimState: state, reclaimSessionId: record.reclaimSessionId }, { status: 409 });
  }
  const proofs = session?.proofs || [];
  if (proofs.length === 0) return NextResponse.json({ status: "pending", detail: state });

  // A proof exists: consume the record first so a concurrent poll cannot issue twice.
  const consumed = await consumeVerificationRecord(body.verificationId);
  if (!consumed) return jsonError("This verification request was already used", 410);
  try {
    const credential = await verifyReclaimProofs(
      [proofs[0]],
      body.verificationId,
      consumed.challenge,
      consumed.reclaimSessionId,
      consumed.providerVersion,
    );
    const issued = await issueCapability(credential);
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
