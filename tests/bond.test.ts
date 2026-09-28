import { beforeEach, describe, expect, it, vi } from "vitest";

const discoverNotes = vi.fn();
const discoverRequirement = vi.fn();
const execute = vi.fn();
const submitExecuteResult = vi.fn();
const missing = vi.fn<() => string[]>(() => []);

vi.mock("@/lib/privacy-sdk", () => ({
  missingBondEnv: () => missing(),
  bondEnvConfigured: () => missing().length === 0,
  provingBlock: async () => 100,
  submitExecuteResult: (...args: unknown[]) => submitExecuteResult(...args),
  treasury: async () => ({
    provider: {},
    account: {},
    treasuryAddress: "0x05f34969286cdc0bca4b2d0589418ad825faebea8c02497f89fd8599b5690bb7",
    poolAddress: "0xpool",
    transfers: {
      discoverNotes: (...args: unknown[]) => discoverNotes(...args),
      discoverRequirement: (...args: unknown[]) => discoverRequirement(...args),
      build: () => {
        const builder = {
          with: () => builder,
          surplusTo: () => builder,
          execute: (...args: unknown[]) => execute(...args),
        };
        return builder;
      },
    },
  }),
}));

vi.mock("@starkware-libs/starknet-privacy-sdk", () => ({
  SetupRequirement: { Register: 0, SetupChannel: 1, SetupToken: 2, Ready: 3 },
  MAX_VIEWING_KEY: 2n ** 250n,
}));

vi.mock("starknet", async (importOriginal) => {
  const original = await importOriginal<typeof import("starknet")>();
  class RpcProvider {
    async callContract() {
      return ["0x1bc16d674ec80000"]; // 2 STRK pool fee
    }
  }
  return { ...original, RpcProvider };
});

import {
  BOND_BASE_FRI,
  BondError,
  DUST_MAX,
  STRK_SEPOLIA,
  checkBondPaid,
  issueBondQuote,
  poolFeeFri,
  refundBond,
  resetBondCachesForTests,
  sweepExpiringBonds,
  uniqueExpectedAmount,
} from "@/lib/bond";
import { getCapability, issueCapability, requireBondedCapability, resetStoreForTests } from "@/lib/session";

const credential = { provider: "provider-123", parameters: {}, verifiedAt: "now" };
const RECIPIENT = "0x0123abc";

beforeEach(async () => {
  await resetStoreForTests();
  resetBondCachesForTests();
  discoverNotes.mockReset();
  discoverRequirement.mockReset();
  execute.mockReset();
  submitExecuteResult.mockReset();
  missing.mockReturnValue([]);
  delete process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND;
  delete process.env.BOND_POOL_FEE_CAP_FRI;
  process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS = "0xpool";
  process.env.STARKNET_SEPOLIA_RPC_URL = "http://rpc";
  process.env.NEXT_PUBLIC_BOND_TREASURY_ADDRESS = "0x05f34969286cdc0bca4b2d0589418ad825faebea8c02497f89fd8599b5690bb7";
});

describe("expected amount", () => {
  it("is 1 STRK plus dust, unique among live sessions", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const amount = uniqueExpectedAmount(taken);
      expect(amount).toBeGreaterThan(BOND_BASE_FRI);
      expect(amount - BOND_BASE_FRI).toBeLessThanOrEqual(DUST_MAX);
      expect(taken.has(amount.toString())).toBe(false);
      taken.add(amount.toString());
    }
  });

  it("reads the pool fee live and caches it", async () => {
    expect(await poolFeeFri()).toBe(2_000_000_000_000_000_000n);
    expect(await poolFeeFri()).toBe(2_000_000_000_000_000_000n);
  });
});

describe("quote", () => {
  it("issues one quote per session, keeps it stable, and shows fee and total", async () => {
    const { token } = await issueCapability(credential);
    const quote = await issueBondQuote(token, RECIPIENT);
    expect(quote.status).toBe("quoted");
    expect(quote.tokenAddress).toBe(STRK_SEPOLIA);
    expect(BigInt(quote.expectedAmountFri) - BOND_BASE_FRI).toBeGreaterThan(0n);
    expect(BigInt(quote.totalFri)).toBe(BigInt(quote.expectedAmountFri) + BigInt(quote.poolFeeFri));
    expect(quote.recipient).toBe(RECIPIENT);
    const again = await issueBondQuote(token, "0xother");
    expect(again.expectedAmountFri).toBe(quote.expectedAmountFri);
    expect(again.recipient).toBe(RECIPIENT);
    expect((await getCapability(token))?.bondStatus).toBe("quoted");
    expect(await requireBondedCapability(token)).toEqual({ error: "bond-blocked" });
  });

  it("gives different sessions different amounts", async () => {
    const a = await issueBondQuote((await issueCapability(credential)).token, RECIPIENT);
    const b = await issueBondQuote((await issueCapability(credential)).token, RECIPIENT);
    expect(a.expectedAmountFri).not.toBe(b.expectedAmountFri);
  });

  it("requires a recipient, a live session, and configuration", async () => {
    const { token } = await issueCapability(credential);
    await expect(issueBondQuote(token, "")).rejects.toMatchObject({ status: 400 });
    await expect(issueBondQuote("nope", RECIPIENT)).rejects.toMatchObject({ status: 401 });
    missing.mockReturnValue(["BOND_VIEWING_KEY"]);
    await expect(issueBondQuote(token, RECIPIENT)).rejects.toMatchObject({ status: 503 });
  });

  it("pauses bonds when the pool fee is at or above the cap (fee floor)", async () => {
    process.env.BOND_POOL_FEE_CAP_FRI = "2000000000000000000";
    const { token } = await issueCapability(credential);
    await expect(issueBondQuote(token, RECIPIENT)).rejects.toBeInstanceOf(BondError);
  });

  it("refuses a quote for a dev-bypass session", async () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { token } = await issueCapability(credential);
    await expect(issueBondQuote(token, RECIPIENT)).rejects.toMatchObject({ status: 409 });
  });
});

