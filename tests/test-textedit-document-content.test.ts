#!/usr/bin/env bun

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { persistedContentToEditorContent } from "../src/apps/textedit/utils/documentContent";
import { serializeRichMarkdown } from "../src/apps/textedit/utils/richMarkdown";

function stringifyContent(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
  }
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("TextEdit persisted document conversion", () => {
  test("sanitizes imported HTML before the editor ingests it", () => {
    const content = persistedContentToEditorContent(
      "/Documents/import.html",
      `<h1>Hello</h1>
<script>alert("script")</script>
<p onclick="alert('event')">Body</p>
<a href="javascript:alert('link')">unsafe</a>
<a href="https://os.ryo.lu">safe</a>`
    );

    const html = stringifyContent(content);
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain('href="https://os.ryo.lu"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  test("escapes plain text instead of treating it as HTML", () => {
    const content = persistedContentToEditorContent(
      "/Documents/notes.txt",
      "literal <script>alert('x')</script>\nnext & done"
    );

    const html = stringifyContent(content);
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).toContain("next &amp; done");
    expect(html).not.toContain("<script>");
  });

  test("drops unsafe links from embedded rich Markdown editor JSON", () => {
    const persisted = serializeRichMarkdown("unsafe and safe", {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "unsafe",
              marks: [
                {
                  type: "link",
                  attrs: { href: "javascript:alert('x')" },
                },
              ],
            },
            {
              type: "text",
              text: " safe",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://os.ryo.lu" },
                },
              ],
            },
          ],
        },
      ],
    });

    const content = persistedContentToEditorContent("/Documents/rich.md", persisted);
    const json = stringifyContent(content);
    expect(json).toContain("https://os.ryo.lu");
    expect(json).not.toContain("javascript:");
  });
});
