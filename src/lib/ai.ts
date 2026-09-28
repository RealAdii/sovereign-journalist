import type { ArticleDraft, ChatMessage, VerifiedCredential } from "./types";
import * as gemini from "./gemini";
import * as ollama from "./ollama";
import * as openrouter from "./openrouter";
import * as phala from "./phala";
import { attestationSnapshot, verifyAttestation, type AttestationSnapshot } from "./attestation";

export type AiProvider = "phala" | "ollama" | "openrouter" | "gemini" | "none";

export interface AiInfo {
  provider: AiProvider;
  model: string;
  /** true when a third party outside the operator's control receives the text */
  external: boolean;
  label: string;
  /** one sentence for the UI, always states who can read the text */
  disclosure: string;
  /** Present for the phala provider: the last known attestation state (sync snapshot). */
  attestation?: {
    verified: boolean;
    verdict: string;
    composeHash?: string;
    repoCommit?: string | null;
    verifiedAt?: number;
  };
}

export function aiProvider(): AiProvider {
  const chosen = (process.env.AI_PROVIDER || "").toLowerCase();
  if (chosen === "phala") return phala.phalaConfigured() ? "phala" : "none";
  if (chosen === "gemini") return gemini.geminiConfigured() ? "gemini" : "none";
  if (chosen === "ollama") return ollama.ollamaConfigured() ? "ollama" : "none";
  if (chosen === "openrouter") return openrouter.openrouterConfigured() ? "openrouter" : "none";
  if (phala.phalaConfigured()) return "phala";
  if (openrouter.openrouterConfigured()) return "openrouter";
  if (ollama.ollamaConfigured()) return "ollama";
  if (gemini.geminiConfigured()) return "gemini";
  return "none";
}

function phalaInfo(snapshot: AttestationSnapshot): AiInfo {
  const model = phala.phalaModel();
  const attestation = {
    verified: snapshot.verified,
    verdict: snapshot.verdict,
    composeHash: snapshot.composeHash,
    repoCommit: snapshot.sourceProvenance?.repoCommit ?? null,
    verifiedAt: snapshot.verifiedAt,
  };
  if (snapshot.verified) {
    return {
      provider: "phala",
      model,
      external: true,
      label: `open model ${model} in an attested GPU TEE (Phala)`,
      disclosure:
        `Interview messages and the draft article are sent to Phala's confidential inference gateway, which this server verified: the Intel TDX quote checks out to the Intel root, the running software is measured into the quote (compose ${snapshot.composeHash?.slice(0, 12) || "unknown"}), and the TLS channel is pinned to the attested keys. Every reply carries a signed receipt you can audit. The model ${model} runs inside that GPU enclave. Phala's operators cannot read the text inside the enclave, but this server's operator can read it in transit: the server, not the enclave, is the trust boundary you must judge.`,
      attestation,
    };
  }
  return {
    provider: "phala",
    model,
    external: true,
    label: `open model ${model} at Phala (attestation not verified)`,
    disclosure:
      `Phala confidential inference is configured, but this server has not verified its attestation (${snapshot.verdict}). No text is sent until verification succeeds. The server operator can read text in transit.`,
    attestation,
  };
}

export function aiInfo(): AiInfo {
  const provider = aiProvider();
  if (provider === "phala") return phalaInfo(attestationSnapshot());
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
  if (provider === "openrouter") {
    return {
      provider,
      model: openrouter.openrouterModel(),
      external: true,
      label: `open model ${openrouter.openrouterModel()} in a ${openrouter.openrouterProvider() === "phala" ? "Phala GPU TEE" : openrouter.openrouterProvider() + " host"} via OpenRouter`,
      disclosure:
        openrouter.openrouterProvider() === "phala"
          ? `Interview messages and the draft article are sent through OpenRouter to Phala, which runs the open model ${openrouter.openrouterModel()} inside a GPU trusted execution environment. OpenRouter sees the text in transit and does not pass Phala's attestation or signed receipts to this app, so the TEE claim rests on routing, not on evidence this app verified. The server operator can read the text too.`
          : `Interview messages and the draft article are sent to OpenRouter, which forwards them to ${openrouter.openrouterProvider()} running the open model ${openrouter.openrouterModel()}. Those companies receive the full text, and the server operator can read it too: this is not confidential compute.`,
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
    disclosure:
      "No AI backend is configured. Set PHALA_API_KEY (attested GPU TEE), OPENROUTER_API_KEY (hosted open model), OLLAMA_BASE_URL (local open model), or GEMINI_API_KEY (Google).",
  };
}

/** Like aiInfo() but performs the attestation check first when the provider is phala. */
export async function aiInfoVerified(): Promise<AiInfo> {
  if (aiProvider() === "phala") return phalaInfo(await verifyAttestation());
  return aiInfo();
}

export function aiConfigured() {
  return aiProvider() !== "none";
}

export async function aiReachable() {
  const provider = aiProvider();
  if (provider === "phala") return (await verifyAttestation()).verified;
  if (provider === "ollama") return ollama.ollamaReachable();
  return provider === "gemini" || provider === "openrouter";
}

export function conductInterviewStream(messages: ChatMessage[], credential: VerifiedCredential): Promise<ReadableStream<Uint8Array>> {
  const provider = aiProvider();
  if (provider === "phala") return phala.conductInterviewStream(messages, credential);
  if (provider === "ollama") return ollama.conductInterviewStream(messages, credential);
  if (provider === "openrouter") return openrouter.conductInterviewStream(messages, credential);
  if (provider === "gemini") return gemini.conductInterviewStream(messages, credential);
  return Promise.reject(new Error("No AI backend is configured"));
}

export function generateArticle(messages: ChatMessage[], credential: VerifiedCredential): Promise<ArticleDraft> {
  const provider = aiProvider();
  if (provider === "phala") return phala.generateArticle(messages, credential);
  if (provider === "ollama") return ollama.generateArticle(messages, credential);
  if (provider === "openrouter") return openrouter.generateArticle(messages, credential);
  if (provider === "gemini") return gemini.generateArticle(messages, credential);
  return Promise.reject(new Error("No AI backend is configured"));
}
