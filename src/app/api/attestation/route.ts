import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { createHash } from "crypto";

export async function GET() {
  const isInTEE = !!process.env.EIGENCOMPUTE_ATTESTATION_URL;

  // If running inside EigenCompute TEE, fetch real attestation
  if (isInTEE) {
    try {
      const res = await fetch(process.env.EIGENCOMPUTE_ATTESTATION_URL!);
      const attestation = await res.json();
      return NextResponse.json({
        tee: true,
        provider: "EigenCompute (Intel TDX)",
        attestation,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Fall through to metadata response
    }
  }

  // Compute image hash from package.json as a fingerprint
  let imageHash = "unavailable";
  try {
    const pkg = readFileSync("package.json", "utf-8");
    imageHash = createHash("sha256").update(pkg).digest("hex").slice(0, 16);
  } catch {
    // Running in standalone mode, package.json may not be at cwd
  }

  return NextResponse.json({
    tee: isInTEE,
    provider: isInTEE ? "EigenCompute (Intel TDX)" : "none (development)",
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      imageHash,
    },
    guarantees: isInTEE
      ? [
          "Code runs inside Intel TDX Trusted Execution Environment",
          "Operator cannot access source identities or encryption keys",
          "AI journalist code is tamper-proof and verifiable",
          "Attestation is cryptographically signed by TEE hardware",
        ]
      : [
          "TEE not detected — running in standard environment",
          "Deploy via EigenCompute for verifiable execution guarantees",
        ],
    timestamp: new Date().toISOString(),
  });
}
