// Declare and deploy the article registry on Sepolia. Needs a funded publisher
// account. Writes deployments/sepolia.json. Never touches mainnet.
import fs from "fs";
import path from "path";
import { assertSepolia, publisher, rpc, rpcUrl } from "./env.mts";

const provider = rpc();
await assertSepolia(provider);
const account = publisher(provider);

const target = path.resolve("contracts/target/dev");
const sierra = JSON.parse(fs.readFileSync(path.join(target, "article_registry_ArticleRegistry.contract_class.json"), "utf8"));
const casm = JSON.parse(fs.readFileSync(path.join(target, "article_registry_ArticleRegistry.compiled_contract_class.json"), "utf8"));

console.log(`Deploying ArticleRegistry from ${account.address} via ${rpcUrl()}`);
const started = Date.now();
const declared = await account.declareIfNot({ contract: sierra, casm });
if (declared.transaction_hash) {
  console.log(`declare tx ${declared.transaction_hash}`);
  await provider.waitForTransaction(declared.transaction_hash);
}
console.log(`class hash ${declared.class_hash}`);

const deployed = await account.deployContract({
  classHash: declared.class_hash,
  constructorCalldata: [account.address],
});
console.log(`deploy tx ${deployed.transaction_hash}`);
const receipt = await provider.waitForTransaction(deployed.transaction_hash);
if (!receipt.isSuccess()) {
  console.error("Deployment transaction was not successful");
  process.exit(1);
}

const record = {
  network: "SN_SEPOLIA",
  rpc: rpcUrl(),
  classHash: declared.class_hash,
  declareTransaction: declared.transaction_hash || "already declared",
  address: deployed.contract_address,
  deployTransaction: deployed.transaction_hash,
  publisher: account.address,
  deployedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
};
fs.mkdirSync("deployments", { recursive: true });
fs.writeFileSync("deployments/sepolia.json", JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
console.log(`\nSet NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS=${deployed.contract_address}`);
