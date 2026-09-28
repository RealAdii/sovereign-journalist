// One-time treasury setup for the private bond. Needs, in .env.local:
//   STARKNET_SEPOLIA_RPC_URL, NEXT_PUBLIC_STRK20_POOL_ADDRESS,
//   NEXT_PUBLIC_BOND_TREASURY_ADDRESS, BOND_TREASURY_PRIVATE_KEY,
//   BOND_VIEWING_KEY (decimal or hex bigint in [1, MAX_VIEWING_KEY]),
//   PROVING_SERVICE_URL, INDEXER_URL
// Steps: check the account is deployed and funded, register the viewing key in
// the pool if it is not, optionally shield STRK for refund liquidity.
//   node --experimental-strip-types --env-file-if-exists=.env.local scripts/bond-setup.mts [--shield <strk>]
import { constants } from "starknet";
import { assertSepolia, rpc, rpcUrl, STRK_SEPOLIA, short } from "./env.mts";
import { missingBondEnv, provingBlock, submitExecuteResult, treasury } from "../src/lib/privacy-sdk.ts";

const missing = missingBondEnv();
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(2);
}
const shieldArg = process.argv.indexOf("--shield");
const shieldStrk = shieldArg > -1 ? Number(process.argv[shieldArg + 1]) : 0;

const provider = rpc();
await assertSepolia(provider);
const address = process.env.NEXT_PUBLIC_BOND_TREASURY_ADDRESS!;
const pool = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS!;
const report: Record<string, unknown> = { rpc: rpcUrl(), treasury: short(address), pool };

try {
  report.accountClassHash = await provider.getClassHashAt(address, "latest");
} catch {
  console.error("The treasury account is not deployed on Sepolia. Send it some STRK and make one transaction from the wallet, or deploy it, then rerun.");
  process.exit(3);
}
const balance = await provider.callContract({ contractAddress: STRK_SEPOLIA, entrypoint: "balanceOf", calldata: [address] }, "latest");
const strkFri = BigInt(balance[0]) + (BigInt(balance[1] || 0) << 128n);
report.publicStrk = Number(strkFri) / 1e18;
if (strkFri === 0n) {
  console.error("The treasury holds no STRK. Fund it from the Sepolia faucet before registering (registration and refunds pay the pool fee).");
  process.exit(4);
}

const [publicKey] = await provider.callContract({ contractAddress: pool, entrypoint: "get_public_key", calldata: [address] }, "latest");
const fee = await provider.callContract({ contractAddress: pool, entrypoint: "get_fee_amount", calldata: [] }, "latest");
report.poolFeeStrk = Number(BigInt(fee[0])) / 1e18;
report.registered = BigInt(publicKey) !== 0n;

const ctx = await treasury();
const { MAX_VIEWING_KEY } = await import("@starkware-libs/starknet-privacy-sdk");
const viewingKey = BigInt(process.env.BOND_VIEWING_KEY!);
if (viewingKey < 1n || viewingKey > MAX_VIEWING_KEY) {
  console.error(`BOND_VIEWING_KEY must be in [1, ${MAX_VIEWING_KEY}]`);
  process.exit(5);
}

if (!report.registered) {
  console.log("Registering the treasury viewing key in the pool...");
  const base = await provingBlock(ctx.provider);
  const result = await ctx.transfers.build({ provingBlockId: base }).register().execute();
  const submitted = await submitExecuteResult(ctx, result);
  report.registerTx = submitted.transactionHash;
  report.registered = true;
  console.log(`registered in tx ${submitted.transactionHash} (block ${submitted.blockNumber})`);
}

if (shieldStrk > 0) {
  const amount = BigInt(Math.round(shieldStrk * 1e6)) * 10n ** 12n;
  console.log(`Shielding ${shieldStrk} STRK for refund liquidity (approve, then deposit)...`);
  // ERC-20 approve must land before the private deposit proof is built.
  const approve = await ctx.account.execute({
    contractAddress: STRK_SEPOLIA,
    entrypoint: "approve",
    calldata: [pool, amount.toString(), "0"],
  });
  await ctx.provider.waitForTransaction(approve.transaction_hash);
  let head = await ctx.provider.getBlockNumber();
  const approveBlock = (await ctx.provider.getTransactionReceipt(approve.transaction_hash) as unknown as { block_number?: number }).block_number || head;
  while (head - 10 <= approveBlock) {
    await new Promise((r) => setTimeout(r, 4000));
    head = await ctx.provider.getBlockNumber();
  }
  const result = await ctx.transfers
    .build({ provingBlockId: head - 10, autoDiscover: { notes: "refresh", channels: "refresh" } })
    .with(STRK_SEPOLIA, (t) => t.deposit({ amount }))
    .surplusTo(ctx.treasuryAddress)
    .execute();
  const submitted = await submitExecuteResult(ctx, result);
  report.shieldTx = submitted.transactionHash;
  console.log(`shielded in tx ${submitted.transactionHash}`);
}

report.chainId = constants.StarknetChainId.SN_SEPOLIA;
console.log(JSON.stringify(report, null, 2));
