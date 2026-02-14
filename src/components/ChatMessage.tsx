"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/types";

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-neon-green/10 border border-neon-green/20 text-text-primary"
            : "bg-bg-elevated border border-border text-text-secondary"
        }`}
      >
        <div className="font-mono text-[10px] uppercase tracking-wider mb-1.5 opacity-60">
          {isUser ? "source" : "journalist"}
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}
