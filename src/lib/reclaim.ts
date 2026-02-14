import type { VerifiedCredential } from "./types";

export const RECLAIM_APP_ID = process.env.NEXT_PUBLIC_RECLAIM_APP_ID!;
export const RECLAIM_APP_SECRET = process.env.NEXT_PUBLIC_RECLAIM_APP_SECRET!;
export const RECLAIM_PROVIDER_ID = process.env.NEXT_PUBLIC_RECLAIM_PROVIDER_ID!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseProofData(proofs: any[]): Record<string, string> {
  if (!proofs || proofs.length === 0) return {};

  const proof = proofs[0];

  if (proof.extractedParameterValues) {
    return typeof proof.extractedParameterValues === "string"
      ? JSON.parse(proof.extractedParameterValues)
      : proof.extractedParameterValues;
  }

  if (proof.claimData?.context) {
    const context =
      typeof proof.claimData.context === "string"
        ? JSON.parse(proof.claimData.context)
        : proof.claimData.context;
    return context.extractedParameters || context;
  }

  if (proof.claimData?.parameters) {
    return typeof proof.claimData.parameters === "string"
      ? JSON.parse(proof.claimData.parameters)
      : proof.claimData.parameters;
  }

  if (proof.publicData) {
    return typeof proof.publicData === "string"
      ? JSON.parse(proof.publicData)
      : proof.publicData;
  }

  return {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCredential(proofs: any[]): VerifiedCredential {
  const parameters = parseProofData(proofs);
  const proof = proofs?.[0];
  const provider =
    proof?.claimData?.provider || proof?.provider || "unknown";

  return {
    provider,
    parameters,
    verifiedAt: new Date().toISOString(),
  };
}