describe("confirmation by note discovery", () => {
  it("stays quoted until a note with the exact amount exists, then confirms once", async () => {
    const { token } = await issueCapability(credential);
    const quote = await issueBondQuote(token, RECIPIENT);
    const notes = new Map<string, unknown[]>();
    notes.set(STRK_SEPOLIA, [{ id: 7n, amount: BOND_BASE_FRI, sender: "0x1" }]);
    discoverNotes.mockResolvedValue({ notes, timestamp: 100 });
    expect((await checkBondPaid(token)).status).toBe("quoted");
    expect(discoverNotes).toHaveBeenCalledWith({ tokens: [BigInt(STRK_SEPOLIA)], blockIdentifier: 100 });

    notes.set(STRK_SEPOLIA, [
      { id: 7n, amount: BOND_BASE_FRI, sender: "0x1" },
      { id: 9n, amount: BigInt(quote.expectedAmountFri), sender: "0x2" },
    ]);
    const confirmed = await checkBondPaid(token);
    expect(confirmed.status).toBe("confirmed");
    expect((await getCapability(token))?.bond?.noteId).toBe("9");
    expect(await requireBondedCapability(token)).toHaveProperty("record");

    discoverNotes.mockClear();
    expect((await checkBondPaid(token)).status).toBe("confirmed");
    expect(discoverNotes).not.toHaveBeenCalled();
  });

  it("does not confirm from a public transfer or a wrong amount", async () => {
    const { token } = await issueCapability(credential);
    await issueBondQuote(token, RECIPIENT);
    const notes = new Map<string, unknown[]>();
    notes.set(STRK_SEPOLIA, [{ id: 1n, amount: BOND_BASE_FRI + 1n, sender: "0x3" }]);
    discoverNotes.mockResolvedValue({ notes, timestamp: 100 });
    expect((await checkBondPaid(token)).status).toBe("quoted");
    await expect(checkBondPaid((await issueCapability(credential)).token)).rejects.toMatchObject({ status: 409 });
  });
});

describe("refund", () => {
  async function confirmedSession() {
    const { token } = await issueCapability(credential);
    const quote = await issueBondQuote(token, RECIPIENT);
    const notes = new Map<string, unknown[]>();
    notes.set(STRK_SEPOLIA, [{ id: 9n, amount: BigInt(quote.expectedAmountFri), sender: "0x2" }]);
    discoverNotes.mockResolvedValue({ notes, timestamp: 100 });
    await checkBondPaid(token);
    return { token, quote };
  }

  it("transfers the exact amount privately to the recipient and marks the session refunded once", async () => {
    const { token, quote } = await confirmedSession();
    discoverRequirement.mockResolvedValue(3);
    execute.mockResolvedValue({ callAndProof: {}, registry: {}, warnings: [] });
    submitExecuteResult.mockResolvedValue({ transactionHash: "0xrefund", blockNumber: 120 });
    const refunded = await refundBond(token);
    expect(refunded.status).toBe("refunded");
    expect((await getCapability(token))?.bond?.refundTxHash).toBe("0xrefund");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(quote.recipient).toBe(RECIPIENT);
    await refundBond(token);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await requireBondedCapability(token)).toEqual({ error: "bond-blocked" });
  });

  it("refuses when the recipient is not registered in the pool", async () => {
    const { token } = await confirmedSession();
    discoverRequirement.mockResolvedValue(0);
    await expect(refundBond(token)).rejects.toMatchObject({ status: 409 });
    expect((await getCapability(token))?.bondStatus).toBe("confirmed");
  });

  it("refuses to refund a session that never paid", async () => {
    const { token } = await issueCapability(credential);
    await issueBondQuote(token, RECIPIENT);
    await expect(refundBond(token)).rejects.toMatchObject({ status: 409 });
  });

  it("sweeps confirmed bonds whose sessions are about to expire", async () => {
    const { token } = await confirmedSession();
    discoverRequirement.mockResolvedValue(3);
    execute.mockResolvedValue({ callAndProof: {}, registry: {}, warnings: [] });
    submitExecuteResult.mockResolvedValue({ transactionHash: "0xsweep", blockNumber: 130 });
    expect(await sweepExpiringBonds(Date.now())).toEqual([]);
    const soon = (await getCapability(token))!.expiresAt - 5 * 60 * 1000;
    expect(await sweepExpiringBonds(soon)).toEqual(["0xsweep"]);
    expect((await getCapability(token))?.bondStatus).toBe("refunded");
  });
});
