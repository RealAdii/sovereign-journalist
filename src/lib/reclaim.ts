import { ReclaimProofRequest, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import type { VerifiedCredential } from "./types";

// Verified against @reclaimprotocol/js-sdk 4.12.0 (node_modules/.../dist/index.js):
// - setContext(address, message) stores { contextAddress, contextMessage } and the
//   attestor copies that object, plus extractedParameters and providerHash, into
//   proof.claimData.context as a JSON string.
// - proof.claimData.provider is the provider TYPE (for example "http"), not the
//   dashboard provider id, so it cannot be used to bind the template.
// - The session status endpoint returns { session: { appId, httpProviderId[], proofs, statusV2 } }.
//   Binding the proof to our app id and provider id happens through that endpoint.

const RECLAIM_SESSION_URL = "https://api.reclaimprotocol.org/api/sdk/session/";

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
  return {
    requestJson: request.toJsonString(),
    reclaimSessionId: request.getSessionId(),
  };
}

interface ProofContext {
  contextAddress?: string;
  contextMessage?: string;
  providerHash?: string;
  extractedParameters?: Record<string, unknown> | string;
  sessionId?: string;
}

function parseContext(proof: Proof): ProofContext {
  const raw = proof.claimData?.context;
  if (!raw) return {};
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as ProofContext;
  } catch {
    throw new Error("Proof context is not valid JSON");
  }
}

function extractedParameters(context: ProofContext, proof: Proof): Record<string, string> {
  const raw = context.extractedParameters ?? proof.extractedParameterValues ?? {};
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}

export interface ReclaimSessionStatus {
  session?: {
    id?: string;
    appId?: string;
    httpProviderId?: string[];
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
  fetchSession: SessionFetcher = fetchReclaimSession,
): Promise<VerifiedCredential> {
  if (!Array.isArray(proofs) || proofs.length !== 1) {
    throw new Error("Exactly one proof is required");
  }
  const proof = proofs[0];
  if (!proof?.claimData || !Array.isArray(proof.signatures) || proof.signatures.length === 0) {
    throw new Error("Proof is malformed");
  }

  // 1. Attestor signatures over the claim.
  const valid = await verifyProof(proof, false);
  if (!valid) throw new Error("Proof signature verification failed");

  // 2. Context binds the proof to this server-created request.
  const context = parseContext(proof);
  if (
    String(context.contextAddress || "") !== expectedVerificationId ||
    String(context.contextMessage || "") !== expectedChallenge
  ) {
    throw new Error("Proof is not bound to this verification request");
  }
  if (context.sessionId && String(context.sessionId) !== expectedSessionId) {
    throw new Error("Proof session does not match the initiated session");
  }
  const pinnedHash = process.env.RECLAIM_PROVIDER_HASH;
  if (pinnedHash && String(context.providerHash || "").toLowerCase() !== pinnedHash.toLowerCase()) {
    throw new Error("Proof provider template does not match the pinned provider hash");
  }

  // 3. The Reclaim session we started must belong to our app and provider and
  //    must contain this exact proof. claimData.provider is only the provider
  //    type, so this lookup is what binds the template.
  const status = await fetchSession(expectedSessionId);
  const session = status.session;
  if (!session) throw new Error("Reclaim session was not found");
  if (String(session.appId || "") !== required("RECLAIM_APP_ID")) {
    throw new Error("Proof session belongs to a different application");
  }
  const providerId = required("RECLAIM_PROVIDER_ID");
  if (!Array.isArray(session.httpProviderId) || !session.httpProviderId.includes(providerId)) {
    throw new Error("Proof session was not created for the configured provider");
  }
  const known = (session.proofs || []).some((p) => p.identifier === proof.identifier);
  if (!known) throw new Error("Proof was not produced by the initiated session");

  return {
    provider: providerId,
    parameters: extractedParameters(context, proof),
    verifiedAt: new Date().toISOString(),
  };
}
