import { NextRequest, NextResponse } from "next/server";
import { extractCredential } from "@/lib/reclaim";
import { signCredential } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { proofs } = await req.json();

    if (!proofs || !Array.isArray(proofs) || proofs.length === 0) {
      return NextResponse.json(
        { error: "No proofs provided" },
        { status: 400 }
      );
    }

    const credential = extractCredential(proofs);
    const sessionToken = signCredential(credential);

    return NextResponse.json({ credential, sessionToken });
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
