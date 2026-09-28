import Link from "next/link";
import Header from "@/components/Header";
import Notice from "@/components/Notice";
import { capabilitiesReport } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const caps = await capabilitiesReport();
  return (
    <>
      <Header />
      <main className="min-h-screen px-4 sm:px-6 pt-20 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" aria-hidden="true" />
        <div className="max-w-2xl mx-auto relative z-10 animate-fade-in">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-warning/5 border border-warning/30 rounded font-mono text-[11px] font-semibold text-warning uppercase tracking-[2px] mb-6">
              Starknet Sepolia testnet
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight mb-4 text-text-primary">
              Report something, on the record
            </h1>
            <p className="text-base text-text-secondary max-w-lg mx-auto leading-relaxed">
              Prove a credential, answer a journalist&apos;s questions, approve the article yourself, and
              have the full text written to Starknet where anyone can read it.
            </p>
          </div>

          <section aria-labelledby="limits" className="card text-left mb-6">
            <h2 id="limits" className="font-mono text-[11px] text-text-muted uppercase tracking-wider mb-3">privacy limits and costs, read first</h2>
            <ul className="text-xs text-text-secondary space-y-2 list-disc pl-5">
              <li><strong className="text-text-primary">Reclaim proves a login, not a claim.</strong> The proof can disclose provider fields such as an employer or an email, depending on the template. We show you exactly what was disclosed.</li>
              <li><strong className="text-text-primary">{caps.aiInterview.external ? "A third party receives the interview." : "The interview stays on this server."}</strong> {caps.aiInterview.reason}</li>
              <li><strong className="text-text-primary">The article is public forever.</strong> Full title, subtitle, and body are stored in a Sepolia contract. Only what you approve is written. Nothing else from the session goes onchain.</li>
              <li><strong className="text-text-primary">You do not pay to publish.</strong> The server&apos;s publisher account submits the transaction, so your wallet is never involved. The fee is shown before you confirm.</li>
              <li><strong className="text-text-primary">Bond: 1 STRK on Sepolia, refundable.</strong> Currently blocked, see below. We do not accept a public transfer in its place.</li>
              <li><strong className="text-text-primary">Network metadata.</strong> Your IP address reaches this server and Reclaim like any website. Use a network you trust.</li>
            </ul>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="card text-left flex flex-col">
              <div className="text-neon-green font-mono text-xs mb-2">path_a: interview and publish</div>
              <ol className="text-xs text-text-muted leading-relaxed space-y-1 list-decimal pl-4 mb-4">
                <li>Prove a credential with Reclaim</li>
                <li>Refundable 1 STRK bond (blocked)</li>
                <li>AI interview, external processing disclosed</li>
                <li>Edit and approve the article, see the fee</li>
                <li>Publish to Starknet Sepolia and get a read-back proof</li>
              </ol>
              <div className="mt-auto">
                <Link href="/submit/verify" className="btn-primary inline-block !text-xs w-full text-center">Start with verification</Link>
              </div>
            </div>
            <div className="card text-left flex flex-col">
              <div className="text-neon-cyan font-mono text-xs mb-2">path_b: encrypted tip, no AI</div>
              <p className="text-xs text-text-muted leading-relaxed mb-4">
                Encrypt a message to the editorial key on your device and submit the ciphertext through
                the STRK20 privacy pool so that no wallet or identity is linked to it.
              </p>
              <div className="mt-auto">
                <Link href="/submit/tip" className="btn-outline inline-block !text-xs w-full text-center">See status (blocked)</Link>
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <Notice tone={caps.anonymousBond.enabled ? "warn" : "error"} title="anonymous bond">
              {caps.anonymousBond.reason}
            </Notice>
            <Notice tone="error" title="encrypted tips">{caps.encryptedTips.reason}</Notice>
            <Notice tone={caps.aiInterview.enabled ? "warn" : "error"} title="ai interview">{caps.aiInterview.reason}</Notice>
            <Notice tone={caps.articleRegistry.enabled ? "ok" : "error"} title="starknet sepolia registry">{caps.articleRegistry.reason}</Notice>
          </div>

          <p className="text-center text-xs text-text-muted">
            Lost your session? <Link href="/submit/recover" className="text-neon-cyan">Use your recovery code</Link>.
            Full status at <Link href="/api/capabilities" className="text-neon-cyan">/api/capabilities</Link>.
          </p>
        </div>
      </main>
    </>
  );
}
