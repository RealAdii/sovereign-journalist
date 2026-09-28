import { describe, expect, it } from "vitest";
import { parseArticleResponse } from "@/lib/gemini";

describe("parseArticleResponse", () => {
  it("strips fences, ignores extra fields such as confidence scores, and fixes statuses", () => {
    const raw = '```json\n{"title":"T","subtitle":"S","body":"B","confidenceScore":88,"tags":["x"]}\n```';
    const article = parseArticleResponse(raw);
    expect(article).toEqual({
      version: 1,
      title: "T",
      subtitle: "S",
      body: "B",
      sourceStatus: "credential-proven",
      allegationStatus: "reported",
    });
    expect(JSON.stringify(article)).not.toContain("confidence");
  });

  it("rejects a draft without a title or body", () => {
    expect(() => parseArticleResponse('{"title":"","body":"x"}')).toThrow();
    expect(() => parseArticleResponse("not json")).toThrow();
  });
});
