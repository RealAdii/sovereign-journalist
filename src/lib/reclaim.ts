import { ReclaimProofRequest, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import type { VerifiedCredential } from "./types";

function required(name: "RECLAIM_APP_ID" | "RECLAIM_APP_SECRET" | "RECLAIM_PROVIDER_ID") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function createReclaimRequest(verificationId: string, challenge: string) {
  const request = await ReclaimProofRequest.init(
    required("RECLAIM_APP_ID"),
    required("RECLAIM_APP_SECRET"),
    required("RECLAIM_PROVIDER_ID"),
    { log: false, acceptAiProviders: false },
  );
  request.setContext(verificationId, challenge);
  return {
    requestJson: request.toJsonString(),
    reclaimSessionId: request.getSessionId(),
  };
}

function parseContext(proof: Proof) {
  const raw = proof.claimData?.context;
  if (!raw) return {} as Record<string, unknown>;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function extractedParameters(proof: Proof): Record<string, string> {
  const context = parseContext(proof);
  const raw = (context.extractedParameters || proof.extractedParameterValues || {}) as
    | string
    | Record<string, unknown>;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
}

export async function verifyReclaimProofs(
  proofs: Proof[],
  expectedVerificationId: string,
  expectedChallenge: string,
  expectedSessionId: string,
): Promise<VerifiedCredential> {
  if (!Array.isArray(proofs) || proofs.length !== 1) {
    throw new Error("Exactly one proof is required");
  }
  const proof = proofs[0];
  const valid = await verifyProof(proof, false);
  if (!valid) throw new Error("Proof signature verification failed");

  const provider = proof.claimData?.provider || "";
  if (provider !== required("RECLAIM_PROVIDER_ID")) {
    throw new Error("Proof provider does not match the requested provider");
  }
  const context = parseContext(proof);
  if (
    String(context.address || "") !== expectedVerificationId ||
    String(context.message || "") !== expectedChallenge
  ) {
    throw new Error("Proof is not bound to this verification request");
  }
  if (context.sessionId && String(context.sessionId) !== expectedSessionId) {
    throw new Error("Proof session does not match the initiated session");
  }

  return {
    provider,
    parameters: extractedParameters(proof),
    verifiedAt: new Date().toISOString(),
  };
}

export function reclaimConfigured() {
  return Boolean(
    process.env.RECLAIM_APP_ID && process.env.RECLAIM_APP_SECRET && process.env.RECLAIM_PROVIDER_ID,
  );
}
