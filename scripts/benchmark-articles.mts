// Publishes three fixture articles (short, typical, long) to the Sepolia
// registry, measuring estimated fee, actual fee, confirmation latency, and
// read-back latency. Needs a funded publisher. Costs real Sepolia STRK.
import fs from "fs";
import { units } from "starknet";
import { assertSepolia, publisher, rpc, rpcUrl } from "./env.mts";
import { articleDigest, getArticle, publishCalldata } from "../src/lib/onchain.ts";
import type { ArticleDraft } from "../src/lib/types.ts";

const provider = rpc();
await assertSepolia(provider);
const account = publisher(provider);
const registry = process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS;
if (!registry) {
  console.error("NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS is not set. Run scripts/deploy-sepolia.mts first.");
  process.exit(2);
}
process.env.STARKNET_SEPOLIA_RPC_URL ||= rpcUrl();

const stamp = Date.now();
const paragraph = "Employees at the vendor described a procurement process in which invoices were approved before the goods were inspected. The source said this happened on several occasions in the last quarter and that a written complaint was ignored. These statements are the source's account and have not been independently corroborated. ";
function fixture(name: string, repeats: number): ArticleDraft {
  return {
    version: 1,
    title: `Benchmark ${name} article ${stamp}`,
    subtitle: "This is a test publication used to measure Sepolia fees and latency. It is not a real report.",
    body: `## What has been proven\n\nThe source proved a credential. Nothing else is proven.\n\n## Account\n\n${paragraph.repeat(repeats)}\n\n## What has not been independently corroborated\n\nEverything above.`,
    sourceStatus: "credential-proven",
    allegationStatus: "reported",
  };
}
const fixtures = [
  ["short", fixture("short", 1)],
  ["typical", fixture("typical", 12)],
  ["long", fixture("long", 68)],
] as const;

const results = [];
for (const [name, article] of fixtures) {
  const digest = articleDigest(article);
  const { calldata, byteLengths } = publishCalldata(article, digest);
  const call = { contractAddress: registry, entrypoint: "publish_article", calldata };
  const estimate = await account.estimateInvokeFee(call);
  const t0 = Date.now();
  const tx = await account.execute(call);
  const receipt = await provider.waitForTransaction(tx.transaction_hash, { successStates: ["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"] as never });
  const confirmedMs = Date.now() - t0;
  const actualFee = receipt.isSuccess() ? (receipt as unknown as { actual_fee: { amount: string } }).actual_fee?.amount : undefined;
  const r0 = Date.now();
  const readBack = await getArticle(digest);
  const readMs = Date.now() - r0;
  const matched = readBack.title === article.title && readBack.subtitle === article.subtitle && readBack.body === article.body;
  const row = {
    name,
    bytes: byteLengths,
    totalBytes: byteLengths.title + byteLengths.subtitle + byteLengths.body,
    calldataFelts: calldata.length,
    estimatedFeeFri: estimate.overall_fee.toString(),
    estimatedFeeStrk: units(estimate.overall_fee, "fri"),
    actualFeeFri: actualFee ? BigInt(actualFee).toString() : undefined,
    actualFeeStrk: actualFee ? units(BigInt(actualFee), "fri") : undefined,
    confirmationMs: confirmedMs,
    readBackMs: readMs,
    readBackMatched: matched,
    articleId: digest,
    transactionHash: tx.transaction_hash,
  };
  console.log(JSON.stringify(row));
  results.push(row);
}
fs.mkdirSync("docs/benchmarks", { recursive: true });
const file = `docs/benchmarks/sepolia-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(file, JSON.stringify({ rpc: rpcUrl(), registry, results }, null, 2));
console.log(`wrote ${file}`);
