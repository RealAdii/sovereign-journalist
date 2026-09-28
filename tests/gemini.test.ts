import { describe, expect, it } from "vitest";
import { ensureRequiredSections, parseArticleResponse, PROVEN_HEADING, UNCORROBORATED_HEADING } from "@/lib/prompts";

describe("parseArticleResponse", () => {
  it("strips fences, ignores extra fields such as confidence scores, and fixes statuses", () => {
    const raw = '```json\n{"title":"T","subtitle":"S","body":"B","confidenceScore":88,"tags":["x"]}\n```';
    const article = parseArticleResponse(raw);
    expect(article).toMatchObject({
      version: 1,
      title: "T",
      subtitle: "S",
      sourceStatus: "credential-proven",
      allegationStatus: "reported",
    });
    expect(article.body.startsWith("B")).toBe(true);
    expect(JSON.stringify(article)).not.toContain("confidence");
  });

  it("rejects a draft without a title or body", () => {
    expect(() => parseArticleResponse('{"title":"","body":"x"}')).toThrow();
    expect(() => parseArticleResponse("not json")).toThrow();
  });
});

describe("required honesty sections", () => {
  it("keeps model-written sections and appends missing ones with fixed wording", () => {
    const complete = "## Account\n\ntext\n\n## What has been proven\n\nok\n\n## What has not been independently corroborated\n\nall";
    expect(ensureRequiredSections(complete)).toBe(complete);
    const missing = ensureRequiredSections("## Account\n\ntext");
    expect(missing).toContain(PROVEN_HEADING);
    expect(missing).toContain(UNCORROBORATED_HEADING);
    expect(missing.indexOf(PROVEN_HEADING)).toBeLessThan(missing.indexOf(UNCORROBORATED_HEADING));
    expect(missing).toMatch(/None of it has been independently corroborated/);
    const article = parseArticleResponse('{"title":"T","subtitle":"S","body":"Only an account."}');
    expect(article.body).toContain(PROVEN_HEADING);
    expect(article.body.split(PROVEN_HEADING).length).toBe(2);
    expect(article.body).not.toMatch(/[—–]/);
  });

  it("matches headings case-insensitively and at any heading level", () => {
    const body = "### what has been PROVEN\n\nx\n\n# What Has Not Been Independently Corroborated\n\ny";
    expect(ensureRequiredSections(body)).toBe(body);
  });
});
