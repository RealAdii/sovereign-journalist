import type { IPFSArticle, PublishedArticle } from "./types";

const PINATA_API_KEY = process.env.PINATA_API_KEY!;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY!;
const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

export async function pinArticle(article: IPFSArticle): Promise<string> {
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: JSON.stringify({
      pinataContent: article,
      pinataMetadata: {
        name: `sj-${article.verification.proofHash}`,
        keyvalues: {
          app: "sovereign-journalist",
          title: article.article.title.slice(0, 200),
          publishedAt: article.publishedAt,
          confidenceScore: String(article.article.confidence),
        },
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Pinata pin error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  return data.IpfsHash;
}

export async function fetchArticle(cid: string): Promise<IPFSArticle> {
  const res = await fetch(`${PINATA_GATEWAY}/ipfs/${cid}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch article ${cid}: ${res.status}`);
  }

  return res.json();
}

export async function listArticles(): Promise<PublishedArticle[]> {
  const params = new URLSearchParams({
    status: "pinned",
    "metadata[keyvalues][app]": JSON.stringify({
      value: "sovereign-journalist",
      op: "eq",
    }),
    pageLimit: "20",
  });

  const res = await fetch(
    `https://api.pinata.cloud/data/pinList?${params.toString()}`,
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) {
    console.error("Pinata list error:", res.status);
    return [];
  }

  const data = await res.json();

  return (data.rows || []).map(
    (row: {
      ipfs_pin_hash: string;
      metadata?: {
        keyvalues?: {
          title?: string;
          publishedAt?: string;
          confidenceScore?: string;
        };
      };
      date_pinned: string;
    }) => ({
      cid: row.ipfs_pin_hash,
      title: row.metadata?.keyvalues?.title || "Untitled",
      subtitle: "",
      confidenceScore: Number(row.metadata?.keyvalues?.confidenceScore) || 0,
      tags: [],
      publishedAt:
        row.metadata?.keyvalues?.publishedAt || row.date_pinned,
    })
  );
}
