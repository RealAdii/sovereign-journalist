import Link from "next/link";
import Header from "@/components/Header";
import ArticleCard from "@/components/ArticleCard";
import { listArticles } from "@/lib/pinata";

async function getArticles() {
  try {
    return await listArticles();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const articles = await getArticles();

  return (
    <>
      <Header />
      <main className="min-h-screen pt-14 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse, rgba(0,255,136,0.04) 0%, transparent 70%)",
          }}
        />

        {/* Hero */}
        <section className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-neon-green/5 border border-neon-green/20 rounded font-mono text-[11px] font-semibold text-neon-green uppercase tracking-[2px] mb-6">
            <div className="w-1.5 h-1.5 bg-neon-green rounded-full shadow-[0_0_6px_#00FF88] animate-pulse-glow" />
            zkTLS verified journalism
          </div>

          <a
            href="/api/attestation"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-neon-cyan/5 border border-neon-cyan/20 rounded font-mono text-[11px] font-semibold text-neon-cyan uppercase tracking-[2px] mb-6 ml-2 hover:bg-neon-cyan/10 transition-colors no-underline"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            TEE verified execution
          </a>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight mb-6 text-text-primary">
            Truth Needs No{" "}
            <span className="text-neon-green glow-text">Identity</span>
          </h1>

          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            News that&apos;s verified, uncensorable, and source-protected
            — by math, not trust.
          </p>

          <Link href="/submit" className="btn-primary inline-block">
            Submit a Tip
          </Link>
        </section>

        {/* Articles Feed */}
        <section className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
          <div className="flex items-center justify-between mb-6">
            <span className="font-mono text-[11px] text-text-muted uppercase tracking-wider">
              published stories
            </span>
          </div>

          {articles.length === 0 ? (
            <div className="card text-center py-12">
              <div className="font-mono text-[11px] text-text-muted mb-2">
                {"// no stories yet"}
              </div>
              <p className="text-sm text-text-secondary mb-4">
                Be the first to share a verified story.
              </p>
              <Link href="/submit" className="btn-outline !text-xs inline-block">
                Submit a Tip
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {articles.map((article) => (
                <ArticleCard key={article.cid} article={article} />
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="relative z-10 text-center py-6 px-6 text-[11px] font-mono text-text-muted border-t border-border">
          powered by{" "}
          <a
            href="https://reclaimprotocol.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neon-dim hover:text-neon-green no-underline"
          >
            reclaim protocol
          </a>{" "}
          &middot; stored on{" "}
          <span className="text-neon-cyan">IPFS</span> &middot; AI by{" "}
          <span className="text-neon-cyan">Gemini</span>
        </footer>
      </main>
    </>
  );
}
