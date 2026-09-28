import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fixture shaped after the live 2026-09-29 run of @phala/aci-verifier against
// https://inference.phala.com (VERIFIED, 6 pass, 1 skipped).
const LIVE_LINES = [
  { id: "id-1", section: "9.1(1)", title: "hardware quote verifies to the TEE vendor root and binds report_data", status: "pass", detail: "TDX quote verified to the Intel root (TCB UpToDate)" },
  { id: "id-2", section: "9.1(2)", title: "keyset JCS digest statement report_data recomputed for our nonce", status: "pass" },
  { id: "id-3", section: "9.1(3)", title: "keyset not expired (now < not_after)", status: "pass" },
  { id: "id-4", section: "9.1(4)", title: "the running compose is measured into the quote (source provenance)", status: "pass" },
  { id: "policy-os", section: "1.3", title: "RTMR3 os-image-hash satisfies the production allowlist", status: "pass" },
  { id: "id-5", section: "9.1(5)", title: "private-key custody satisfies the verifier policy", status: "skip", reason: "custody policy not implemented" },
  { id: "id-6", section: "1.1", title: "the channel actually used is bound to the attested keyset", status: "pass" },
];

const COMPOSE = "0637b3d506c80c0328c84697c290f5fb7eef811c8d022124e04ee9b0f5f99567";

