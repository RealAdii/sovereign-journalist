import crypto from "crypto";
import { Account, RpcProvider, TransactionFinalityStatus, units, type Call } from "starknet";
import type {
  ArticleDraft,
  OnchainArticle,
  PublishedArticleSummary,
  PublishEstimate,
} from "./types";

// Product limits. Title and subtitle mirror the Cairo constants. The body limit
// is below the contract's 24576-byte hard cap: the 2026-09-28 Sepolia benchmark
// measured about 0.36 STRK per KB and 20 s to confirm a 22 KB article, so 16 KB
// keeps a publication under roughly 6 STRK and 20 s (docs/benchmarks/).
export const ARTICLE_LIMITS = { title: 180, subtitle: 420, body: 16384 } as const;
export const CONTRACT_BODY_CAP = 24576;
export const CHUNK_BYTES = 31;
export const PAGE_CHUNKS = 128;
const SECTION = { title: 0, subtitle: 1, body: 2 } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function assertSepolia() {
  const chain = process.env.NEXT_PUBLIC_STARKNET_CHAIN_ID || "SN_SEPOLIA";
  const network = process.env.NEXT_PUBLIC_STARKNET_NETWORK || "sepolia";
  if (chain !== "SN_SEPOLIA" || network !== "sepolia") {
    throw new Error("Only Starknet Sepolia is supported by this build");
  }
}

export function explorerUrl(kind: "tx" | "contract", hash: string) {
  const base = process.env.NEXT_PUBLIC_STARKNET_EXPLORER || "https://sepolia.voyager.online";
  return `${base}/${kind}/${hash}`;
}

export function normalizeArticle(article: ArticleDraft): ArticleDraft {
  return {
    version: 1,
    title: String(article.title ?? "").normalize("NFC").trim(),
    subtitle: String(article.subtitle ?? "").normalize("NFC").trim(),
    body: String(article.body ?? "").normalize("NFC").trim(),
    sourceStatus: "credential-proven",
    allegationStatus: "reported",
  };
}

export function canonicalArticle(article: ArticleDraft) {
  const normalized = normalizeArticle(article);
  return JSON.stringify({
    version: 1,
    title: normalized.title,
    subtitle: normalized.subtitle,
    body: normalized.body,
    sourceStatus: normalized.sourceStatus,
    allegationStatus: normalized.allegationStatus,
  });
}

export function byteLength(value: string) {
  return encoder.encode(value.normalize("NFC")).length;
}

// No parameter properties: Node's strip-only TypeScript mode (used by scripts/) rejects them.
export class ArticleValidationError extends Error {
  readonly field: "title" | "subtitle" | "body";
  readonly size: number;
  readonly max: number;

  constructor(message: string, field: "title" | "subtitle" | "body", size: number, max: number) {
    super(message);
    this.name = "ArticleValidationError";
    this.field = field;
    this.size = size;
    this.max = max;
  }
}

export function validateArticle(input: ArticleDraft) {
  const article = normalizeArticle(input);
  const fields = [
    ["title", article.title, ARTICLE_LIMITS.title],
    ["subtitle", article.subtitle, ARTICLE_LIMITS.subtitle],
    ["body", article.body, ARTICLE_LIMITS.body],
  ] as const;
  for (const [name, value, max] of fields) {
    const size = byteLength(value);
    if ((name === "title" || name === "body") && size === 0) {
      throw new ArticleValidationError(`The ${name} is required`, name, size, max);
    }
    if (size > max) {
      throw new ArticleValidationError(
        `The ${name} is ${size} bytes of UTF-8. The onchain limit is ${max} bytes. Shorten it by at least ${size - max} bytes.`,
        name,
        size,
        max,
      );
    }
  }
  return article;
}

export function articleDigest(article: ArticleDraft) {
  validateArticle(article);
  const digest = crypto.createHash("sha256").update(canonicalArticle(article)).digest();
  // 31 bytes keeps the value inside the felt252 field without modular reduction.
  return `0x${digest.subarray(0, 31).toString("hex")}`;
}

