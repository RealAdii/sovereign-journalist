import { NextRequest, NextResponse } from "next/server";
import { aiInfoVerified, aiProvider } from "@/lib/ai";
import { attestationSnapshot, auditReceiptsForToken, verifyAttestation } from "@/lib/attestation";
import { readJson } from "@/lib/request";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reports only what this server verified itself. tee is true only when the
// Phala gateway's TDX quote, keyset binding, compose measurement, OS allowlist
// and TLS channel pin all passed in @phala/aci-verifier. Any other backend, or
// any failed check, reports tee: false. The previous env-var-only tee: true
// claim was removed because it proved nothing.

function report(ai: Awaited<ReturnType<typeof aiInfoVerified>>) {
  const snapshot = ai.provider === "phala" ? attestationSnapshot() : null;
  const verified = Boolean(snapshot?.verified);
  return {
    tee: verified,
    attestationVerified: verified,
    provider: ai.provider,
    model: ai.model || null,
    verifier: snapshot?.verifier ?? null,
    verdict: snapshot?.verdict ?? (ai.provider === "openrouter" ? "runs in a TEE per OpenRouter routing; not independently verified" : "no TEE"),
    origin: snapshot?.origin ?? null,
    teeType: snapshot?.teeType ?? null,
    workloadKeysetDigest: snapshot?.workloadKeysetDigest ?? null,
    composeHash: snapshot?.composeHash ?? null,
    sourceProvenance: snapshot?.sourceProvenance ?? null,
    receiptSigningKeys: snapshot?.receiptSigningKeys ?? [],
    checks: snapshot?.checks ?? [],
    verifiedAt: snapshot?.verifiedAt ? new Date(snapshot.verifiedAt * 1000).toISOString() : null,
    keysetExpiresAt: snapshot?.keysetExpiresAt ? new Date(snapshot.keysetExpiresAt * 1000).toISOString() : null,
    error: snapshot?.error ?? null,
    dataProcessing: {
      aiProvider: ai.disclosure,
      operator: "The server operator can read requests handled by this process.",
      chain: "Approved public articles are written to Starknet Sepolia and are public forever.",
    },
    timestamp: new Date().toISOString(),
  };
}

export async function GET() {
  const ai = await aiInfoVerified();
  return NextResponse.json(report(ai), { headers: { "Cache-Control": "no-store" } });
}

// POST { token } returns the same report plus an audit of the signed receipts
// recorded for that session's AI exchanges (request and response body hashes
// bound to the attested keyset). Without a valid token the list is empty.
export async function POST(req: NextRequest) {
  const body = await readJson<{ token?: string }>(req);
  const ai = await aiInfoVerified();
  const lastReceipts = aiProvider() === "phala" ? await auditReceiptsForToken(body?.token) : [];
  if (aiProvider() === "phala") await verifyAttestation();
  return NextResponse.json({ ...report(ai), lastReceipts }, { headers: { "Cache-Control": "no-store" } });
}
