import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";
import * as gemini from "./gemini";
import * as ollama from "./ollama";

export type AiProvider = "ollama" | "gemini" | "none";

export interface AiInfo {
  provider: AiProvider;
  model: string;
  /** true when a third party outside the operator's control receives the text */
  external: boolean;
  label: string;
  /** one sentence for the UI, always states who can read the text */
  disclosure: string;
}

export function aiProvider(): AiProvider {
  const chosen = (process.env.AI_PROVIDER || "").toLowerCase();
  if (chosen === "gemini") return gemini.geminiConfigured() ? "gemini" : "none";
  if (chosen === "ollama") return ollama.ollamaConfigured() ? "ollama" : "none";
  if (ollama.ollamaConfigured()) return "ollama";
  if (gemini.geminiConfigured()) return "gemini";
  return "none";
}

export function aiInfo(): AiInfo {
  const provider = aiProvider();
  if (provider === "ollama") {
    return {
      provider,
      model: ollama.ollamaModel(),
      external: false,
      label: `open model ${ollama.ollamaModel()} running on this server`,
      disclosure:
        `Interview messages and the draft article are processed by the open model ${ollama.ollamaModel()} running on this server through Ollama. No third-party AI provider receives the text. The server operator can still read it: this is not confidential compute.`,
    };
  }
  if (provider === "gemini") {
    return {
      provider,
      model: gemini.GEMINI_MODEL,
      external: true,
      label: "Google Gemini",
      disclosure:
        "Interview messages and the draft article are sent to Google's Gemini API. Google receives the full text, and the server operator can read it too: this is not confidential compute.",
    };
  }
  return {
    provider: "none",
    model: "",
    external: false,
    label: "no AI configured",
    disclosure: "No AI backend is configured. Set OLLAMA_BASE_URL (local open model) or GEMINI_API_KEY (Google).",
  };
}

export function aiConfigured() {
  return aiProvider() !== "none";
}

export async function aiReachable() {
  const provider = aiProvider();
  if (provider === "ollama") return ollama.ollamaReachable();
  return provider === "gemini";
}

export function conductInterviewStream(messages: ChatMessage[], credential: VerifiedCredential): Promise<ReadableStream<Uint8Array>> {
  const provider = aiProvider();
  if (provider === "ollama") return ollama.conductInterviewStream(messages, credential);
  if (provider === "gemini") return gemini.conductInterviewStream(messages, credential);
  return Promise.reject(new Error("No AI backend is configured"));
}

export function generateArticle(messages: ChatMessage[], credential: VerifiedCredential): Promise<ArticleDraft> {
  const provider = aiProvider();
  if (provider === "ollama") return ollama.generateArticle(messages, credential);
  if (provider === "gemini") return gemini.generateArticle(messages, credential);
  return Promise.reject(new Error("No AI backend is configured"));
}
