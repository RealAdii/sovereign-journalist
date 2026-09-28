import crypto from "crypto";
import { RpcProvider } from "starknet";
import {
  getCapability,
  listCapabilityRecords,
  setBondState,
  updateCapabilityByKey,
  type CapabilityRecord,
} from "./session";
import { bondEnvConfigured, missingBondEnv, provingBlock, submitExecuteResult, treasury } from "./privacy-sdk";
import type { BondQuote } from "./types";

// The private bond. The source transfers exactly `expectedAmountFri` STRK inside
// the STRK20 pool to the treasury. Pool amounts are encrypted, so only the
// treasury's viewing key can read them: the per-session dust value is the
// session binding and it never appears in a public event. The server confirms
// the payment by discovering the treasury's notes and refunds with a private
// transfer back to the recipient the source chose. No public leg names the source.

export const STRK_SEPOLIA = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
export const BOND_BASE_FRI = 10n ** 18n; // 1 STRK
export const DUST_MAX = 1_000_000_000n; // up to 1e9 fri, invisible in STRK terms
const DEFAULT_FEE_CAP_FRI = 2_500_000_000_000_000_000n; // 2.5 STRK
const FEE_CACHE_MS = 60_000;
const REFUND_BEFORE_EXPIRY_MS = 15 * 60 * 1000;

export function bondConfigured() {
  return bondEnvConfigured();
}

export function bondBlockers(): string[] {
  return missingBondEnv().map((name) => `${name} is not set on the server`);
}

export function treasuryAddress() {
  return process.env.NEXT_PUBLIC_BOND_TREASURY_ADDRESS || "";
}

function feeCapFri() {
  return BigInt(process.env.BOND_POOL_FEE_CAP_FRI || DEFAULT_FEE_CAP_FRI.toString());
}

let feeCache: { value: bigint; at: number } | null = null;

/** Pool fee per private operation, read live from the pool (PATRON convention). */
export async function poolFeeFri(rpcUrl = process.env.STARKNET_SEPOLIA_RPC_URL): Promise<bigint> {
  if (feeCache && Date.now() - feeCache.at < FEE_CACHE_MS) return feeCache.value;
  const pool = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS;
  if (!pool || !rpcUrl) throw new Error("Pool address or RPC is not configured");
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const result = await provider.callContract({ contractAddress: pool, entrypoint: "get_fee_amount", calldata: [] }, "latest");
  const value = BigInt(result[0]);
  feeCache = { value, at: Date.now() };
  return value;
}

let registrationCache: { value: boolean; at: number } | null = null;

/** Whether the treasury has published a viewing key in the pool. A private transfer
 *  to an unregistered recipient cannot be built, so the bond is not offered until this is true. */
export async function treasuryRegistered(rpcUrl = process.env.STARKNET_SEPOLIA_RPC_URL): Promise<boolean> {
  if (registrationCache && Date.now() - registrationCache.at < FEE_CACHE_MS) return registrationCache.value;
  const pool = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS;
  const treasury = treasuryAddress();
  if (!pool || !rpcUrl || !treasury) return false;
  try {
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const result = await provider.callContract({ contractAddress: pool, entrypoint: "get_public_key", calldata: [treasury] }, "latest");
    const value = BigInt(result[0] || "0x0") !== 0n;
    registrationCache = { value, at: Date.now() };
    return value;
  } catch {
    return false;
  }
}

export const TREASURY_NOT_REGISTERED =
  "The treasury has not published a viewing key in the STRK20 pool yet (registration needs a proof; the Sepolia prover currently emits PROOF1, which the pool rejects). Run npm run bond:setup once the prover and SDK agree.";

export function resetBondCachesForTests() {
  feeCache = null;
  registrationCache = null;
}

export function isPoolAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value) && BigInt(value) !== 0n;
}

/** 1 STRK plus a dust value unique among live sessions. */
export function uniqueExpectedAmount(taken: Set<string>): bigint {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const dust = (BigInt(`0x${crypto.randomBytes(8).toString("hex")}`) % DUST_MAX) + 1n;
    const amount = BOND_BASE_FRI + dust;
    if (!taken.has(amount.toString())) return amount;
  }
  throw new Error("Could not allocate a unique bond amount");
}

async function takenAmounts(): Promise<Set<string>> {
  const taken = new Set<string>();
  for (const { record } of await listCapabilityRecords()) {
    if (record.bond?.expectedAmountFri) taken.add(record.bond.expectedAmountFri);
  }
  return taken;
}

export function quoteFor(record: CapabilityRecord, fee: bigint): BondQuote {
  const bond = record.bond;
  if (!bond) throw new Error("No bond quote on this session");
  const expected = BigInt(bond.expectedAmountFri);
  return {
    status: record.bondStatus,
    token: "STRK",
    tokenAddress: STRK_SEPOLIA,
    treasury: treasuryAddress(),
    bondFri: BOND_BASE_FRI.toString(),
    expectedAmountFri: expected.toString(),
    poolFeeFri: fee.toString(),
    totalFri: (expected + fee).toString(),
    recipient: bond.recipient,
    network: "SN_SEPOLIA",
    refundTxHash: bond.refundTxHash,
  };
}

