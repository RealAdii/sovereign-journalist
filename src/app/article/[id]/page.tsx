import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Notice from "@/components/Notice";
import ArticleBody from "./ArticleBody";
import { explorerUrl, getArticle, registryConfigured } from "@/lib/onchain";
import { fetchLegacyArticle, isLegacyCid, LEGACY_GATEWAY } from "@/lib/legacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Article | Sovereign Journalist" };

export default async function ArticlePage({ params }: { params: { id: string } }) {
  if (isLegacyCid(params.id)) {
    const legacy = await fetchLegacyArticle(params.id);
    if (!legacy) notFound();
    return (
      <>
        <Header />
        <main className="min-h-screen pt-14">
          <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <Notice tone="warn" title="legacy article">
              This article predates the Starknet registry and is read from a public IPFS gateway. New
              articles are not published this way. The confidence score the old version carried was an
              AI estimate, not fact checking, and is not shown.
            </Notice>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary leading-tight mt-8 mb-4">{legacy.title}</h1>
            {legacy.subtitle && <p className="text-text-secondary italic border-l-2 border-neon-green/30 pl-4 mb-8">{legacy.subtitle}</p>}
            <div className="prose prose-sm max-w-none mb-8"><ArticleBody content={legacy.body} /></div>
            <p className="font-mono text-[11px] text-text-muted">
              source: <a className="text-neon-cyan" href={`${LEGACY_GATEWAY}/ipfs/${params.id}`} target="_blank" rel="noopener noreferrer">ipfs/{params.id}</a>
            </p>
          </article>
        </main>
      </>
    );
  }

  if (!registryConfigured()) notFound();
  const article = await getArticle(params.id).catch(() => null);
  if (!article) notFound();
  const registry = process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS!;

  return (
    <>
      <Header />
      <main className="min-h-screen pt-14">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <nav className="font-mono text-[11px] text-text-muted mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-text-secondary no-underline">feed</Link>
            <span className="mx-2">/</span>
            <span className="text-text-secondary">article</span>
          </nav>

          <h1 className="text-3xl md:text-4xl font-bold text-text-primary leading-tight mb-4">{article.title}</h1>

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono bg-neon-green/10 text-neon-green border border-neon-green/20">
              credential proven
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono bg-warning/10 text-warning border border-warning/20">
              allegation reported
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono bg-bg-elevated text-text-muted border border-border">
              not independently corroborated
            </span>
            <time className="font-mono text-xs text-text-muted" dateTime={new Date(article.publishedAt * 1000).toISOString()}>
              {new Date(article.publishedAt * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </time>
          </div>

          {article.subtitle && (
            <p className="text-text-secondary italic border-l-2 border-neon-green/30 pl-4 mb-8">{article.subtitle}</p>
          )}

          <div className="prose prose-sm max-w-none mb-8">
            <ArticleBody content={article.body} />
          </div>

          <section className="card border-neon-green/10" aria-labelledby="provenance">
            <h2 id="provenance" className="font-mono text-[11px] text-text-muted uppercase tracking-wider mb-3">provenance</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-text-muted">What is proven</dt><dd className="text-text-secondary text-right">The source proved a Reclaim credential before the interview. The claims themselves are the source&apos;s account.</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-text-muted">Source identity</dt><dd className="text-text-secondary text-right">Not recorded onchain. The transaction was submitted by the site&apos;s publisher account, not the source.</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-text-muted">Drafting</dt><dd className="text-text-secondary text-right">AI-drafted from the interview, then edited and approved by the source. Not fact checked.</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-text-muted">Read from</dt><dd className="text-right"><a href={explorerUrl("contract", registry)} target="_blank" rel="noopener noreferrer" className="text-neon-cyan font-mono break-all">{registry}</a></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-text-muted">Article ID</dt><dd className="text-text-secondary font-mono break-all text-right">{article.articleId}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-text-muted">Approved digest</dt><dd className="text-text-secondary font-mono break-all text-right">{article.approvedDigest}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-text-muted">Stored bytes</dt><dd className="text-text-secondary font-mono text-right">title {article.byteLengths.title}, subtitle {article.byteLengths.subtitle}, body {article.byteLengths.body}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-text-muted">Raw JSON</dt><dd className="text-right"><Link href={`/api/articles/${article.articleId}`} className="text-neon-cyan font-mono">/api/articles/{article.articleId.slice(0, 10)}...</Link></dd></div>
            </dl>
          </section>
        </article>
      </main>
    </>
  );
}
