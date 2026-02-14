"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-8 h-8 border-2 border-neon-green rounded flex items-center justify-center text-xs font-bold text-neon-green font-mono shadow-neon">
            SJ
          </div>
          <span className="font-mono text-sm font-semibold tracking-wide text-text-secondary">
            <span className="text-neon-green glow-text">sovereign</span>
            <span className="text-text-muted">::</span>
            <span>journalist</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-xs font-mono uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors no-underline"
          >
            Feed
          </Link>
          <Link href="/submit" className="btn-outline !py-1.5 !px-4 !text-xs">
            Submit a Tip
          </Link>
        </nav>
      </div>
    </header>
  );
}
