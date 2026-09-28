"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ArticleDraft, ChatMessage as ChatMessageType, PublishEstimate, PublishResult } from "@/lib/types";
import { clearSession, loadSession, type ClientSession } from "@/lib/client-session";
import ChatMessage from "./ChatMessage";
import ArticleEditor from "./ArticleEditor";
import PublishConfirmation from "./PublishConfirmation";
import Notice from "./Notice";
import type { AiInfo } from "@/lib/ai";

const MIN_MESSAGES_TO_DRAFT = 6;

interface ReceiptSummary {
  receiptId: string;
  purpose: "interview" | "draft";
  model: string;
  verified: boolean;
  verdict: string;
  requestBodyHash?: string;
  responseBodyHash?: string;
}

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return data.error || `${fallback} (${res.status})`;
}

export default function ChatInterface({ ai }: { ai: AiInfo }) {
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null | undefined>(undefined);
  const [disclosed, setDisclosed] = useState(false);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishResult | null>(null);
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [verifyingReceipts, setVerifyingReceipts] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loaded = loadSession();
    setSession(loaded);
    if (!loaded) router.replace("/submit/verify");
    else if (loaded.bondStatus === "blocked") router.replace("/submit/bond");
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading && disclosed) inputRef.current?.focus();
  }, [loading, disclosed]);

  const token = session?.token;

  const sendMessage = async () => {
    if (!input.trim() || loading || streaming || !token) return;
    const userMessage: ChatMessageType = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, token }),
      });
      if (!res.ok) {
        const message = await readError(res, "The interview request failed");
        setMessages(messages);
        setInput(userMessage.content);
        throw new Error(message);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      setStreaming(true);
      setLoading(false);
      setMessages([...newMessages, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([...newMessages, { role: "assistant", content: accumulated }]);
      }
      if (!accumulated) {
        setMessages(newMessages);
        setError("The AI returned an empty reply. Send your message again or use your recovery code later.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleDraft = async () => {
    if (!token) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, token }),
      });
      if (!res.ok) throw new Error(await readError(res, "Drafting failed"));
      const { article } = (await res.json()) as { article: ArticleDraft };
      setDraft(article);
      setEditorError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drafting failed");
    } finally {
      setDrafting(false);
    }
  };

  const estimate = async (article: ArticleDraft): Promise<PublishEstimate> => {
    setBusy(true);
    setEditorError(null);
    try {
      const res = await fetch("/api/publish/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article, token }),
      });
      if (!res.ok) throw new Error(await readError(res, "Fee estimation failed"));
      return (await res.json()) as PublishEstimate;
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Fee estimation failed");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (article: ArticleDraft, est: PublishEstimate) => {
    setBusy(true);
    setEditorError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article, approvedDigest: est.approvedDigest, token }),
      });
      if (!res.ok) throw new Error(await readError(res, "Publishing failed"));
      const result = (await res.json()) as PublishResult;
      clearSession();
      setMessages([]);
      setDraft(null);
      setPublished(result);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setBusy(false);
    }
  };

  const verifyReceipts = async () => {
    if (!token) return;
    setVerifyingReceipts(true);
    try {
      const res = await fetch("/api/attestation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { lastReceipts?: ReceiptSummary[]; attestationVerified?: boolean };
      setReceipts(data.lastReceipts || []);
      if (!data.attestationVerified) setError("The enclave attestation could not be verified right now.");
    } catch {
      setError("Could not verify AI receipts.");
    } finally {
      setVerifyingReceipts(false);
    }
  };

  const cancel = async () => {
    if (token) await fetch("/api/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    clearSession();
    router.push("/submit");
  };

  if (published) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <PublishConfirmation result={published} ai={ai} />
      </div>
    );
  }

  if (session === undefined || !session) return null;

  if (!disclosed) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-4">
        <div className="card max-w-lg w-full p-6 sm:p-8 space-y-4">
          <div className="font-mono text-[11px] text-text-muted">{"// step_03: before the interview"}</div>
          <h2 className="text-xl font-bold text-text-primary">Where your words go</h2>
          <Notice tone="warn" title={ai.external ? "external AI processing" : "AI processing on this server"}>
            {ai.disclosure} Nothing about your Reclaim credential values is given to the model, only the
            provider name and the names of the disclosed fields.
          </Notice>
          {ai.provider === "phala" && (
            <Notice tone={ai.attestation?.verified ? "ok" : "error"} title={ai.attestation?.verified ? "attested GPU TEE" : "attestation not verified"}>
              {ai.attestation?.verified
                ? `This server verified the enclave's hardware attestation (${ai.attestation.verdict}). Every AI reply returns a signed receipt; use "Verify AI receipts" during the interview or open `
                : `The enclave could not be verified (${ai.attestation?.verdict || "unknown"}). No text will be sent until it is. Details at `}
              <a href="/api/attestation" target="_blank" rel="noopener noreferrer" className="text-neon-cyan">/api/attestation</a>.
              The server operator can still read text in transit.
            </Notice>
          )}
          <ul className="text-xs text-text-secondary space-y-1.5 list-disc pl-5">
            <li>Do not include names, dates, or details that only you would know.</li>
            <li>You will see and can edit the full article before anything is published.</li>
            <li>Nothing is published automatically. Publication is irreversible and public.</li>
            <li>The transcript is not stored on this server after the session ends and is never put on Starknet.</li>
          </ul>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => setDisclosed(true)} className="btn-primary flex-1">
              I understand, start the interview
            </button>
            <button onClick={cancel} className="btn-outline flex-1 !text-xs">
              Decline and cancel
            </button>
          </div>
          <p className="text-[11px] text-text-muted">
            Prefer not to be interviewed by a model at all? The encrypted tip path is the alternative, but it is currently blocked on Sepolia. See the submit overview.
          </p>
        </div>
      </div>
    );
  }

  const canDraft = messages.length >= MIN_MESSAGES_TO_DRAFT;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="border-b border-border px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 gap-3">
        <div>
          <span className="font-mono text-[11px] text-text-muted uppercase tracking-wider">step_03: interview</span>
          <div className="text-sm text-text-secondary mt-0.5" aria-live="polite">
            {messages.length} message{messages.length !== 1 && "s"} exchanged
          </div>
        </div>
        <div className="flex gap-2">
          {ai.provider === "phala" && (
            <button onClick={verifyReceipts} disabled={verifyingReceipts} className="btn-outline !py-2 !px-3 !text-xs disabled:opacity-50">
              {verifyingReceipts ? "Verifying" : "Verify AI receipts"}
            </button>
          )}
          <button onClick={cancel} className="btn-outline !py-2 !px-3 !text-xs">Cancel</button>
          {canDraft && (
            <button onClick={handleDraft} disabled={drafting || loading || streaming} className="btn-primary !py-2 !px-4 !text-xs disabled:opacity-50">
              {drafting ? "Drafting" : "End interview and draft article"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="font-mono text-[11px] text-text-muted mb-3">{"// begin"}</div>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Tell the journalist what you want to report. It will ask follow-up questions. Leave out anything that could identify you.
            </p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {loading && !streaming && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-bg-elevated border border-border rounded-lg px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider mb-1.5 opacity-60">journalist</div>
              <span className="text-text-muted text-xs">thinking</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="mx-4 sm:mx-6 mb-2"><Notice tone="error">{error}</Notice></div>}
      {receipts.length > 0 && (
        <div className="mx-4 sm:mx-6 mb-2">
          <Notice tone={receipts.every((r) => r.verified) ? "ok" : "warn"} title="signed AI receipts">
            <ul className="space-y-1">
              {receipts.map((r) => (
                <li key={r.receiptId} className="font-mono text-[10px] break-all">
                  {r.verified ? "verified" : "NOT verified"} · {r.purpose} · {r.model} · receipt {r.receiptId}
                  {r.responseBodyHash ? ` · response ${r.responseBodyHash.slice(0, 18)}` : ""}
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="border-t border-border px-4 sm:px-6 py-4 shrink-0">
        <div className="flex gap-3 items-end">
          <label htmlFor="interview-input" className="sr-only">Your message</label>
          <textarea
            id="interview-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="What do you want to report?"
            rows={2}
            maxLength={6000}
            disabled={loading || streaming}
            className="flex-1 bg-bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-neon-green/30 transition-all disabled:opacity-50"
          />
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading || streaming} className="btn-primary !py-3 !px-5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
            Send
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] font-mono text-text-muted">shift+enter for a new line. processed by {ai.label}.</span>
          {!canDraft && messages.length > 0 && (
            <span className="text-[10px] font-mono text-text-muted">
              {MIN_MESSAGES_TO_DRAFT - messages.length} more before drafting
            </span>
          )}
        </div>
      </div>

      {draft && (
        <ArticleEditor
          draft={draft}
          onEstimate={estimate}
          onPublish={publish}
          onCancel={() => setDraft(null)}
          busy={busy}
          error={editorError}
        />
      )}
    </div>
  );
}
