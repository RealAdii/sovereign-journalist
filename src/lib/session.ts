import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { BondRecord, BondStatus, VerifiedCredential } from "./types";
import type { ProviderVersion } from "./reclaim";

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
  bondStatus: BondStatus;
  bond?: BondRecord;
  usedForPublish: boolean;
  aiRequests: number;
};

export type { CapabilityRecord };

type RateLimitRecord = {
  type: "rate-limit";
  expiresAt: number;
  count: number;
};

type StoredRecord = VerificationRecord | CapabilityRecord | RateLimitRecord;
type StoreShape = Record<string, StoredRecord>;

export const MAX_AI_REQUESTS = 30;
export const CAPABILITY_TTL_MS = 2 * 60 * 60 * 1000;
export const VERIFICATION_TTL_MS = 10 * 60 * 1000;

const memoryStore = new Map<string, StoredRecord>();
let loaded = false;

function secret(name: "SESSION_SECRET" | "RATE_LIMIT_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  return value;
}

function storePath(): string | null {
  const configured = process.env.SESSION_STORE_PATH;
  if (!configured) return null;
  return path.resolve(process.cwd(), configured);
}

function loadStore() {
  if (loaded) return;
  loaded = true;
  const file = storePath();
  if (!file || !fs.existsSync(file)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as StoreShape;
    for (const [key, value] of Object.entries(parsed)) {
      if (value.expiresAt > Date.now()) memoryStore.set(key, value);
    }
  } catch {
    throw new Error("Unable to read the configured session store");
  }
}

function persistStore() {
  const file = storePath();
  if (!file) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_STORE_PATH is required in production");
    }
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const live: StoreShape = {};
  for (const [key, value] of memoryStore) {
    if (value.expiresAt > Date.now()) live[key] = value;
  }
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(live), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function put(key: string, record: StoredRecord) {
  loadStore();
  memoryStore.set(key, record);
  persistStore();
}

function get(key: string): StoredRecord | null {
  loadStore();
  const record = memoryStore.get(key);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    persistStore();
    return null;
  }
  return record;
}

function remove(key: string) {
  loadStore();
  memoryStore.delete(key);
  persistStore();
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

export function createVerificationRecord() {
  return { verificationId: randomToken(), challenge: randomToken() };
}

export function saveVerificationRecord(
  verificationId: string,
  challenge: string,
  reclaimSessionId: string,
  providerVersion: ProviderVersion,
) {
  put(`verify:${hash(verificationId, "verification")}`, {
    type: "verification",
    expiresAt: Date.now() + VERIFICATION_TTL_MS,
    challenge,
    reclaimSessionId,
    providerVersion,
  });
}

export function peekVerificationRecord(verificationId: string) {
  const record = get(`verify:${hash(verificationId, "verification")}`);
  return record?.type === "verification" ? record : null;
}

export function consumeVerificationRecord(verificationId: string) {
  const key = `verify:${hash(verificationId, "verification")}`;
  const record = get(key);
  if (!record || record.type !== "verification") return null;
  remove(key);
  return record;
}

export function issueCapability(credential: VerifiedCredential) {
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
  put(`cap:${hash(token, "capability")}`, record);
  return { token, recoveryCode, expiresAt: record.expiresAt, bondStatus: record.bondStatus };
}

export function getCapability(token: string | undefined) {
  if (!token) return null;
  const record = get(`cap:${hash(token, "capability")}`);
  return record?.type === "capability" ? record : null;
}

export function requireBondedCapability(token: string | undefined) {
  const record = getCapability(token);
  if (!record) return { error: "invalid" as const };
  if (record.bondStatus !== "confirmed" && record.bondStatus !== "dev-bypass") {
    return { error: "bond-blocked" as const };
  }
  return { record };
}

/** Bond bookkeeping. The token is never stored; the record is found by its HMAC key. */
export function setBondState(token: string, bondStatus: BondStatus, bond: BondRecord | undefined) {
  const key = `cap:${hash(token, "capability")}`;
  const record = get(key);
  if (!record || record.type !== "capability") return null;
  record.bondStatus = bondStatus;
  record.bond = bond;
  put(key, record);
  return record;
}

/** Live capability records with their store keys, for uniqueness checks and sweeps. */
export function listCapabilityRecords(): { key: string; record: CapabilityRecord }[] {
  loadStore();
  const out: { key: string; record: CapabilityRecord }[] = [];
  for (const [key, record] of memoryStore) {
    if (key.startsWith("cap:") && record.type === "capability" && record.expiresAt > Date.now()) {
      out.push({ key, record });
    }
  }
  return out;
}

export function updateCapabilityByKey(key: string, patch: Partial<CapabilityRecord>) {
  const record = get(key);
  if (!record || record.type !== "capability") return null;
  Object.assign(record, patch);
  put(key, record);
  return record;
}

export function recordAiRequest(token: string) {
  const key = `cap:${hash(token, "capability")}`;
  const record = get(key);
  if (!record || record.type !== "capability" || record.aiRequests >= MAX_AI_REQUESTS) return false;
  record.aiRequests += 1;
  put(key, record);
  return true;
}

export function consumePublishCapability(token: string) {
  const key = `cap:${hash(token, "capability")}`;
  const record = get(key);
  if (
    !record ||
    record.type !== "capability" ||
    record.usedForPublish ||
    record.bondStatus === "blocked"
  ) {
    return null;
  }
  record.usedForPublish = true;
  put(key, record);
  return record;
}

export function releasePublishCapability(token: string) {
  const key = `cap:${hash(token, "capability")}`;
  const record = get(key);
  if (!record || record.type !== "capability") return;
  record.usedForPublish = false;
  put(key, record);
}

export function cancelCapability(token: string | undefined) {
  if (!token) return false;
  const key = `cap:${hash(token, "capability")}`;
  const record = get(key);
  if (!record || record.type !== "capability") return false;
  remove(key);
  return true;
}

export function resetStoreForTests() {
  memoryStore.clear();
  loaded = false;
}

export function recoverCapability(recoveryCode: string) {
  loadStore();
  const expected = hash(recoveryCode, "recovery");
  for (const [key, record] of memoryStore) {
    if (
      key.startsWith("cap:") &&
      record.type === "capability" &&
      record.expiresAt > Date.now() &&
      crypto.timingSafeEqual(Buffer.from(record.recoveryHash), Buffer.from(expected))
    ) {
      const token = randomToken();
      remove(key);
      put(`cap:${hash(token, "capability")}`, record);
      return { token, expiresAt: record.expiresAt, bondStatus: record.bondStatus, bond: record.bond };
    }
  }
  return null;
}

export function enforceRateLimit(keyMaterial: string, limit: number, windowMs: number) {
  const key = `rate:${crypto
    .createHmac("sha256", secret("RATE_LIMIT_SECRET"))
    .update(keyMaterial)
    .digest("hex")}`;
  const current = get(key);
  if (!current || current.type !== "rate-limit") {
    put(key, { type: "rate-limit", count: 1, expiresAt: Date.now() + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  put(key, current);
  return true;
}
