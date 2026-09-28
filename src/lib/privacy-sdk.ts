import { Account, RpcProvider, TransactionFinalityStatus, constants } from "starknet";
import type { ExecuteResult, PrivateTransfersInterface } from "@starkware-libs/starknet-privacy-sdk";

// Server-side wiring of the STRK20 privacy SDK for the bond treasury. The
// treasury holds its own keys; a source's wallet never touches this module.
// Only API routes and scripts import it. Never import it from a client
// component: it would try to bundle the SDK and the keys would not exist.
//
// Sepolia services (from the strk20-hackathon XENIA project, 2026-09-28):
//   PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io
//   INDEXER_URL=https://discovery-service.alpha-sepolia.sw-dev.io
// Pool v2.1: 0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91

export const BOND_ENV = [
  "STARKNET_SEPOLIA_RPC_URL",
  "NEXT_PUBLIC_STRK20_POOL_ADDRESS",
  "NEXT_PUBLIC_BOND_TREASURY_ADDRESS",
  "BOND_TREASURY_PRIVATE_KEY",
  "BOND_VIEWING_KEY",
  "PROVING_SERVICE_URL",
  "INDEXER_URL",
] as const;

export function missingBondEnv(): string[] {
  return BOND_ENV.filter((name) => !process.env[name]);
}

export function bondEnvConfigured() {
  return missingBondEnv().length === 0;
}

function required(name: (typeof BOND_ENV)[number]) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export interface TreasuryContext {
  provider: RpcProvider;
  account: Account;
  transfers: PrivateTransfersInterface;
  poolAddress: string;
  treasuryAddress: string;
}

let cached: Promise<TreasuryContext> | null = null;

export function treasury(): Promise<TreasuryContext> {
  if (!cached) {
    cached = (async () => {
      const chain = process.env.NEXT_PUBLIC_STARKNET_CHAIN_ID || "SN_SEPOLIA";
      if (chain !== "SN_SEPOLIA") throw new Error("The bond treasury only runs on Sepolia");
      const { createPrivateTransfers } = await import("@starkware-libs/starknet-privacy-sdk");
      const provider = new RpcProvider({ nodeUrl: required("STARKNET_SEPOLIA_RPC_URL") });
      const account = new Account({
        provider,
        address: required("NEXT_PUBLIC_BOND_TREASURY_ADDRESS"),
        signer: required("BOND_TREASURY_PRIVATE_KEY"),
        cairoVersion: "1",
      });
      const viewingKey = BigInt(required("BOND_VIEWING_KEY"));
      const poolAddress = required("NEXT_PUBLIC_STRK20_POOL_ADDRESS");
      const transfers = createPrivateTransfers({
        // The project pins starknet 10.4.0 while the SDK bundles 10.5.0; the
        // Account shape is structurally the same, so the cast is safe.
        account: account as never,
        viewingKeyProvider: { getViewingKey: async () => viewingKey },
        provingProvider: { url: required("PROVING_SERVICE_URL"), chainId: constants.StarknetChainId.SN_SEPOLIA },
        discoveryProvider: { url: required("INDEXER_URL") },
        poolContractAddress: poolAddress,
      });
      return { provider, account, transfers, poolAddress, treasuryAddress: account.address };
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export function resetTreasuryForTests() {
  cached = null;
}

/** Proving base per the SDK README: ten blocks behind the head. */
export async function provingBlock(provider: RpcProvider) {
  return (await provider.getBlockNumber()) - 10;
}

/**
 * Submission tail from the strk20-privacy-sdk skill: omit the proof keys when
 * there are no proof facts, always pass tip 0n, invalidate the cached pool
 * nonce on failure, and wait for L2 acceptance.
 */
export async function submitExecuteResult(ctx: TreasuryContext, result: ExecuteResult) {
  const { callAndProof } = result;
  const proofDetails = callAndProof.proof.proofFacts?.length
    ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data }
    : {};
  let tx;
  try {
    tx = await ctx.account.execute(callAndProof.call as never, { tip: 0n, ...(proofDetails as object) });
  } catch (error) {
    ctx.transfers.invalidateProofNonceCache?.();
    throw error;
  }
  const receipt = await ctx.provider.waitForTransaction(tx.transaction_hash, {
    successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2, TransactionFinalityStatus.ACCEPTED_ON_L1],
  });
  if (!receipt.isSuccess()) throw new Error("The pool transaction was not accepted");
  const blockNumber = (receipt as unknown as { block_number?: number }).block_number;
  return { transactionHash: tx.transaction_hash, blockNumber };
}
