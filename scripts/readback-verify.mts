// Independent read-back proof: rebuilds an article from Starknet Sepolia using
// only the RPC and the registry address. No server, no database, no IPFS.
// Usage: node --experimental-strip-types scripts/readback-verify.mts <articleId> [expected.json]
import fs from "fs";
import { assertSepolia, rpc, rpcUrl } from "./env.mts";
import { getArticle, listArticles } from "../src/lib/onchain.ts";

const [articleId, expectedPath] = process.argv.slice(2);
process.env.STARKNET_SEPOLIA_RPC_URL ||= rpcUrl();
if (!process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS) {
  console.error("NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS is required");
  process.exit(2);
}
await assertSepolia(rpc());

if (!articleId) {
  const feed = await listArticles(50);
  console.log(JSON.stringify({ rpc: rpcUrl(), count: feed.length, feed }, null, 2));
  process.exit(0);
}

const article = await getArticle(articleId);
const output = { rpc: rpcUrl(), registry: process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS, article };
if (expectedPath) {
  const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
  const same = ["title", "subtitle", "body"].every((k) => expected[k] === (article as never)[k]);
  console.log(JSON.stringify({ ...output, byteForByteMatch: same }, null, 2));
  process.exit(same ? 0 : 1);
}
console.log(JSON.stringify(output, null, 2));
