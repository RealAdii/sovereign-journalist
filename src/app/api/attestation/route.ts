import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This build does not verify any hardware attestation. Reporting tee: true from
// an environment variable was removed because it proved nothing.
export async function GET() {
  return NextResponse.json({
    tee: false,
    attestationVerified: false,
    provider: "none",
    dataProcessing: {
      aiProvider: "Google Gemini receives interview messages and the draft article in plain text.",
      operator: "The server operator can read requests handled by this process.",
      chain: "Approved public articles are written to Starknet Sepolia and are public forever.",
    },
    timestamp: new Date().toISOString(),
  });
}
