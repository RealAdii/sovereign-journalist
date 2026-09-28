"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArticleDraft, PublishEstimate } from "@/lib/types";
import { ARTICLE_LIMITS, byteLength } from "@/lib/onchain-shared";
import Notice from "./Notice";

interface Props {
  draft: ArticleDraft;
  onEstimate: (article: ArticleDraft) => Promise<PublishEstimate>;
  onPublish: (article: ArticleDraft, estimate: PublishEstimate) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}

export default function ArticleEditor({ draft, onEstimate, onPublish, onCancel, busy, error }: Props) {
  const [title, setTitle] = useState(draft.title);
  const [subtitle, setSubtitle] = useState(draft.subtitle);
  const [body, setBody] = useState(draft.body);
  const [preview, setPreview] = useState(false);
  const [estimate, setEstimate] = useState<PublishEstimate | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const article: ArticleDraft = useMemo(
    () => ({ version: 1, title, subtitle, body, sourceStatus: "credential-proven", allegationStatus: "reported" }),
    [title, subtitle, body],
  );
  const sizes = useMemo(
    () => ({ title: byteLength(title), subtitle: byteLength(subtitle), body: byteLength(body) }),
    [title, subtitle, body],
  );
  const overLimit =
    sizes.title > ARTICLE_LIMITS.title || sizes.subtitle > ARTICLE_LIMITS.subtitle || sizes.body > ARTICLE_LIMITS.body;
  const empty = title.trim().length === 0 || body.trim().length === 0;

  const edit = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setEstimate(null);
    setConfirmed(false);
  };

  const counter = (label: string, size: number, max: number) => (
    <span className={`font-mono text-[10px] ${size > max ? "text-error" : "text-text-muted"}`}>
      {label}: {size}/{max} bytes
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="bg-bg-card border border-border rounded-lg max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <div>
            <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-1">review before publishing</div>
            <h2 id="editor-title" className="text-lg font-bold text-text-primary">Your public article</h2>
          </div>
          <button onClick={() => setPreview((p) => !p)} className="btn-outline !py-1.5 !px-3 !text-xs">
            {preview ? "Edit" : "Preview"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          <Notice tone="warn" title="read before you publish">
            Exactly this text will be written to Starknet Sepolia, in full, forever. Anyone can read it.
            Remove any detail that could identify you. The AI wrote this draft from your interview and it
            can contain mistakes. It is not fact checked. Claims are shown as allegations you reported.
          </Notice>

          {preview ? (
            <div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">{title}</h1>
              {subtitle && <p className="text-sm text-text-secondary italic mb-4">{subtitle}</p>}
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="flex justify-between text-xs text-text-secondary mb-1">Title {counter("utf-8", sizes.title, ARTICLE_LIMITS.title)}</span>
                <input value={title} onChange={(e) => edit(setTitle)(e.target.value)} className="w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm text-text-primary" />
              </label>
              <label className="block">
                <span className="flex justify-between text-xs text-text-secondary mb-1">Subtitle {counter("utf-8", sizes.subtitle, ARTICLE_LIMITS.subtitle)}</span>
                <textarea value={subtitle} rows={2} onChange={(e) => edit(setSubtitle)(e.target.value)} className="w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm text-text-primary" />
              </label>
              <label className="block">
                <span className="flex justify-between text-xs text-text-secondary mb-1">Body (Markdown) {counter("utf-8", sizes.body, ARTICLE_LIMITS.body)}</span>
                <textarea value={body} rows={16} onChange={(e) => edit(setBody)(e.target.value)} className="w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm text-text-primary font-mono" />
              </label>
            </div>
          )}

          {overLimit && (
            <Notice tone="error">
              One or more fields exceed the onchain byte limit. Shorten the text until every counter is within its limit.
            </Notice>
          )}

          {estimate && (
            <div className="rounded border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-2 text-xs space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-wider text-neon-cyan">fee estimate from Sepolia</div>
              <div className="flex justify-between"><span className="text-text-muted">Estimated fee</span><span className="font-mono text-text-primary">{estimate.feeStrk} STRK (paid by the publisher account, not you)</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Calldata felts</span><span className="font-mono text-text-primary">{estimate.calldataFelts}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Article ID</span><span className="font-mono text-text-primary break-all">{estimate.articleId}</span></div>
              <p className="text-text-muted">The article ID is the digest of this exact text. Editing anything changes it and requires a new estimate.</p>
            </div>
          )}

          {error && <Notice tone="error">{error}</Notice>}

          {estimate && (
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              I reviewed the full text above, removed identifying details, and understand publication is irreversible and public.
            </label>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-t border-border shrink-0">
          <button onClick={onCancel} disabled={busy} className="btn-outline !py-2 !px-4 !text-xs disabled:opacity-50">
            Back to interview
          </button>
          <div className="flex gap-3">
            {!estimate ? (
              <button
                onClick={async () => setEstimate(await onEstimate(article))}
                disabled={busy || overLimit || empty}
                className="btn-primary !py-2 !px-4 !text-xs disabled:opacity-50"
              >
                {busy ? "Estimating" : "Estimate fee"}
              </button>
            ) : (
              <button
                onClick={() => onPublish(article, estimate)}
                disabled={busy || !confirmed}
                className="btn-primary !py-2 !px-4 !text-xs disabled:opacity-50"
              >
                {busy ? "Waiting for Sepolia confirmation" : "Publish to Starknet Sepolia"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
