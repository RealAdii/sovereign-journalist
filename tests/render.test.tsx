import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ArticleBody from "@/app/article/[id]/ArticleBody";

const fixture = `## Heading

| Element | Hidden | Visible |
| --- | --- | --- |
| \`inline code\` | **bold** | [link](https://example.org) |

- item one
- item two`;

describe("rendered article markdown", () => {
  it("renders GFM tables, inline code, bold, links and lists as HTML, not leaked syntax", () => {
    const html = renderToStaticMarkup(<ArticleBody content={fixture} />);
    expect(html).toContain("<table>");
    expect(html).toContain("<code>inline code</code>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://example.org">link</a>');
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).not.toMatch(/\| --- \|/);
    expect(html).not.toContain("**bold**");
    expect(html).not.toContain("[link](");
  });
});
