import { describe, expect, it, vi, afterEach } from "vitest";
import { ndjsonTextStream } from "@/lib/ollama";
import { aiInfo, aiProvider } from "@/lib/ai";

function streamOf(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("Ollama NDJSON stream parser", () => {
  it("joins JSON objects split across chunks and stops at done", async () => {
    const lines = [
      '{"model":"m","message":{"role":"assistant","content":"Hel"},"done":false}\n',
      '{"model":"m","message":{"role":"assistant","content":"lo, "},"done":false}\n',
      '{"model":"m","message":{"role":"assistant","content":"world"},"done":false}\n',
      '{"model":"m","message":{"role":"assistant","content":""},"done":true}\n',
    ].join("");
    // Split at awkward byte offsets, including inside a JSON object and a multibyte char.
    const chunks = [lines.slice(0, 17), lines.slice(17, 90), lines.slice(90, 91), lines.slice(91)];
    expect(await collect(ndjsonTextStream(streamOf(chunks)))).toBe("Hello, world");
  });

  it("handles a final line without a trailing newline and multibyte text", async () => {
    const text = '{"message":{"content":"日本語 😀"},"done":true}';
    const bytes = new TextEncoder().encode(text);
    const a = bytes.slice(0, 25);
    const b = bytes.slice(25);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(a);
        c.enqueue(b);
        c.close();
      },
    });
    expect(await collect(ndjsonTextStream(stream))).toBe("日本語 😀");
  });

  it("surfaces an error line as a stream error", async () => {
    await expect(collect(ndjsonTextStream(streamOf(['{"error":"model not found"}\n'])))).rejects.toThrow(/model not found/);
  });
});

describe("AI provider selection", () => {
  afterEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.GEMINI_API_KEY;
  });

  it("prefers the local model when both are configured and reports it as not external", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GEMINI_API_KEY = "x";
    expect(aiProvider()).toBe("ollama");
    const info = aiInfo();
    expect(info.external).toBe(false);
    expect(info.disclosure).toMatch(/No third-party AI provider receives the text/);
    expect(info.disclosure).toMatch(/operator can still read it/);
  });

  it("uses Gemini only when asked and discloses Google", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GEMINI_API_KEY = "x";
    process.env.AI_PROVIDER = "gemini";
    const info = aiInfo();
    expect(info.provider).toBe("gemini");
    expect(info.external).toBe(true);
    expect(info.disclosure).toMatch(/Google receives the full text/);
  });

  it("reports none when the requested backend is not configured", () => {
    process.env.AI_PROVIDER = "ollama";
    expect(aiProvider()).toBe("none");
    expect(aiInfo().disclosure).toMatch(/No AI backend is configured/);
  });

  it("never claims confidentiality for the local model", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    expect(aiInfo().disclosure).toMatch(/not confidential compute/);
  });
});
