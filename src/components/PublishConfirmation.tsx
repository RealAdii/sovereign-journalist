"use client";

import Link from "next/link";
import type { PublishResult } from "@/lib/types";
import type { AiInfo } from "@/lib/ai";

export default function PublishConfirmation({ result, ai }: { result: PublishResult; ai: AiInfo }) {
  return (
    <div className="max-w-lg mx-auto text-center animate-fade-in">
      <div className="card p-6 sm:p-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center" aria-hidden="true">
          <svg className="w-8 h-8 text-neon-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">Published on Starknet Sepolia</h2>
        <p className="text-sm text-text-secondary mb-6">
          The transaction was accepted on L2 and the full article was read back from the contract
          byte for byte before this screen was shown.
        </p>
        <dl className="text-left text-xs space-y-3 mb-6">
          <div>
            <dt className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-1">article id</dt>
            <dd className="font-mono text-neon-cyan break-all">{result.articleId}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-1">transaction</dt>
            <dd>
              <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-neon-cyan hover:underline break-all">
                {result.transactionHash}
              </a>
            </dd>
          </div>
        </dl>
        <div className="bg-neon-green/5 border border-neon-green/20 rounded p-3 mb-6 text-left text-xs text-text-secondary">
          Your session token was discarded from this browser. The interview transcript was not stored
          on the server and is not on Starknet.{ai.external ? ` ${ai.label} received it during the interview.` : " It was processed only on this server."}
        </div>
        {ai.provider === "phala" && (
          <div className={`rounded p-3 mb-6 text-left text-xs border ${ai.attestation?.verified ? "bg-neon-green/5 border-neon-green/20 text-text-secondary" : "bg-error/5 border-error/20 text-error"}`}>
            {ai.attestation?.verified
              ? `The AI ran inside an attested GPU TEE (${ai.attestation.verdict}). Each reply carried a signed receipt binding the request and response hashes to the attested keys; the audit is at `
              : "The AI enclave attestation was not verified for this session. Details at "}
            <a href="/api/attestation" target="_blank" rel="noopener noreferrer" className="text-neon-cyan">/api/attestation</a>.
            The server operator could still read the text in transit.
          </div>
        )}
        <Link href={`/article/${result.articleId}`} className="btn-primary inline-block">
          Open the article
        </Link>
      </div>
    </div>
  );
}
