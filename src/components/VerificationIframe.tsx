"use client";

import { useEffect, useCallback } from "react";

interface Props {
  url: string;
  onClose: () => void;
}

export default function VerificationIframe({ url, onClose }: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-[9999] bg-bg-primary flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono">
            <div className="w-[22px] h-[22px] border-2 border-neon-green rounded-sm flex items-center justify-center text-[11px] text-neon-green font-bold">
              ZK
            </div>
            <span className="text-[13px] font-semibold text-text-secondary tracking-wide">
              <span className="text-neon-green">reclaim</span>::proof
            </span>
          </div>
          <div className="w-px h-[18px] bg-border" />
          <span className="text-[11px] font-medium font-mono text-text-muted uppercase tracking-wide hidden sm:block">
            Verification
          </span>
        </div>

        <button
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold font-mono text-text-secondary bg-transparent border border-border rounded cursor-pointer uppercase tracking-wide hover:border-error hover:text-error transition-all"
          onClick={onClose}
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          ESC
        </button>
      </div>

      <iframe
        src={url}
        title="Reclaim Verification"
        allow="clipboard-read; clipboard-write"
        className="flex-1 w-full border-none bg-white"
      />
    </div>
  );
}