export function encodeText(value: string) {
  const bytes = encoder.encode(value.normalize("NFC"));
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    chunks.push(`0x${Buffer.from(bytes.slice(offset, offset + CHUNK_BYTES)).toString("hex")}`);
  }
  return { byteLength: bytes.length, chunks };
}

export function expectedChunkCount(bytes: number) {
  return bytes === 0 ? 0 : Math.floor((bytes + CHUNK_BYTES - 1) / CHUNK_BYTES);
}

export function decodeText(chunks: string[], totalBytes: number) {
  if (chunks.length !== expectedChunkCount(totalBytes)) {
    throw new Error("Chunk count does not match the declared byte length");
  }
  const bytes = Buffer.alloc(totalBytes);
  let written = 0;
  chunks.forEach((chunk, index) => {
    const expected = Math.min(CHUNK_BYTES, totalBytes - index * CHUNK_BYTES);
    // Leading zero bytes are lost in the felt representation, so pad to width.
    const hex = BigInt(chunk).toString(16).padStart(expected * 2, "0");
    if (hex.length !== expected * 2) throw new Error("Chunk is wider than declared");
    Buffer.from(hex, "hex").copy(bytes, written);
    written += expected;
  });
  return decoder.decode(bytes);
}

export function publishCalldata(input: ArticleDraft, digest = articleDigest(input)) {
  const article = normalizeArticle(input);
  const title = encodeText(article.title);
  const subtitle = encodeText(article.subtitle);
  const body = encodeText(article.body);
  const calldata: string[] = [
    digest,
    digest,
    title.byteLength.toString(),
    title.chunks.length.toString(),
    ...title.chunks,
    subtitle.byteLength.toString(),
    subtitle.chunks.length.toString(),
    ...subtitle.chunks,
    body.byteLength.toString(),
    body.chunks.length.toString(),
    ...body.chunks,
  ];
  return {
    calldata,
    byteLengths: {
      title: title.byteLength,
      subtitle: subtitle.byteLength,
      body: body.byteLength,
    },
  };
}

function publishCall(article: ArticleDraft, digest: string): { call: Call; calldata: string[]; byteLengths: PublishEstimate["byteLengths"] } {
  const { calldata, byteLengths } = publishCalldata(article, digest);
  return {
    call: {
      contractAddress: required("NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS"),
      entrypoint: "publish_article",
      calldata,
    },
    calldata,
    byteLengths,
  };
}

export function provider() {
  assertSepolia();
  return new RpcProvider({ nodeUrl: required("STARKNET_SEPOLIA_RPC_URL") });
}

function publisherAccount() {
  const rpc = provider();
  const account = new Account({
    provider: rpc,
    address: required("STARKNET_PUBLISHER_ADDRESS"),
    signer: required("STARKNET_PUBLISHER_PRIVATE_KEY"),
  });
  return { rpc, account };
}

export function registryConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS && process.env.STARKNET_SEPOLIA_RPC_URL,
  );
}

export function publisherConfigured() {
  return Boolean(
    registryConfigured() &&
      process.env.STARKNET_PUBLISHER_ADDRESS &&
      process.env.STARKNET_PUBLISHER_PRIVATE_KEY,
  );
}

export async function estimatePublication(article: ArticleDraft): Promise<PublishEstimate> {
  const digest = articleDigest(article);
  const { call, calldata, byteLengths } = publishCall(article, digest);
  const estimate = await publisherAccount().account.estimateInvokeFee(call);
  return {
    articleId: digest,
    approvedDigest: digest,
    feeFri: estimate.overall_fee.toString(),
    feeStrk: units(estimate.overall_fee, "fri"),
    calldataFelts: calldata.length,
    byteLengths,
    network: "SN_SEPOLIA",
  };
}

