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
      provider: "provider-123",
      parameters: "{}",
      owner: "0xowner",
      timestampS: 1,
      context: JSON.stringify({
        address: "vid",
        message: "chal",
        sessionId: "sess",
        extractedParameters: { role: "engineer" },
        ...contextOver,
      }),
      identifier: "0x1",
      epoch: 1,
      ...over,
    },
  } as never;
}

beforeEach(() => verifyProof.mockReset());

describe("verifyReclaimProofs", () => {
  it("accepts a valid, bound proof and reports only extracted parameters", async () => {
    verifyProof.mockResolvedValue(true);
    const credential = await verifyReclaimProofs([proof()], "vid", "chal", "sess");
    expect(verifyProof).toHaveBeenCalledWith(expect.anything(), false);
    expect(credential.provider).toBe("provider-123");
    expect(credential.parameters).toEqual({ role: "engineer" });
  });

  it("rejects a forged proof whose signature fails", async () => {
    verifyProof.mockResolvedValue(false);
    await expect(verifyReclaimProofs([proof()], "vid", "chal", "sess")).rejects.toThrow(/signature/);
  });

  it("rejects a proof for a different provider", async () => {
    verifyProof.mockResolvedValue(true);
    await expect(verifyReclaimProofs([proof({ provider: "other" })], "vid", "chal", "sess")).rejects.toThrow(/provider/);
  });

  it("rejects a replayed proof bound to another verification request", async () => {
    verifyProof.mockResolvedValue(true);
    await expect(verifyReclaimProofs([proof({}, { address: "old-vid" })], "vid", "chal", "sess")).rejects.toThrow(/not bound/);
    await expect(verifyReclaimProofs([proof({}, { message: "old-chal" })], "vid", "chal", "sess")).rejects.toThrow(/not bound/);
  });

  it("rejects a mismatched Reclaim session id", async () => {
    verifyProof.mockResolvedValue(true);
    await expect(verifyReclaimProofs([proof({}, { sessionId: "other" })], "vid", "chal", "sess")).rejects.toThrow(/session/);
  });

  it("requires exactly one proof", async () => {
    await expect(verifyReclaimProofs([], "vid", "chal", "sess")).rejects.toThrow(/Exactly one/);
    await expect(verifyReclaimProofs([proof(), proof()], "vid", "chal", "sess")).rejects.toThrow(/Exactly one/);
  });
});
