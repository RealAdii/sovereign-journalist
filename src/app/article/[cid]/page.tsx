import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import ArticleBody from "./ArticleBody";

const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

async function getArticle(cid: string) {
  try {
    const res = await fetch(`${PINATA_GATEWAY}/ipfs/${cid}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ArticlePage({
  params,
}: {
  params: { cid: string };
}) {
  const data = await getArticle(params.cid);
  if (!data) notFound();

  // Support both nested (IPFSArticle) and legacy flat format
  const article = data.article || data;
  const verification = data.verification || {};
  const metadata = data.metadata || {};
  const title = article.title || data.title;
  const subtitle = article.subtitle || data.summary || "";
  const body = article.body || data.body;
  const confidence = article.confidence ?? data.confidenceScore ?? 0;
  const confidenceReason = article.confidenceReason || "";
  const tags = metadata.tags || data.tags || [];
  const publishedAt = data.publishedAt || "";
  const proofHash = verification.proofHash || data.interviewHash || "";
  const sourceCredential = verification.sourceCredential || "";
  const verificationMethod = verification.verificationMethod || "zkTLS (Reclaim Protocol)";

  const confidenceColor =
    confidence >= 70
      ? "text-neon-green"
      : confidence >= 40
        ? "text-warning"
        : "text-error";

  return (
    <>
      <Header />
      <main className="min-h-screen pt-14">
        <article className="max-w-3xl mx-auto px-6 py-12">
          {/* Breadcrumb */}
          <div className="font-mono text-[11px] text-text-muted mb-6">
            <Link href="/" className="hover:text-text-secondary no-underline">
              feed
            </Link>
            <span className="mx-2">/</span>
            <span className="text-text-secondary">article</span>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary leading-tight mb-4">
            {title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            {sourceCredential && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono bg-neon-green/10 text-neon-green border border-neon-green/20">
                <span className="w-1.5 h-1.5 rounded-full bg-neon-green shadow-[0_0_6px_#00FF88]" />
                {sourceCredential}
              </span>
            )}
            <span className={`font-mono text-xs ${confidenceColor}`}>
              confidence: {confidence}%
            </span>
            {publishedAt && (
              <span className="font-mono text-xs text-text-muted">
                {new Date(publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-text-secondary italic border-l-2 border-neon-green/30 pl-4 mb-8">
              {subtitle}
            </p>
          )}

          {/* Body */}
          <div className="prose prose-sm max-w-none mb-8">
            <ArticleBody content={body} />
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Verification info */}
          <div className="card border-neon-green/10">
            <div className="font-mono text-[11px] text-text-muted uppercase tracking-wider mb-3">
              verification details
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Source Identity</span>
                <span className="text-neon-green font-mono font-bold">
                  Unknown (by design)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Verification Method</span>
                <span className="text-text-secondary font-mono">
                  {verificationMethod}
                </span>
              </div>
              {sourceCredential && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Source Credential</span>
                  <span className="text-text-secondary font-mono">
                    {sourceCredential}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">IPFS CID</span>
                <a
                  href={`${PINATA_GATEWAY}/ipfs/${params.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neon-cyan font-mono hover:underline"
                >
                  {params.cid.slice(0, 20)}...
                </a>
              </div>
              {proofHash && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Proof Hash</span>
                  <span className="text-text-secondary font-mono">
                    {proofHash}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Confidence</span>
                <span className={`font-mono font-bold ${confidenceColor}`}>
                  {confidence}%
                </span>
              </div>
              {confidenceReason && (
                <div className="pt-2 border-t border-border">
                  <span className="text-text-muted block mb-1">Confidence Reasoning</span>
                  <p className="text-text-secondary text-xs leading-relaxed">
                    {confidenceReason}
                  </p>
                </div>
              )}
              {metadata.agentModel && (
                <div className="flex justify-between">
                  <span className="text-text-muted">AI Model</span>
                  <span className="text-text-secondary font-mono">
                    {metadata.agentModel}
                  </span>
                </div>
              )}
              {metadata.interviewTurns && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Interview Turns</span>
                  <span className="text-text-secondary font-mono">
                    {metadata.interviewTurns}
                  </span>
                </div>
              )}
            </div>
          </div>
        </article>
      </main>
    </>
  );
}