function fakeConnection(verified = true) {
  const verifyReceipt = vi.fn(async (receiptId: string) => {
    if (receiptId === "rcpt-bad") throw new Error("receipt_not_found");
    return {
      receiptId,
      receipt: {
        key_id: "dstack-kms-receipt-ed25519-v1",
        signature: "sig",
        api_version: "aci/1",
        receipt_id: receiptId,
        model: "deepseek/deepseek-v3.2",
        workload_keyset_digest: "sha256:ef8a03c0",
        endpoint: "/v1/chat/completions",
        method: "POST",
        served_at: 1790620000,
        event_log: [
          { type: "request.received", body_hash: "sha256:reqhash" },
          { type: "response.returned", body_hash: "sha256:reshash" },
        ],
      },
      transcript: { verdict: { verified: receiptId !== "rcpt-tampered", line: receiptId === "rcpt-tampered" ? "NOT VERIFIED (1 fail: receipt-1)" : "VERIFIED (4 pass)" }, lines: [{ id: "receipt-1", section: "9.3(1)", title: "signature verifies under the attested keyset", status: receiptId === "rcpt-tampered" ? "fail" : "pass" }] },
      exchange: { receiptId, method: "POST", path: "/v1/chat/completions", status: 200, recordedAt: Date.now(), responseComplete: true },
    };
  });
  return {
    baseURL: "https://inference.phala.com/v1",
    identity: {
      origin: "https://inference.phala.com",
      hostname: "inference.phala.com",
      report: { api_version: "aci/1", workload_keyset_digest: "sha256:ef8a03c0", attestation: { tee_type: "tdx", workload_keyset: {}, report_data: "rd", source_provenance: { repo_url: "https://github.com/Dstack-TEE/private-ai-gateway.git", repo_commit: "8d0a666a", image_digest: null } } },
      keyset: { not_after: 1792000000, receipt_signing_keys: [{ key_id: "dstack-kms-receipt-ed25519-v1", algo: "ed25519", public_key: "pk" }], e2ee_public_keys: [] },
      workloadKeysetDigest: "sha256:ef8a03c0",
      composeHash: COMPOSE,
      tlsSpkiPins: ["8e89a8a0"],
      verifiedAt: Math.floor(Date.now() / 1000),
      expiresAt: 1792000000,
      transcript: { lines: LIVE_LINES, verdict: { verified, line: verified ? "VERIFIED (6 pass, 1 skipped: custody policy not implemented)" : "NOT VERIFIED (1 fail: id-6; 5 pass, 1 skipped)" }, verification: { ok: verified, checks: [] } },
    },
    fetch: vi.fn(),
    receipts: () => [],
    verifyReceipt,
    refresh: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

const connectAci = vi.fn();
vi.mock("@phala/aci-verifier/runtime", () => ({ connectAci: (...args: unknown[]) => connectAci(...args) }));

import { attestationSnapshot, auditReceipt, getAttestedConnection, recordReceipt, receiptsForCredential, resetAttestationForTests, verifyAttestation, VERIFIER_NAME } from "@/lib/attestation";
import { aiInfo, aiProvider } from "@/lib/ai";

const credential = { provider: "p", parameters: {}, verifiedAt: "2026-09-29T00:00:00Z" };

beforeEach(() => {
  resetAttestationForTests();
  connectAci.mockReset();
  delete process.env.PHALA_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
});
afterEach(() => vi.useRealTimers());

describe("attestation verification", () => {
  it("starts unverified and reports the verifier by name", () => {
    const s = attestationSnapshot();
    expect(s.verified).toBe(false);
    expect(s.verifier).toBe(VERIFIER_NAME);
    expect(s.verifier).toMatch(/dcap-qvl/);
  });

  it("records a verified transcript with compose hash, provenance, and keys when every check passes", async () => {
    connectAci.mockResolvedValue(fakeConnection(true));
    const s = await verifyAttestation();
    expect(s.verified).toBe(true);
    expect(s.composeHash).toBe(COMPOSE);
    expect(s.sourceProvenance?.repoCommit).toBe("8d0a666a");
    expect(s.receiptSigningKeys).toEqual(["dstack-kms-receipt-ed25519-v1:ed25519"]);
    expect(s.checks.find((c) => c.id === "id-1")?.status).toBe("pass");
    expect(s.checks.find((c) => c.id === "id-6")?.status).toBe("pass");
    expect(connectAci).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://inference.phala.com/v1", policy: expect.objectContaining({ requireProductionOs: true }), serving: { requireVerified: true, requireReceipt: true } }));
  });

  it("fails closed when the library reports a failed check and closes the connection", async () => {
    const conn = fakeConnection(false);
    connectAci.mockResolvedValue(conn);
    const s = await verifyAttestation();
    expect(s.verified).toBe(false);
    expect(await getAttestedConnection()).toBeNull();
    expect(conn.close).toHaveBeenCalled();
  });

  it("fails closed when connecting throws (network, PCCS, quote, or TLS pin errors)", async () => {
    connectAci.mockRejectedValue(new Error("attestation_verification: TCB out of date"));
    const s = await verifyAttestation();
    expect(s.verified).toBe(false);
    expect(s.error).toMatch(/TCB out of date/);
    expect(await getAttestedConnection()).toBeNull();
  });

  it("reuses the verified connection inside the TTL and refreshes after it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T00:00:00Z"));
    const conn = fakeConnection(true);
    conn.identity.verifiedAt = Math.floor(Date.now() / 1000);
    connectAci.mockResolvedValue(conn);
    await getAttestedConnection();
    await getAttestedConnection();
    expect(connectAci).toHaveBeenCalledTimes(1);
    expect(conn.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11 * 60 * 1000);
    conn.identity.verifiedAt = Math.floor(Date.now() / 1000);
    await getAttestedConnection();
    expect(conn.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("receipts", () => {
  it("records receipt ids per session without text and audits them under the attested keyset", async () => {
    connectAci.mockResolvedValue(fakeConnection(true));
    recordReceipt(credential, { receiptId: "rcpt-1", purpose: "interview", model: "m", recordedAt: 1 });
    recordReceipt(credential, { receiptId: "rcpt-2", purpose: "draft", model: "m", recordedAt: 2 });
    expect(receiptsForCredential(credential).map((r) => r.receiptId)).toEqual(["rcpt-1", "rcpt-2"]);
    expect(JSON.stringify(receiptsForCredential(credential))).not.toMatch(/content|message/);
    const audit = await auditReceipt(receiptsForCredential(credential)[0]);
    expect(audit.verified).toBe(true);
    expect(audit.requestBodyHash).toBe("sha256:reqhash");
    expect(audit.responseBodyHash).toBe("sha256:reshash");
    expect(audit.keyId).toBe("dstack-kms-receipt-ed25519-v1");
    expect(audit.model).toBe("deepseek/deepseek-v3.2");
  });

  it("reports a tampered or unknown receipt as not verified, never throws", async () => {
    connectAci.mockResolvedValue(fakeConnection(true));
    const tampered = await auditReceipt({ receiptId: "rcpt-tampered", purpose: "interview", model: "m", recordedAt: 1 });
    expect(tampered.verified).toBe(false);
    expect(tampered.verdict).toMatch(/NOT VERIFIED/);
    const unknown = await auditReceipt({ receiptId: "rcpt-bad", purpose: "interview", model: "m", recordedAt: 1 });
    expect(unknown.verified).toBe(false);
    expect(unknown.error).toMatch(/receipt_not_found/);
  });

  it("cannot audit anything without an attested connection", async () => {
    connectAci.mockRejectedValue(new Error("down"));
    const audit = await auditReceipt({ receiptId: "rcpt-1", purpose: "interview", model: "m", recordedAt: 1 });
    expect(audit.verified).toBe(false);
    expect(audit.verdict).toMatch(/no attested connection/);
  });
});

describe("phala provider selection and disclosure", () => {
  it("is preferred over every other backend when configured", () => {
    process.env.PHALA_API_KEY = "k";
    process.env.OPENROUTER_API_KEY = "k";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    expect(aiProvider()).toBe("phala");
  });

  it("says attestation is not verified until the check has run, then names the evidence", async () => {
    process.env.PHALA_API_KEY = "k";
    let info = aiInfo();
    expect(info.attestation?.verified).toBe(false);
    expect(info.disclosure).toMatch(/not verified/);
    expect(info.disclosure).toMatch(/No text is sent until verification succeeds/);
    connectAci.mockResolvedValue(fakeConnection(true));
    await verifyAttestation();
    info = aiInfo();
    expect(info.attestation?.verified).toBe(true);
    expect(info.label).toMatch(/attested GPU TEE/);
    expect(info.disclosure).toMatch(/Intel TDX quote/);
    expect(info.disclosure).toMatch(/server's operator can read it in transit/);
    expect(info.external).toBe(true);
  });

  it("refuses to send text through the phala backend when attestation fails", async () => {
    process.env.PHALA_API_KEY = "k";
    connectAci.mockRejectedValue(new Error("down"));
    const { conductInterviewStream } = await import("@/lib/phala");
    await expect(conductInterviewStream([{ role: "user", content: "hi" }], credential)).rejects.toThrow(/could not be attested/);
  });

  it("sends through the pinned connection, records the receipt id, and rejects replies without one", async () => {
    process.env.PHALA_API_KEY = "k";
    const conn = fakeConnection(true);
    conn.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const headers = new Headers(body.stream ? { "x-receipt-id": "rcpt-stream" } : {});
      return body.stream
        ? new Response('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers })
        : new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"T","subtitle":"S","body":"B"}' } }] }), { status: 200, headers });
    }) as never;
    connectAci.mockResolvedValue(conn);
    const { conductInterviewStream, generateArticle } = await import("@/lib/phala");
    const stream = await conductInterviewStream([{ role: "user", content: "hi" }], credential);
    const text = await new Response(stream).text();
    expect(text).toBe("Hi");
    expect(receiptsForCredential(credential).map((r) => r.receiptId)).toEqual(["rcpt-stream"]);
    const call = (conn.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toBe("https://inference.phala.com/v1/chat/completions");
    expect((call[1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
    await expect(generateArticle([{ role: "user", content: "hi" }], credential)).rejects.toThrow(/no receipt id/);
  });
});