export class BondError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BondError";
    this.status = status;
  }
}

/** Issue (or return the existing) quote for a session. */
export async function issueBondQuote(token: string, recipient: unknown): Promise<BondQuote> {
  if (!bondConfigured()) throw new BondError("The private bond is not configured on this server", 503);
  const record = await getCapability(token);
  if (!record) throw new BondError("Invalid or expired session", 401);
  const fee = await poolFeeFri();
  if (fee >= feeCapFri()) {
    throw new BondError(`The pool fee (${fee} fri) is above the configured cap; bonds are paused`, 503);
  }
  if (record.bondStatus === "quoted" || record.bondStatus === "confirmed") {
    return quoteFor(record, fee);
  }
  if (record.bondStatus !== "blocked") throw new BondError("This session cannot take a bond", 409);
  if (!isPoolAddress(recipient)) throw new BondError("A refund recipient address is required", 400);
  const expected = uniqueExpectedAmount((await takenAmounts()));
  const updated = await setBondState(token, "quoted", {
    expectedAmountFri: expected.toString(),
    recipient: recipient.toLowerCase(),
    quotedAt: Date.now(),
  });
  if (!updated) throw new BondError("Invalid or expired session", 401);
  return quoteFor(updated, fee);
}

/** Look for the treasury note that matches this session's exact amount. */
export async function checkBondPaid(token: string): Promise<BondQuote> {
  const record = await getCapability(token);
  if (!record) throw new BondError("Invalid or expired session", 401);
  const fee = await poolFeeFri();
  if (record.bondStatus === "confirmed") return quoteFor(record, fee);
  if (record.bondStatus !== "quoted" || !record.bond) throw new BondError("No bond quote on this session", 409);
  const ctx = await treasury();
  const base = await provingBlock(ctx.provider);
  const { notes } = await ctx.transfers.discoverNotes({ tokens: [BigInt(STRK_SEPOLIA)], blockIdentifier: base });
  const strkNotes = notes.get(STRK_SEPOLIA) || [];
  const expected = BigInt(record.bond.expectedAmountFri);
  const match = strkNotes.find((note) => BigInt(note.amount) === expected);
  if (!match) return quoteFor(record, fee);
  const updated = await setBondState(token, "confirmed", {
    ...record.bond,
    noteId: BigInt(match.id).toString(),
    confirmedAt: Date.now(),
  });
  if (!updated) throw new BondError("Invalid or expired session", 401);
  return quoteFor(updated, fee);
}

/** Private transfer of the bond back to the recipient the source chose. */
export async function refundBond(token: string): Promise<BondQuote> {
  const record = await getCapability(token);
  if (!record) throw new BondError("Invalid or expired session", 401);
  const fee = await poolFeeFri();
  if (record.bondStatus === "refunded") return quoteFor(record, fee);
  if (record.bondStatus !== "confirmed" || !record.bond) throw new BondError("No confirmed bond to refund", 409);
  const result = await refundToRecipient(record.bond.recipient, BigInt(record.bond.expectedAmountFri));
  const updated = await setBondState(token, "refunded", {
    ...record.bond,
    refundTxHash: result.transactionHash,
    refundedAt: Date.now(),
  });
  if (!updated) throw new BondError("Invalid or expired session", 401);
  return quoteFor(updated, fee);
}

async function refundToRecipient(recipient: string, amount: bigint) {
  const ctx = await treasury();
  const { SetupRequirement } = await import("@starkware-libs/starknet-privacy-sdk");
  const requirement = await ctx.transfers.discoverRequirement(recipient, STRK_SEPOLIA);
  if (requirement === SetupRequirement.Register) {
    throw new BondError("The refund recipient has not registered a viewing key in the pool", 409);
  }
  const base = await provingBlock(ctx.provider);
  const result = await ctx.transfers
    .build({
      autoDiscover: { notes: "refresh", channels: "refresh" },
      autoSetup: true,
      autoSelectNotes: "naive",
      provingBlockId: base,
    })
    .with(STRK_SEPOLIA, (t) => t.transfer({ recipient, amount }))
    .surplusTo(ctx.treasuryAddress)
    .execute();
  return submitExecuteResult(ctx, result);
}

/** Refund confirmed bonds whose session is about to expire; call opportunistically. */
export async function sweepExpiringBonds(now = Date.now()) {
  const refunded: string[] = [];
  for (const { key, record } of await listCapabilityRecords()) {
    if (record.bondStatus !== "confirmed" || !record.bond) continue;
    if (record.expiresAt - now > REFUND_BEFORE_EXPIRY_MS) continue;
    try {
      const result = await refundToRecipient(record.bond.recipient, BigInt(record.bond.expectedAmountFri));
      await updateCapabilityByKey(key, {
        bondStatus: "refunded",
        bond: { ...record.bond, refundTxHash: result.transactionHash, refundedAt: now },
      });
      refunded.push(result.transactionHash);
    } catch {
      // leave it for the next sweep; the note stays with the treasury
    }
  }
  return refunded;
}
