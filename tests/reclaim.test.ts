import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyProof = vi.fn();
vi.mock("@reclaimprotocol/js-sdk", () => ({
  verifyProof: (...args: unknown[]) => verifyProof(...args),
  ReclaimProofRequest: { init: vi.fn() },
}));

import { verifyReclaimProofs } from "@/lib/reclaim";

function proof(over: Record<string, unknown> = {}, contextOver: Record<string, unknown> = {}) {
  return {
    identifier: "0x1",
    signatures: ["0xsig"],
    witnesses: [],
    claimData: {
      provider: "http",
      parameters: "{}",
      owner: "0xowner",
      timestampS: 1,
      context: JSON.stringify({
        contextAddress: "vid",
        contextMessage: "chal",
        providerHash: "0xhash",
        extractedParameters: { role: "engineer" },
        ...contextOver,
      }),
      identifier: "0x1",
      epoch: 1,
      ...over,
    },
  } as never;
}

const goodSession = async () => ({
  session: { appId: "0xapp", httpProviderId: ["provider-123"], proofs: [{ identifier: "0x1" } as never], statusV2: "PROOF_SUBMITTED" },
});

beforeEach(() => {
  verifyProof.mockReset();
  delete process.env.RECLAIM_PROVIDER_HASH;
});

describe("verifyReclaimProofs", () => {
  it("accepts a valid, bound proof and reports only extracted parameters", async () => {
    verifyProof.mockResolvedValue(true);
    const credential = await verifyReclaimProofs([proof()], "vid", "chal", "sess", goodSession);
    expect(verifyProof).toHaveBeenCalledWith(expect.anything(), false);
    expect(credential.provider).toBe("provider-123");
    expect(credential.parameters).toEqual({ role: "engineer" });
  });

  it("rejects a forged proof whose signature fails", async () => {
    verifyProof.mockResolvedValue(false);
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", goodSession)).rejects.toThrow(/signature/);
  });

  it("rejects a session created for a different provider or application", async () => {
    verifyProof.mockResolvedValue(true);
    const otherProvider = async () => ({ session: { appId: "0xapp", httpProviderId: ["other"], proofs: [{ identifier: "0x1" } as never] } });
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", otherProvider)).rejects.toThrow(/provider/);
    const otherApp = async () => ({ session: { appId: "0xelse", httpProviderId: ["provider-123"], proofs: [{ identifier: "0x1" } as never] } });
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", otherApp)).rejects.toThrow(/application/);
  });

  it("rejects a proof the initiated session never produced", async () => {
    verifyProof.mockResolvedValue(true);
    const foreign = async () => ({ session: { appId: "0xapp", httpProviderId: ["provider-123"], proofs: [{ identifier: "0xother" } as never] } });
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", foreign)).rejects.toThrow(/not produced/);
    const missing = async () => ({});
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", missing)).rejects.toThrow(/not found/);
  });

  it("enforces a pinned provider hash when configured", async () => {
    verifyProof.mockResolvedValue(true);
    process.env.RECLAIM_PROVIDER_HASH = "0xHASH";
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", goodSession)).resolves.toBeTruthy();
    await expect(verifyReclaimProofs([proof({}, { providerHash: "0xnope" })], "vid", "chal", "sess", goodSession)).rejects.toThrow(/provider hash/);
  });

  it("rejects a replayed proof bound to another verification request", async () => {
    verifyProof.mockResolvedValue(true);
    await expect(verifyReclaimProofs([proof({}, { contextAddress: "old-vid" })], "vid", "chal", "sess", goodSession)).rejects.toThrow(/not bound/);
    await expect(verifyReclaimProofs([proof({}, { contextMessage: "old-chal" })], "vid", "chal", "sess", goodSession)).rejects.toThrow(/not bound/);
  });

  it("rejects a mismatched Reclaim session id", async () => {
    verifyProof.mockResolvedValue(true);
    await expect(verifyReclaimProofs([proof({}, { sessionId: "other" })], "vid", "chal", "sess", goodSession)).rejects.toThrow(/session/);
  });

  it("requires exactly one proof", async () => {
    await expect(verifyReclaimProofs([], "vid", "chal", "sess", goodSession)).rejects.toThrow(/Exactly one/);
    await expect(verifyReclaimProofs([proof(), proof()], "vid", "chal", "sess", goodSession)).rejects.toThrow(/Exactly one/);
  });
});
