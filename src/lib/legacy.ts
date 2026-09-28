// Read-only support for articles published by the previous IPFS version.
// New publications never touch IPFS.
export const LEGACY_GATEWAY = process.env.LEGACY_IPFS_GATEWAY || "https://gateway.pinata.cloud";

export function isLegacyCid(id: string) {
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})$/.test(id);
}

export async function fetchLegacyArticle(cid: string) {
  if (!isLegacyCid(cid)) return null;
  try {
    const res = await fetch(`${LEGACY_GATEWAY}/ipfs/${cid}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    const article = data.article || data;
    const title = String(article.title || data.title || "");
    const body = String(article.body || data.body || "");
    if (!title || !body) return null;
    return { title, subtitle: String(article.subtitle || data.summary || ""), body };
  } catch {
    return null;
  }
}
