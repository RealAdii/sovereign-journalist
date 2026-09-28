import crypto from "crypto";
import type { VerifiedCredential } from "./types";
import type { ProviderVersion } from "./reclaim";
import { getSessionStore, resetSessionStoreForTests, type SessionStore } from "./session-store";

type VerificationRecord = {
  type: "verification";
  expiresAt: number;
  challenge: string;
  reclaimSessionId: string;
  providerVersion: ProviderVersion;
};

type CapabilityRecord = {
  type: "capability";
  expiresAt: number;
  credential: VerifiedCredential;
  recoveryHash: string;
  bondStatus: "blocked" | "confirmed" | "dev-bypass";
  usedForPublish: boolean;
  aiRequests: number;
};

type RateLimitRecord = {
  type: "rate-limit";
  expiresAt: number;
  count: number;
};

type StoredRecord = VerificationRecord | CapabilityRecord | RateLimitRecord;

export const MAX_AI_REQUESTS = 30;
export const CAPABILITY_TTL_MS = 2 * 60 * 60 * 1000;
export const VERIFICATION_TTL_MS = 10 * 60 * 1000;

// Storage lives behind src/lib/session-store.ts (file store for development,
// Neon Postgres when SESSION_STORE_URL is set). Every function that touches
// the store is async so hosted deployments share one-use state correctly.
function store(): SessionStore<StoredRecord> {
  return getSessionStore() as SessionStore<StoredRecord>;
}

function secret(name: "SESSION_SECRET" | "RATE_LIMIT_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  return value;
}

function hash(value: string, purpose: string) {
  return crypto
    .createHmac("sha256", secret("SESSION_SECRET"))
    .update(`${purpose}:${value}`)
    .digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function capabilityKey(token: string) {
  return `cap:${hash(token, "capability")}`;
}

export function createVerificationRecord() {
  return { verificationId: randomToken(), challenge: randomToken() };
}

export async function saveVerificationRecord(
  verificationId: string,
  challenge: string,
  reclaimSessionId: string,
  providerVersion: ProviderVersion,
) {
  await store().put(`verify:${hash(verificationId, "verification")}`, {
    type: "verification",
    expiresAt: Date.now() + VERIFICATION_TTL_MS,
    challenge,
    reclaimSessionId,
    providerVersion,
  });
}

export async function peekVerificationRecord(verificationId: string) {
  const record = await store().get(`verify:${hash(verificationId, "verification")}`);
  return record?.type === "verification" ? record : null;
}

// One-use: `take` removes and returns atomically, so a replay cannot win a race.
export async function consumeVerificationRecord(verificationId: string) {
  const record = await store().take(`verify:${hash(verificationId, "verification")}`);
  return record?.type === "verification" ? record : null;
}

export async function issueCapability(credential: VerifiedCredential) {
  const token = randomToken();
  const recoveryCode = randomToken(20);
  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND === "true";
  const record: CapabilityRecord = {
    type: "capability",
    expiresAt: Date.now() + CAPABILITY_TTL_MS,
    credential,
    recoveryHash: hash(recoveryCode, "recovery"),
    bondStatus: devBypass ? "dev-bypass" : "blocked",
    usedForPublish: false,
    aiRequests: 0,
  };
  await store().put(capabilityKey(token), record);
  return { token, recoveryCode, expiresAt: record.expiresAt, bondStatus: record.bondStatus };
}

export async function getCapability(token: string | undefined) {
  if (!token) return null;
  const record = await store().get(capabilityKey(token));
  return record?.type === "capability" ? record : null;
}

export async function requireBondedCapability(token: string | undefined) {
  const record = await getCapability(token);
  if (!record) return { error: "invalid" as const };
  if (record.bondStatus === "blocked") return { error: "bond-blocked" as const };
  return { record };
}

export async function recordAiRequest(token: string) {
  const key = capabilityKey(token);
  const record = await store().get(key);
  if (!record || record.type !== "capability" || record.aiRequests >= MAX_AI_REQUESTS) return false;
  record.aiRequests += 1;
  await store().put(key, record);
  return true;
}

export async function consumePublishCapability(token: string) {
  const key = capabilityKey(token);
  const record = await store().get(key);
  if (
    !record ||
    record.type !== "capability" ||
    record.usedForPublish ||
    record.bondStatus === "blocked"
  ) {
    return null;
  }
  record.usedForPublish = true;
  await store().put(key, record);
  return record;
}

export async function releasePublishCapability(token: string) {
  const key = capabilityKey(token);
  const record = await store().get(key);
  if (!record || record.type !== "capability") return;
  record.usedForPublish = false;
  await store().put(key, record);
}

export async function cancelCapability(token: string | undefined) {
  if (!token) return false;
  const key = capabilityKey(token);
  const record = await store().get(key);
  if (!record || record.type !== "capability") return false;
  await store().remove(key);
  return true;
}

export async function resetStoreForTests() {
  await store().clear();
  resetSessionStoreForTests();
}

export async function recoverCapability(recoveryCode: string) {
  const expected = hash(recoveryCode, "recovery");
  for (const [key, record] of await store().entries("cap:")) {
    if (
      record.type === "capability" &&
      crypto.timingSafeEqual(Buffer.from(record.recoveryHash), Buffer.from(expected))
    ) {
      const token = randomToken();
      await store().remove(key);
      await store().put(capabilityKey(token), record);
      return { token, expiresAt: record.expiresAt, bondStatus: record.bondStatus };
    }
  }
  return null;
}

export async function enforceRateLimit(keyMaterial: string, limit: number, windowMs: number) {
  const key = `rate:${crypto
    .createHmac("sha256", secret("RATE_LIMIT_SECRET"))
    .update(keyMaterial)
    .digest("hex")}`;
  const current = await store().get(key);
  if (!current || current.type !== "rate-limit") {
    await store().put(key, { type: "rate-limit", count: 1, expiresAt: Date.now() + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  await store().put(key, current);
  return true;
}
