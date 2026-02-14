import Link from "next/link";
import Header from "@/components/Header";

export default function SubmitPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center px-6 pt-14 relative overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(0,255,136,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-2xl text-center relative z-10 animate-fade-in">
          {/* Status tag */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-neon-green/5 border border-neon-green/20 rounded font-mono text-[11px] font-semibold text-neon-green uppercase tracking-[2px] mb-6">
            <div className="w-1.5 h-1.5 bg-neon-green rounded-full shadow-[0_0_6px_#00FF88] animate-pulse-glow" />
            anonymous & verified
          </div>

          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight mb-6 text-text-primary">
            Share Your Story{" "}
            <span className="text-neon-green glow-text">Safely</span>
          </h1>

          <p className="text-lg text-text-secondary mb-12 max-w-lg mx-auto leading-relaxed">
            Prove your credentials without revealing your identity. An AI
            journalist will interview you, and your story will be published
            permanently to IPFS.
          </p>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            <div className="card text-left">
              <div className="text-neon-green font-mono text-xs mb-2">
                01_verify
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                Prove Credentials
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Use zkTLS to cryptographically verify your employment,
                membership, or identity — without revealing who you are.
              </p>
            </div>

            <div className="card text-left">
              <div className="text-neon-cyan font-mono text-xs mb-2">
                02_interview
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                AI Interview
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                An AI journalist asks probing questions to capture the full
                story. No human sees the raw conversation.
              </p>
            </div>

            <div className="card text-left">
              <div className="text-neon-green font-mono text-xs mb-2">
                03_publish
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                Permanent Record
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Your story is transformed into an article and pinned to IPFS.
                Uncensorable. Immutable. Forever.
              </p>
            </div>
          </div>

          {/* Privacy notice */}
          <div className="card text-left mb-8 border-neon-green/10">
            <div className="font-mono text-[11px] text-text-muted mb-2">
              {"// privacy_guarantees"}
            </div>
            <ul className="text-xs text-text-secondary space-y-1.5">
              <li>
                <span className="text-neon-green mr-2">&#10003;</span>
                Zero-knowledge proofs — we never see your login credentials
              </li>
              <li>
                <span className="text-neon-green mr-2">&#10003;</span>
                No database — interview data exists only in your browser
              </li>
              <li>
                <span className="text-neon-green mr-2">&#10003;</span>
                Auto-purge — all session data deleted after publishing
              </li>
              <li>
                <span className="text-neon-green mr-2">&#10003;</span>
                IPFS storage — no single point of censorship
              </li>
            </ul>
          </div>

          <Link href="/submit/verify" className="btn-primary inline-block">
            Begin Verification
          </Link>
        </div>
      </main>
    </>
  );
}
