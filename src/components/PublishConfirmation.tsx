"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  cid: string;
}

export default function PublishConfirmation({ cid }: Props) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  const gateway =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          router.push(`/article/${cid}`);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cid, router]);

  return (
    <div className="max-w-lg mx-auto text-center animate-fade-in">
      <div className="card p-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-neon-green"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-text-primary mb-2">
          Published to IPFS
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          Your story is now permanently stored on the decentralized web.
        </p>

        <div className="bg-bg-elevated border border-border rounded p-3 mb-6">
          <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-1">
            ipfs cid
          </div>
          <a
            href={`${gateway}/ipfs/${cid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-neon-cyan hover:underline break-all"
          >
            {cid}
          </a>
        </div>

        <div className="bg-neon-green/5 border border-neon-green/20 rounded p-3 mb-6">
          <div className="font-mono text-[11px] text-neon-green">
            &#10003; All session data has been purged from your browser
          </div>
        </div>

        <p className="text-xs text-text-muted font-mono">
          Redirecting to article in {countdown}s...
        </p>
      </div>
    </div>
  );
}
