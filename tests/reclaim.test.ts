import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyProof = vi.fn();
vi.mock("@reclaimprotocol/js-sdk", () => ({
  verifyProof: (...args: unknown[]) => verifyProof(...args),
  ReclaimProofRequest: { init: vi.fn() },
}));

import { verifyReclaimProofs } from "@/lib/reclaim";

const VERSION = { providerId: "provider-123", providerVersion: "4.0.0", allowedTags: [] as string[] };

function proof(over: Record<string, unknown> = {}) {
  return {
    identifier: "0x1",
    signatures: ["0xsig"],
    witnesses: [],
    claimData: {
      provider: "http",
      parameters: "{}",
      owner: "0xowner",
      timestampS: 1,
      context: "{}",
      identifier: "0x1",
      epoch: 1,
      ...over,
    },
  } as never;
}

// What SDK 5.8 verifyProof returns after signature and content-hash checks.
function verified(contextOver: Record<string, unknown> = {}) {
  return {
    isVerified: true,
    error: undefined,
    publicData: [],
    data: [
      {
        context: { contextAddress: "vid", contextMessage: "chal", reclaimSessionId: "sess", providerHash: "0xhash", ...contextOver },
        extractedParameters: { role: "engineer" },
      },
    ],
  };
}

const goodSession = async () => ({
  session: { appId: "0xapp", providerId: "provider-123", providerVersionString: "4.0.0", httpProviderId: ["provider-123"], proofs: [{ identifier: "0x1" } as never], statusV2: "PROOF_SUBMITTED" },
});

beforeEach(() => {
  verifyProof.mockReset();
  delete process.env.RECLAIM_PROVIDER_HASH;
});

describe("verifyReclaimProofs", () => {
  it("accepts a valid, bound proof, validates against the exact provider version, and reports only extracted parameters", async () => {
    verifyProof.mockResolvedValue(verified());
    const credential = await verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, goodSession);
    expect(verifyProof).toHaveBeenCalledWith(expect.anything(), { providerId: "provider-123", providerVersion: "4.0.0", allowedTags: [] });
    expect(credential.provider).toBe("provider-123");
    expect(credential.parameters).toEqual({ role: "engineer" });
  });

  it("rejects a forged proof whose signature or content hash fails", async () => {
    verifyProof.mockResolvedValue({ isVerified: false, error: new Error("Identifier mismatch"), data: [], publicData: [] });
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, goodSession)).rejects.toThrow(/Identifier mismatch/);
  });

  it("rejects a request that was created for a different provider than configured", async () => {
    verifyProof.mockResolvedValue(verified());
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", { ...VERSION, providerId: "other" }, goodSession)).rejects.toThrow(/different provider/);
    expect(verifyProof).not.toHaveBeenCalled();
  });

  it("rejects a session created for a different provider or application", async () => {
    verifyProof.mockResolvedValue(verified());
    const otherProvider = async () => ({ session: { appId: "0xapp", providerId: "other", httpProviderId: ["other"], proofs: [{ identifier: "0x1" } as never] } });
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, otherProvider)).rejects.toThrow(/provider/);
    const otherApp = async () => ({ session: { appId: "0xelse", providerId: "provider-123", proofs: [{ identifier: "0x1" } as never] } });
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, otherApp)).rejects.toThrow(/application/);
  });

  it("rejects a proof the initiated session never produced", async () => {
    verifyProof.mockResolvedValue(verified());
    const foreign = async () => ({ session: { appId: "0xapp", providerId: "provider-123", proofs: [{ identifier: "0xother" } as never] } });
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, foreign)).rejects.toThrow(/not produced/);
    const missing = async () => ({});
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, missing)).rejects.toThrow(/not found/);
  });

  it("enforces a pinned provider hash when configured", async () => {
    process.env.RECLAIM_PROVIDER_HASH = "0xHASH";
    verifyProof.mockResolvedValue(verified());
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, goodSession)).resolves.toBeTruthy();
    verifyProof.mockResolvedValue(verified({ providerHash: "0xnope" }));
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, goodSession)).rejects.toThrow(/provider hash/);
  });

  it("rejects a replayed proof bound to another verification request", async () => {
    verifyProof.mockResolvedValue(verified({ contextAddress: "old-vid" }));
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, goodSession)).rejects.toThrow(/not bound/);
    verifyProof.mockResolvedValue(verified({ contextMessage: "old-chal" }));
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, goodSession)).rejects.toThrow(/not bound/);
  });

  it("rejects a mismatched Reclaim session id", async () => {
    verifyProof.mockResolvedValue(verified({ reclaimSessionId: "other" }));
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess", VERSION, goodSession)).rejects.toThrow(/session/);
  });

  it("requires exactly one proof", async () => {
    await expect(verifyReclaimProofs([], "vid", "chal", "sess", VERSION, goodSession)).rejects.toThrow(/Exactly one/);
    await expect(verifyReclaimProofs([proof(), proof()], "vid", "chal", "sess", VERSION, goodSession)).rejects.toThrow(/Exactly one/);
  });
});
