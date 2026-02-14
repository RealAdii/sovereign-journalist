"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage as ChatMessageType, IPFSArticle } from "@/lib/types";
import ChatMessage from "./ChatMessage";
import ArticlePreview from "./ArticlePreview";
import PublishConfirmation from "./PublishConfirmation";

const MIN_MESSAGES_TO_PUBLISH = 6;
const RETRY_DELAY = 15000;

export default function ChatInterface() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [articlePreview, setArticlePreview] = useState<IPFSArticle | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedCid, setPublishedCid] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sessionToken =
    typeof window !== "undefined"
      ? sessionStorage.getItem("sj_session")
      : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  // Redirect if no session
  useEffect(() => {
    if (typeof window !== "undefined" && !sessionStorage.getItem("sj_session")) {
      router.push("/submit/verify");
    }
  }, [router]);

  const sendMessage = async (retries = 2) => {
    if (!input.trim() || loading || !sessionToken) return;

    const userMessage: ChatMessageType = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setStreaming(false);
    setError(null);

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, sessionToken }),
      });

      if (res.status === 429 && retries > 0) {
        setError("Rate limited — retrying in 15s...");
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
        setError(null);
        setLoading(false);
        setInput(userMessage.content);
        setMessages(messages);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      // Stream the response
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      // Add placeholder assistant message
      const withAssistant = [...newMessages, { role: "assistant" as const, content: "" }];
      setMessages(withAssistant);
      setStreaming(true);
      setLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([
          ...newMessages,
          { role: "assistant", content: accumulated },
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handlePublish = async () => {
    if (!sessionToken) return;
    setGeneratingPreview(true);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, sessionToken }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate article");
      }

      const { article } = await res.json();
      setArticlePreview(article);
    } catch (err) {
      console.error("Generate error:", err);
      setError(err instanceof Error ? err.message : "Article generation failed");
    } finally {
      setGeneratingPreview(false);
    }
  };

  const confirmPublish = async () => {
    if (!articlePreview || !sessionToken) return;
    setPublishing(true);
    setError(null);

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article: articlePreview, sessionToken }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to publish to IPFS");
      }

      const { cid } = await res.json();

      // Purge all source data
      sessionStorage.removeItem("sj_session");
      sessionStorage.removeItem("sj_credential");
      setMessages([]);
      setArticlePreview(null);
      setPublishedCid(cid);
    } catch (err) {
      console.error("Publish error:", err);
      setError(err instanceof Error ? err.message : "Publishing failed");
      setPublishing(false);
    }
  };

  const canPublish = messages.length >= MIN_MESSAGES_TO_PUBLISH;

  if (publishedCid) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-6">
        <PublishConfirmation cid={publishedCid} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Chat header */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <span className="font-mono text-[11px] text-text-muted uppercase tracking-wider">
            step_02: interview
          </span>
          <div className="text-sm text-text-secondary mt-0.5">
            {messages.length} message{messages.length !== 1 && "s"} exchanged
          </div>
        </div>

        {canPublish && (
          <button
            onClick={handlePublish}
            disabled={generatingPreview || loading}
            className="btn-primary !py-2 !px-4 !text-xs disabled:opacity-50"
          >
            {generatingPreview
              ? "Generating Article..."
              : "End Interview & Publish"}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="font-mono text-[11px] text-text-muted mb-3">
              {"// begin your testimony"}
            </div>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Tell the AI journalist what you want to share. Your verified
              credentials establish credibility — the journalist will ask
              follow-up questions to capture the full story.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {loading && !streaming && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-bg-elevated border border-border rounded-lg px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider mb-1.5 opacity-60">
                journalist
              </div>
              <div className="flex items-center gap-1 text-text-muted">
                <span className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse" />
                <span
                  className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div className="mx-6 mb-2 px-3 py-2 rounded text-xs font-mono bg-error/5 text-error border border-error/20">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border px-6 py-4 shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Share your story..."
            rows={2}
            disabled={loading || streaming}
            className="flex-1 bg-bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-neon-green/30 focus:shadow-neon transition-all disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || streaming}
            className="btn-primary !py-3 !px-5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Send
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] font-mono text-text-muted">
            shift+enter for newline
          </span>
          {!canPublish && messages.length > 0 && (
            <span className="text-[10px] font-mono text-text-muted">
              {MIN_MESSAGES_TO_PUBLISH - messages.length} more message
              {MIN_MESSAGES_TO_PUBLISH - messages.length !== 1 && "s"} before
              publishing
            </span>
          )}
        </div>
      </div>

      {/* Article preview modal */}
      {articlePreview && (
        <ArticlePreview
          article={articlePreview}
          onConfirm={confirmPublish}
          onCancel={() => setArticlePreview(null)}
          publishing={publishing}
        />
      )}
    </div>
  );
}
