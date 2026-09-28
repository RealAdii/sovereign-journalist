import { NextRequest, NextResponse } from "next/server";
import type { Proof } from "@reclaimprotocol/js-sdk";
import { verifyReclaimProofs } from "@/lib/reclaim";
import { consumeVerificationRecord, issueCapability } from "@/lib/session";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";
import type { IssuedCapability } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (rateLimited(req, "verify-complete", 20, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ verificationId?: string; proofs?: Proof[] | Proof }>(req);
  if (!body || typeof body.verificationId !== "string" || !body.proofs) {
    return jsonError("verificationId and proofs are required", 400);
  }
  const proofs = Array.isArray(body.proofs) ? body.proofs : [body.proofs];

  // One-use: the record is deleted before the proof is checked, so a replay of
  // the same verificationId fails even if the proof is valid.
  const record = consumeVerificationRecord(body.verificationId);
  if (!record) {
    return jsonError("This verification request has expired or was already used", 410);
  }

  try {
    const credential = await verifyReclaimProofs(
      proofs,
      body.verificationId,
      record.challenge,
      record.reclaimSessionId,
      record.providerVersion,
    );
    const issued = issueCapability(credential);
    const response: IssuedCapability = {
      ...issued,
      credential: {
        provider: credential.provider,
        disclosedFields: Object.keys(credential.parameters),
      },
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proof verification failed";
    return jsonError(message, 401);
  }
}
