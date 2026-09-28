import Link from "next/link";
import Header from "@/components/Header";
import ArticleCard from "@/components/ArticleCard";
import { explorerUrl, listArticles, registryConfigured } from "@/lib/onchain";

export const dynamic = "force-dynamic";

async function getArticles() {
  try {
    return { articles: await listArticles(20), failed: false };
  } catch {
    return { articles: [], failed: true };
  }
}

export default async function HomePage() {
  const { articles, failed } = await getArticles();
  const registry = process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS;

  return (
    <>
      <Header />
      <main className="min-h-screen pt-14 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" aria-hidden="true" />

        <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-neon-green/5 border border-neon-green/20 rounded font-mono text-[11px] font-semibold text-neon-green uppercase tracking-[2px] mb-6">
            articles stored on Starknet Sepolia
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight mb-6 text-text-primary">
            Credential-backed reporting, <span className="text-neon-green glow-text">on the record</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            Sources prove a credential with Reclaim, approve every word, and the whole article is
            written into a Starknet contract that anyone can read without this website.
          </p>
          <Link href="/submit" className="btn-primary inline-block">Submit a report</Link>
        </section>

        <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pb-16" aria-labelledby="feed-heading">
          <div className="flex items-center justify-between mb-6">
            <h2 id="feed-heading" className="font-mono text-[11px] text-text-muted uppercase tracking-wider">published articles</h2>
            {registry && (
              <a href={explorerUrl("contract", registry)} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-neon-cyan">
                registry on Voyager
              </a>
            )}
          </div>

          {!registryConfigured() ? (
            <div className="card text-center py-12">
              <p className="text-sm text-text-secondary">The Sepolia registry is not configured on this server yet.</p>
            </div>
          ) : failed ? (
            <div className="card text-center py-12" role="alert">
              <p className="text-sm text-text-secondary">Could not read the registry from Sepolia right now. Reload in a moment.</p>
            </div>
          ) : articles.length === 0 ? (
            <div className="card text-center py-12">
              <div className="font-mono text-[11px] text-text-muted mb-2">{"// no articles yet"}</div>
              <Link href="/submit" className="btn-outline !text-xs inline-block">Submit a report</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {articles.map((article) => <ArticleCard key={article.articleId} article={article} />)}
            </div>
          )}
        </section>

        <footer className="relative z-10 text-center py-6 px-4 text-[11px] font-mono text-text-muted border-t border-border">
          credentials by{" "}
          <a href="https://reclaimprotocol.org" target="_blank" rel="noopener noreferrer" className="text-neon-dim hover:text-neon-green no-underline">reclaim protocol</a>
          {" "}&middot; stored on <span className="text-neon-cyan">Starknet Sepolia</span> &middot; interviews processed by{" "}
          <span className="text-neon-cyan">Google Gemini</span> &middot; <Link href="/api/capabilities" className="text-neon-dim">capabilities</Link>
        </footer>
      </main>
    </>
  );
}
