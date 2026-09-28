import Link from "next/link";
import Header from "@/components/Header";
import Notice from "@/components/Notice";
import { capabilitiesReport } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

export default async function TipPage() {
  const caps = await capabilitiesReport();
  const tips = caps.encryptedTips;
  return (
    <>
      <Header />
      <main className="min-h-screen px-4 sm:px-6 pt-24 pb-16">
        <div className="max-w-lg mx-auto card p-6 sm:p-8 space-y-4">
          <div className="font-mono text-[11px] text-text-muted">{"// encrypted_tip"}</div>
          <h1 className="text-xl font-bold text-text-primary">Encrypted tip path</h1>
          <p className="text-sm text-text-secondary">
            Design: your browser encrypts the message to the editorial public key, then the ciphertext is
            posted through the STRK20 privacy pool to a helper contract, so the submitting address is a
            relayer rather than you. Only the editorial key can decrypt it, and nothing is published
            unless a source-safe article is later approved.
          </p>
          <Notice tone="error" title="blocked">{tips.reason}</Notice>
          <div className="text-xs text-text-secondary">
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-2">missing before this can be enabled</div>
            <ul className="list-disc pl-5 space-y-1">{tips.missing?.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <dl className="text-xs grid grid-cols-1 gap-1">
            <div className="flex justify-between gap-4"><dt className="text-text-muted">STRK20 Sepolia pool</dt><dd className="font-mono text-text-primary break-all text-right">{tips.poolAddress || "not configured"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-text-muted">Pool class hash (live check)</dt><dd className="font-mono text-text-primary break-all text-right">{tips.poolClassHash || "unavailable"}</dd></div>
          </dl>
          <p className="text-xs text-text-muted">Nothing you type on this site is stored for this path. There is no form because there is no verified place to send it yet.</p>
          <Link href="/submit" className="btn-outline inline-block !text-xs">Back</Link>
        </div>
      </main>
    </>
  );
}
