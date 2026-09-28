// Read-only compatibility check. Works with no secrets against a public RPC.
// Prints what is verifiable today and names every missing piece.
import { assertSepolia, rpc, rpcUrl, STRK_SEPOLIA, short } from "./env.mts";

const provider = rpc();
const report: Record<string, unknown> = { rpc: rpcUrl(), checkedAt: new Date().toISOString() };

async function classHash(label: string, address?: string) {
  if (!address) return { label, status: "not configured" };
  try {
    const hash = await provider.getClassHashAt(address, "latest");
    return { label, address, classHash: hash, status: "deployed" };
  } catch (error) {
    return { label, address, status: "not found", error: (error as Error).message.slice(0, 120) };
  }
}

report.chainId = await assertSepolia(provider);
report.specVersion = await provider.getSpecVersion();
report.blockNumber = await provider.getBlockNumber();
report.strkToken = await classHash("STRK token", STRK_SEPOLIA);
report.strk20Pool = await classHash("STRK20 privacy pool", process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS);
report.articleRegistry = await classHash("Article registry", process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS);
report.tipInbox = await classHash("Tip inbox helper", process.env.NEXT_PUBLIC_TIP_INBOX_ADDRESS);

if (process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS && (report.strk20Pool as { status: string }).status === "deployed") {
  try {
    const fee = await provider.callContract({ contractAddress: process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS, entrypoint: "get_fee_amount", calldata: [] }, "latest");
    report.strk20PoolFee = fee;
  } catch (error) {
    report.strk20PoolFee = `get_fee_amount call failed: ${(error as Error).message.slice(0, 100)}`;
  }
}

if (process.env.STARKNET_PUBLISHER_ADDRESS) {
  const address = process.env.STARKNET_PUBLISHER_ADDRESS;
  const account = await classHash("Publisher account", address);
  let balance: string | undefined;
  try {
    const result = await provider.callContract({ contractAddress: STRK_SEPOLIA, entrypoint: "balanceOf", calldata: [address] }, "latest");
    balance = (BigInt(result[0]) + (BigInt(result[1] || 0) << 128n)).toString();
  } catch {
    balance = undefined;
  }
  report.publisher = { ...account, address: short(address), strkBalanceFri: balance };
  if (process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS && (report.articleRegistry as { status: string }).status === "deployed") {
    const [onchainPublisher] = await provider.callContract({ contractAddress: process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS, entrypoint: "get_publisher", calldata: [] }, "latest");
    report.registryPublisherMatches = BigInt(onchainPublisher) === BigInt(address);
  }
} else {
  report.publisher = { status: "STARKNET_PUBLISHER_ADDRESS not set; deployment and publishing are blocked" };
}

report.blockers = [
  !process.env.STARKNET_SEPOLIA_RPC_URL && "STARKNET_SEPOLIA_RPC_URL unset (using a public RPC for this read-only check)",
  !process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS && "Article registry not deployed: run scripts/deploy-sepolia.mts",
  !process.env.STARKNET_PUBLISHER_PRIVATE_KEY && "No publisher key: deployment, fee benchmark, and publishing cannot run",
  !process.env.RECLAIM_APP_ID && "Reclaim app credentials unset: live proof verification cannot run",
  !process.env.GEMINI_API_KEY && "GEMINI_API_KEY unset: interview cannot run",
  "Anonymous bond: no verified private receipt path (see docs/COMPATIBILITY.md)",
  "Encrypted tips: pool invoke path not proven end to end (see docs/COMPATIBILITY.md)",
].filter(Boolean);

console.log(JSON.stringify(report, null, 2));
