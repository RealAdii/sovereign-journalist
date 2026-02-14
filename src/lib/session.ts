import crypto from "crypto";
import type { VerifiedCredential } from "./types";

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";

interface SessionPayload {
  credential: VerifiedCredential;
  exp: number;
}

export function signCredential(credential: VerifiedCredential): string {
  const payload: SessionPayload = {
    credential,
    exp: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
  };

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(data)
    .digest("base64url");

  return `${data}.${sig}`;
}

export function verifySessionToken(
  token: string
): VerifiedCredential | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(data)
    .digest("base64url");

  if (sig !== expectedSig) return null;

  try {
    const payload: SessionPayload = JSON.parse(
      Buffer.from(data, "base64url").toString()
    );

    if (payload.exp < Date.now()) return null;

    return payload.credential;
  } catch {
    return null;
  }
}
