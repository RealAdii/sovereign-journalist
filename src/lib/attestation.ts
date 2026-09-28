// Attestation for the Phala confidential inference gateway (ACI, "Attested
// Confidential Inference"). Verifier used: @phala/aci-verifier 0.7.2, which
// verifies the Intel TDX quote locally with @phala/dcap-qvl (collateral from the
// Phala PCCS), recomputes the keyset digest and report_data for our nonce,
// checks keyset expiry, replays the RTMR3 compose measurement, appraises the
// dstack OS image hash against the production allowlist, and pins the TLS SPKI
// of the channel we actually use. It does not implement the dstack KMS custody
// check (reported as a skip by the library) and does not reconstruct
// MRTD/RTMR0-2. Everything here fails closed: any error means "not verified".
//
// Verified live on 2026-09-29 against https://inference.phala.com with no API
// key: VERIFIED (6 pass, 1 skipped: custody policy not implemented).

import { getCapability } from "./session";
import type { VerifiedCredential } from "./types";

type AciConnection = import("@phala/aci-verifier/runtime").AciConnection;
type TranscriptLine = import("@phala/aci-verifier").TranscriptLine;

export const ATTESTATION_TTL_MS = 10 * 60 * 1000;
export const VERIFIER_NAME = "@phala/aci-verifier 0.7.2 (TDX quote via @phala/dcap-qvl, Phala PCCS)";

export interface AttestationSnapshot {
  verified: boolean;
  verdict: string;
  checks: { id: string; status: string; title: string; detail?: string }[];
  origin?: string;
  teeType?: string;
  workloadKeysetDigest?: string;
  composeHash?: string;
  sourceProvenance?: { repoUrl?: string | null; repoCommit?: string | null; imageDigest?: string | null };
  receiptSigningKeys?: string[];
  verifiedAt?: number;
  keysetExpiresAt?: number;
  verifier: string;
  error?: string;
}

export interface ReceiptRecord {
  receiptId: string;
  purpose: "interview" | "draft";
  model: string;
  recordedAt: number;
}

export interface ReceiptAudit extends ReceiptRecord {
  verified: boolean;
  verdict: string;
  requestBodyHash?: string;
  responseBodyHash?: string;
  servedAt?: number;
  keyId?: string;
  checks: { id: string; status: string; title: string }[];
  error?: string;
}

function baseUrl() {
  return (process.env.PHALA_BASE_URL || "https://inference.phala.com/v1").replace(/\/$/, "");
}