export async function publishArticle(article: ArticleDraft, approvedDigest: string) {
  const digest = articleDigest(article);
  if (digest.toLowerCase() !== approvedDigest.toLowerCase()) {
    throw new Error("Article changed after the fee estimate. Review the updated preview again.");
  }
  const { rpc, account } = publisherAccount();
  const { call } = publishCall(article, digest);
  const response = await account.execute(call);
  const receipt = await rpc.waitForTransaction(response.transaction_hash, {
    successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2, TransactionFinalityStatus.ACCEPTED_ON_L1],
  });
  if (!receipt.isSuccess()) {
    throw new Error("Sepolia rejected the publication transaction");
  }
  const normalized = normalizeArticle(article);
  const readBack = await getArticle(digest);
  if (
    readBack.title !== normalized.title ||
    readBack.subtitle !== normalized.subtitle ||
    readBack.body !== normalized.body
  ) {
    throw new Error("Onchain read-back did not match the approved article");
  }
  return {
    articleId: digest,
    transactionHash: response.transaction_hash,
    readBackMatched: true as const,
    explorerUrl: explorerUrl("tx", response.transaction_hash),
  };
}

async function callRegistry(entrypoint: string, calldata: string[]) {
  return provider().callContract(
    {
      contractAddress: required("NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS"),
      entrypoint,
      calldata,
    },
    "latest",
  );
}

async function readChunks(articleId: string, section: number, total: number) {
  const chunks: string[] = [];
  for (let offset = 0; offset < total; offset += PAGE_CHUNKS) {
    const result = await callRegistry("get_article_chunks", [
      articleId,
      section.toString(),
      offset.toString(),
      Math.min(PAGE_CHUNKS, total - offset).toString(),
    ]);
    const declared = Number(BigInt(result[0] || "0x0"));
    chunks.push(...result.slice(1, declared + 1));
  }
  return chunks;
}

export function parseMeta(meta: string[]) {
  if (meta.length < 10) throw new Error("Article metadata response was incomplete");
  const num = (value: string) => Number(BigInt(value));
  return {
    exists: BigInt(meta[0]) === 1n,
    approvedDigest: meta[1],
    publishedAt: num(meta[2]),
    titleByteLength: num(meta[3]),
    titleChunks: num(meta[4]),
    subtitleByteLength: num(meta[5]),
    subtitleChunks: num(meta[6]),
    bodyByteLength: num(meta[7]),
    bodyChunks: num(meta[8]),
    version: num(meta[9]),
  };
}

export async function getArticle(articleId: string): Promise<OnchainArticle> {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(articleId)) throw new Error("Invalid article id");
  const meta = parseMeta(await callRegistry("get_article_meta", [articleId]));
  const [title, subtitle, body] = await Promise.all([
    readChunks(articleId, SECTION.title, meta.titleChunks),
    readChunks(articleId, SECTION.subtitle, meta.subtitleChunks),
    readChunks(articleId, SECTION.body, meta.bodyChunks),
  ]);
  return {
    version: 1,
    articleId,
    approvedDigest: meta.approvedDigest,
    publishedAt: meta.publishedAt,
    title: decodeText(title, meta.titleByteLength),
    subtitle: decodeText(subtitle, meta.subtitleByteLength),
    body: decodeText(body, meta.bodyByteLength),
    byteLengths: {
      title: meta.titleByteLength,
      subtitle: meta.subtitleByteLength,
      body: meta.bodyByteLength,
    },
    sourceStatus: "credential-proven",
    allegationStatus: "reported",
  };
}

export async function listArticles(limit = 20): Promise<PublishedArticleSummary[]> {
  if (!registryConfigured()) return [];
  const countResult = await callRegistry("get_article_count", []);
  const count = Number(BigInt(countResult[0] || "0x0"));
  const start = Math.max(0, count - Math.min(limit, 50));
  const ids = await Promise.all(
    Array.from({ length: count - start }, (_, index) =>
      callRegistry("get_article_id", [(start + index).toString()]).then((result) => result[0]),
    ),
  );
  const articles = await Promise.all(ids.reverse().map((id) => getArticle(id)));
  return articles.map(({ articleId, title, subtitle, publishedAt }) => ({
    articleId,
    title,
    subtitle,
    publishedAt,
  }));
}
