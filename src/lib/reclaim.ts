import { ReclaimProofRequest, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import type { VerifiedCredential } from "./types";

// Written against @reclaimprotocol/js-sdk 5.8.2 (https://docs.reclaimprotocol.org/manual/js-sdk/usage):
// - The request is created and signed on the server; toJsonString() carries the
//   signature and context but never the app secret (checked in dist/index.js).
// - The browser reconstructs it with fromJsonString() and launches the portal
//   flow with triggerReclaimFlow(). No app clip, QR code, or custom iframe.
// - verifyProof(proof, { providerId, providerVersion, allowedTags }) checks the
//   attestor signatures and that the proof's request hashes match the provider
//   template version used in the session. It returns trusted context and
//   extracted parameters; raw claimData is not parsed here.
// - The session status endpoint returns appId, providerId, providerVersionString
//   and the proofs it received, which binds the proof to the session we started.

const RECLAIM_SESSION_URL = "https://api.reclaimprotocol.org/api/sdk/session/";

export interface ProviderVersion {
  providerId: string;
  providerVersion: string;
  allowedTags: string[];
}

function required(name: "RECLAIM_APP_ID" | "RECLAIM_APP_SECRET" | "RECLAIM_PROVIDER_ID") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function reclaimConfigured() {
  return Boolean(
    process.env.RECLAIM_APP_ID && process.env.RECLAIM_APP_SECRET && process.env.RECLAIM_PROVIDER_ID,
  );
}

export async function createReclaimRequest(verificationId: string, challenge: string) {
  const request = await ReclaimProofRequest.init(
    required("RECLAIM_APP_ID"),
    required("RECLAIM_APP_SECRET"),
    required("RECLAIM_PROVIDER_ID"),
    { log: false, acceptAiProviders: false },
  );
  request.setContext(verificationId, challenge);
  const version = request.getProviderVersion();
  return {
    requestJson: request.toJsonString(),
    reclaimSessionId: request.getSessionId(),
    providerVersion: {
      providerId: version.providerId,
      providerVersion: version.providerVersion,
      allowedTags: version.allowedTags ?? [],
    } satisfies ProviderVersion,
  };
}

export interface ReclaimSessionStatus {
  session?: {
    id?: string;
    appId?: string;
    httpProviderId?: string[];
    providerId?: string;
    providerVersionString?: string;
    proofs?: Proof[];
    statusV2?: string;
  };
}

export type SessionFetcher = (sessionId: string) => Promise<ReclaimSessionStatus>;

export const fetchReclaimSession: SessionFetcher = async (sessionId) => {
  const res = await fetch(`${RECLAIM_SESSION_URL}${encodeURIComponent(sessionId)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reclaim session lookup returned ${res.status}`);
  return (await res.json()) as ReclaimSessionStatus;
};

export async function verifyReclaimProofs(
  proofs: Proof[],
  expectedVerificationId: string,
  expectedChallenge: string,
  expectedSessionId: string,
  providerVersion: ProviderVersion,
  fetchSession: SessionFetcher = fetchReclaimSession,
): Promise<VerifiedCredential> {
  if (!Array.isArray(proofs) || proofs.length !== 1) {
    throw new Error("Exactly one proof is required");
  }
  const proof = proofs[0];
  if (!proof?.claimData || !Array.isArray(proof.signatures) || proof.signatures.length === 0) {
    throw new Error("Proof is malformed");
  }
  if (providerVersion.providerId !== required("RECLAIM_PROVIDER_ID")) {
    throw new Error("Verification request was created for a different provider");
  }

  // 1. Attestor signatures plus content validation against the exact provider
  //    template version used when the request was created.
  const result = await verifyProof(proof, {
    providerId: providerVersion.providerId,
    providerVersion: providerVersion.providerVersion || undefined,
    allowedTags: providerVersion.allowedTags,
  });
  if (!result.isVerified) {
    throw new Error(`Proof verification failed: ${result.error?.message || "invalid proof"}`);
  }
  const trusted = result.data[0];
  if (!trusted) throw new Error("Proof verification returned no data");
  const context = trusted.context as {
    contextAddress?: unknown;
    contextMessage?: unknown;
    reclaimSessionId?: unknown;
    providerHash?: unknown;
  };

  // 2. Context binds the proof to this server-created request and session.
  if (
    String(context.contextAddress ?? "") !== expectedVerificationId ||
    String(context.contextMessage ?? "") !== expectedChallenge
  ) {
    throw new Error("Proof is not bound to this verification request");
  }
  if (context.reclaimSessionId && String(context.reclaimSessionId) !== expectedSessionId) {
    throw new Error("Proof session does not match the initiated session");
  }
  const pinnedHash = process.env.RECLAIM_PROVIDER_HASH;
  if (pinnedHash && String(context.providerHash ?? "").toLowerCase() !== pinnedHash.toLowerCase()) {
    throw new Error("Proof provider template does not match the pinned provider hash");
  }

  // 3. The session we started must belong to our app and provider and must
  //    have received this exact proof.
  const status = await fetchSession(expectedSessionId);
  const session = status.session;
  if (!session) throw new Error("Reclaim session was not found");
  if (String(session.appId ?? "") !== required("RECLAIM_APP_ID")) {
    throw new Error("Proof session belongs to a different application");
  }
  const sessionProvider = session.providerId || session.httpProviderId?.[0];
  const providerMatches =
    sessionProvider === providerVersion.providerId ||
    (Array.isArray(session.httpProviderId) && session.httpProviderId.includes(providerVersion.providerId));
  if (!providerMatches) throw new Error("Proof session was not created for the configured provider");
  const known = (session.proofs || []).some((p) => p.identifier === proof.identifier);
  if (!known) throw new Error("Proof was not produced by the initiated session");

  return {
    provider: providerVersion.providerId,
    parameters: Object.fromEntries(
      Object.entries(trusted.extractedParameters || {}).map(([k, v]) => [k, String(v)]),
    ),
    verifiedAt: new Date().toISOString(),
  };
}
