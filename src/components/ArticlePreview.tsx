"use client";

import type { IPFSArticle } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  article: IPFSArticle;
  onConfirm: () => void;
  onCancel: () => void;
  publishing: boolean;
}

export default function ArticlePreview({
  article,
  onConfirm,
  onCancel,
  publishing,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-bg-card border border-border rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-1">
              article preview
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              {article.article.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-neon-green/10 text-neon-green border border-neon-green/20">
              confidence: {article.article.confidence}%
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-sm text-text-secondary mb-4 italic">
            {article.article.subtitle}
          </p>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.article.body}
            </ReactMarkdown>
          </div>
          {article.article.confidenceReason && (
            <div className="mt-4 px-3 py-2 rounded text-xs font-mono bg-neon-green/5 text-text-secondary border border-neon-green/10">
              <span className="text-neon-green">confidence reasoning:</span>{" "}
              {article.article.confidenceReason}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {article.metadata.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <p className="text-[11px] text-text-muted font-mono">
            publishing is permanent — article will be pinned to IPFS
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={publishing}
              className="btn-outline !py-2 !px-4 !text-xs disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={publishing}
              className="btn-primary !py-2 !px-4 !text-xs disabled:opacity-50"
            >
              {publishing ? "Publishing to IPFS..." : "Confirm & Publish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
