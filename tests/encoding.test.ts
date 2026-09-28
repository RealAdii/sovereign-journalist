import { describe, expect, it } from "vitest";
import {
  ARTICLE_LIMITS,
  ArticleValidationError,
  articleDigest,
  decodeText,
  encodeText,
  expectedChunkCount,
  publishCalldata,
  validateArticle,
} from "@/lib/onchain";
import type { ArticleDraft } from "@/lib/types";

const draft = (over: Partial<ArticleDraft> = {}): ArticleDraft => ({
  version: 1,
  title: "A title",
  subtitle: "A subtitle",
  body: "Body text with **bold** and a [link](https://example.org).",
  sourceStatus: "credential-proven",
  allegationStatus: "reported",
  ...over,
});

describe("31-byte chunk encoding", () => {
  it("round trips text that starts with NUL bytes and crosses chunk boundaries with multibyte characters", () => {
    const samples = [
      "",
      "a",
      "\u0000\u0000leading nul bytes",
      "x".repeat(31),
      "x".repeat(32),
      "y".repeat(30) + "é" + "z".repeat(40),
      "日本語のテキストが31バイト境界をまたぐ場合の検証です。" + "😀".repeat(20),
      "\u0000".repeat(31) + "after all-zero chunk",
      "line one\nline two\r\nline three\ttab",
    ];
    for (const sample of samples) {
      const { byteLength, chunks } = encodeText(sample);
      expect(chunks.length).toBe(expectedChunkCount(byteLength));
      expect(decodeText(chunks, byteLength)).toBe(sample.normalize("NFC"));
    }
  });

  it("chunk count matches the contract formula (n + 30) / 31", () => {
    for (const n of [0, 1, 30, 31, 32, 61, 62, 63, 24576]) {
      expect(expectedChunkCount(n)).toBe(n === 0 ? 0 : Math.floor((n + 30) / 31));
    }
  });

  it("rejects a chunk list that does not match the declared length", () => {
    expect(() => decodeText(["0x61"], 40)).toThrow();
  });

  it("produces calldata in the contract's argument order", () => {
    const { calldata, byteLengths } = publishCalldata(draft({ title: "ab", subtitle: "", body: "c" }));
    const digest = calldata[0];
    expect(calldata[1]).toBe(digest);
    expect(calldata.slice(2)).toEqual(["2", "1", "0x6162", "0", "0", "1", "1", "0x63"]);
    expect(byteLengths).toEqual({ title: 2, subtitle: 0, body: 1 });
  });
});

describe("article digest", () => {
  it("is deterministic, 31 bytes wide, and changes when any field changes", () => {
    const a = articleDigest(draft());
    expect(a).toMatch(/^0x[0-9a-f]{62}$/);
    expect(articleDigest(draft())).toBe(a);
    expect(articleDigest(draft({ body: draft().body + " " + "edit" }))).not.toBe(a);
    expect(articleDigest(draft({ title: "Different" }))).not.toBe(a);
  });

  it("normalizes to NFC and trims so equivalent text has the same id", () => {
    expect(articleDigest(draft({ title: "café " }))).toBe(articleDigest(draft({ title: "café" })));
  });
});

describe("limits", () => {
  it("rejects a body over the onchain limit with a useful error", () => {
    const body = "x".repeat(ARTICLE_LIMITS.body + 5);
    try {
      validateArticle(draft({ body }));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ArticleValidationError);
      const e = error as ArticleValidationError;
      expect(e.field).toBe("body");
      expect(e.size).toBe(ARTICLE_LIMITS.body + 5);
      expect(e.message).toContain("Shorten it by at least 5 bytes");
    }
  });

  it("counts bytes, not characters", () => {
    const title = "😀".repeat(46); // 184 bytes
    expect(() => validateArticle(draft({ title }))).toThrow(/184 bytes/);
  });

  it("requires a title and a body", () => {
    expect(() => validateArticle(draft({ title: "   " }))).toThrow(/title is required/);
    expect(() => validateArticle(draft({ body: "" }))).toThrow(/body is required/);
  });
});