function acceptedComposeHashes(): string[] {
  return (process.env.PHALA_ACCEPTED_COMPOSE_HASHES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let connection: AciConnection | null = null;
let connecting: Promise<AciConnection | null> | null = null;
let snapshot: AttestationSnapshot = { verified: false, verdict: "not attempted", checks: [], verifier: VERIFIER_NAME };

function snapshotFrom(conn: AciConnection): AttestationSnapshot {
  const id = conn.identity;
  const prov = id.report.attestation.source_provenance;
  return {
    verified: id.transcript.verdict.verified,
    verdict: id.transcript.verdict.line,
    checks: id.transcript.lines.map((l: TranscriptLine) => ({ id: l.id, status: l.status, title: l.title, detail: l.detail })),
    origin: id.origin,
    teeType: id.report.attestation.tee_type,
    workloadKeysetDigest: id.workloadKeysetDigest,
    composeHash: id.composeHash,
    sourceProvenance: prov
      ? { repoUrl: prov.repo_url ?? null, repoCommit: prov.repo_commit ?? null, imageDigest: prov.image_digest ?? null }
      : undefined,
    receiptSigningKeys: id.keyset.receipt_signing_keys.map((k) => `${k.key_id}:${k.algo}`),
    verifiedAt: id.verifiedAt,
    keysetExpiresAt: id.keyset.not_after,
    verifier: VERIFIER_NAME,
  };
}

async function connect(): Promise<AciConnection | null> {
  try {
    const { connectAci } = await import("@phala/aci-verifier/runtime");
    const conn = await connectAci({
      baseURL: baseUrl(),
      policy: { requireProductionOs: true, acceptedComposeHashes: acceptedComposeHashes() },
      serving: { requireVerified: true, requireReceipt: true },
      receiptHistorySize: 256,
      timeoutMs: 15_000,
    });
    snapshot = snapshotFrom(conn);
    if (!snapshot.verified) {
      await conn.close().catch(() => undefined);
      return null;
    }
    return conn;
  } catch (error) {
    snapshot = {
      verified: false,
      verdict: "NOT VERIFIED (connection or attestation failed)",
      checks: [],
      verifier: VERIFIER_NAME,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown error",
    };
    return null;
  }
}

/** Returns a verified, SPKI-pinned connection to the gateway, or null (fail closed). */
export async function getAttestedConnection(): Promise<AciConnection | null> {
  const fresh = connection && snapshot.verifiedAt && Date.now() - snapshot.verifiedAt * 1000 < ATTESTATION_TTL_MS;
  if (connection && fresh) return connection;
  if (connection && !fresh) {
    try {
      await connection.refresh();
      snapshot = snapshotFrom(connection);
      if (snapshot.verified) return connection;
    } catch (error) {
      snapshot = { ...snapshot, verified: false, verdict: "NOT VERIFIED (refresh failed)", error: error instanceof Error ? error.message.slice(0, 200) : "refresh failed" };
    }
    await connection.close().catch(() => undefined);
    connection = null;
  }
  if (!connecting) {
    connecting = connect().finally(() => {
      connecting = null;
    });
  }
  connection = await connecting;
  return connection;
}

/** Last known attestation result. Sync, for UI labels; never triggers network. */
export function attestationSnapshot(): AttestationSnapshot {
  return snapshot;
}

/** Forces a fresh verification and returns the result. */
export async function verifyAttestation(): Promise<AttestationSnapshot> {
  await getAttestedConnection();
  return snapshot;
}

// Receipt ids are kept in memory per session credential so the source can ask
// for an audit of the exact exchanges that produced their interview and draft.
// No text is stored, only ids and hashes.
const receiptsBySession = new Map<string, ReceiptRecord[]>();
const MAX_RECEIPTS_PER_SESSION = 64;

export function sessionKey(credential: VerifiedCredential) {
  return `${credential.provider}:${credential.verifiedAt}`;
}

export function recordReceipt(credential: VerifiedCredential, record: ReceiptRecord) {
  const key = sessionKey(credential);
  const list = receiptsBySession.get(key) || [];
  list.push(record);
  receiptsBySession.set(key, list.slice(-MAX_RECEIPTS_PER_SESSION));
}

export function receiptsForCredential(credential: VerifiedCredential): ReceiptRecord[] {
  return receiptsBySession.get(sessionKey(credential)) || [];
}

export function receiptsForToken(token: string | undefined): ReceiptRecord[] {
  const capability = getCapability(token);
  return capability ? receiptsForCredential(capability.credential) : [];
}

function bodyHash(events: unknown, type: string): string | undefined {
  if (!Array.isArray(events)) return undefined;
  const event = events.find((e) => e && typeof e === "object" && (e as { type?: string }).type === type) as
    | { body_hash?: string }
    | undefined;
  return event?.body_hash;
}

/** Verifies one recorded receipt under the attested keyset. Fails closed. */
export async function auditReceipt(record: ReceiptRecord): Promise<ReceiptAudit> {
  const conn = await getAttestedConnection();
  if (!conn) {
    return { ...record, verified: false, verdict: "NOT VERIFIED (no attested connection)", checks: [] };
  }
  try {
    const audit = await conn.verifyReceipt(record.receiptId);
    const payload = audit.receipt as unknown as { event_log?: unknown; served_at?: number; key_id?: string; model?: string };
    return {
      ...record,
      model: payload.model || record.model,
      verified: audit.transcript.verdict.verified,
      verdict: audit.transcript.verdict.line,
      requestBodyHash: bodyHash(payload.event_log, "request.received"),
      responseBodyHash: bodyHash(payload.event_log, "response.returned"),
      servedAt: payload.served_at,
      keyId: payload.key_id,
      checks: audit.transcript.lines.map((l: TranscriptLine) => ({ id: l.id, status: l.status, title: l.title })),
    };
  } catch (error) {
    return {
      ...record,
      verified: false,
      verdict: "NOT VERIFIED (receipt audit failed)",
      checks: [],
      error: error instanceof Error ? error.message.slice(0, 200) : "audit failed",
    };
  }
}

export async function auditReceiptsForToken(token: string | undefined): Promise<ReceiptAudit[]> {
  const records = receiptsForToken(token);
  return Promise.all(records.map(auditReceipt));
}

/** Test hook. */
export function resetAttestationForTests() {
  connection = null;
  connecting = null;
  snapshot = { verified: false, verdict: "not attempted", checks: [], verifier: VERIFIER_NAME };
  receiptsBySession.clear();
}
