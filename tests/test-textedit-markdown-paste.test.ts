#!/usr/bin/env bun

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { Editor } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";
import { handleMarkdownPaste } from "../src/apps/textedit/extensions/MarkdownPaste";
import {
  getMarkdownTextForPaste,
  isMeaningfulMarkdown,
  markdownToSafeHtml,
} from "../src/apps/textedit/utils/markdownPaste";
import {
  parseRichMarkdown,
  serializeRichMarkdown,
} from "../src/apps/textedit/utils/richMarkdown";
import { htmlToMarkdown } from "../src/utils/markdown";
import {
  generateHtmlFromJsonSync,
  generateJsonFromHtml,
} from "../src/utils/tiptapHtml";

const DEBUG_SNAPSHOT = `# Live Debug Dashboard

## Runtime

| Metric | Value |
| --- | --- |
| Log buffer | 41 / 1000 |
| Heap used | 24.6 MB |
| Viewport | 1440 × 900 |`;

function hasNodeType(content: unknown, type: string): boolean {
  if (!content || typeof content !== "object") {
    return false;
  }
  if ("type" in content && content.type === type) {
    return true;
  }
  if (!("content" in content) || !Array.isArray(content.content)) {
    return false;
  }

  return content.content.some((child) => hasNodeType(child, type));
}

function clipboardData(values: Record<string, string>) {
  return {
    getData(format: string): string {
      return values[format] || "";
    },
  };
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

describe("TextEdit Markdown paste detection", () => {
  test("detects the Live debug dashboard snapshot and its GFM table", () => {
    expect(isMeaningfulMarkdown(DEBUG_SNAPSHOT)).toBe(true);

    const html = markdownToSafeHtml(DEBUG_SNAPSHOT);
    expect(html).toContain("<h1>Live Debug Dashboard</h1>");
    expect(html).toContain("<h2>Runtime</h2>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Metric</th>");
    expect(html).toContain("<td>41 / 1000</td>");
  });

  test("leaves ordinary plain text on the native paste path", () => {
    const plainText =
      "Runtime status is healthy.\nPipes | and #hashtags are ordinary prose here.";
    expect(isMeaningfulMarkdown(plainText)).toBe(false);
    expect(
      getMarkdownTextForPaste(
        clipboardData({ "text/plain": plainText })
      )
    ).toBeNull();
  });

  test("detects lists, fenced code, blockquotes, and links", () => {
    const markdown = `- first
- second

> quoted

\`\`\`ts
const ready = true;
\`\`\`

[ryOS](https://os.ryo.lu)`;

    expect(isMeaningfulMarkdown(markdown)).toBe(true);
    const html = markdownToSafeHtml(markdown);
    expect(html).toContain("<ul>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<pre><code>");
    expect(html).toContain('href="https://os.ryo.lu"');
  });

  test("does not override a clipboard's existing rich HTML", () => {
    expect(
      getMarkdownTextForPaste(
        clipboardData({
          "text/html": "<h1>Already rich</h1>",
          "text/plain": "# Already rich",
        })
      )
    ).toBeNull();

    expect(
      getMarkdownTextForPaste(
        clipboardData({ "text/plain": "# Plain Markdown" })
      )
    ).toBe("# Plain Markdown");
  });

  test("inserts parsed Markdown through the TipTap paste handler", () => {
    const editor = new Editor({
      content: "<p>Before</p>",
      extensions: [
        StarterKit,
        Link,
        Table,
        TableRow,
        TableHeader,
        TableCell,
      ],
    });

    try {
      editor.commands.setTextSelection(editor.state.doc.content.size);
      const data = new DataTransfer();
      data.setData("text/plain", DEBUG_SNAPSHOT);
      const event = new ClipboardEvent("paste", { clipboardData: data });

      expect(handleMarkdownPaste(editor.view, event)).toBe(true);
      expect(hasNodeType(editor.getJSON(), "table")).toBe(true);
      expect(editor.getHTML()).toContain("<h1>Live Debug Dashboard</h1>");
    } finally {
      editor.destroy();
    }
  });

  test("keeps a Markdown link inline at the current cursor", () => {
    const editor = new Editor({
      content: "<p>Visit:</p>",
      extensions: [StarterKit, Link],
    });

    try {
      editor.commands.setTextSelection(editor.state.doc.content.size);
      const data = new DataTransfer();
      data.setData("text/plain", "[ryOS](https://os.ryo.lu)");
      const event = new ClipboardEvent("paste", { clipboardData: data });

      expect(handleMarkdownPaste(editor.view, event)).toBe(true);
      expect(editor.getHTML()).toBe(
        '<p>Visit:<a target="_blank" rel="noopener noreferrer nofollow" href="https://os.ryo.lu">ryOS</a></p>'
      );
    } finally {
      editor.destroy();
    }
  });
});

describe("TextEdit Markdown paste security and persistence", () => {
  test("drops raw HTML, event handlers, and unsafe link protocols", () => {
    const html = markdownToSafeHtml(`# Safe

<script>alert("script")</script>
<img src="x" onerror="alert('event')">
<a href="javascript:alert('raw')" onclick="alert('event')">raw link</a>

[unsafe](javascript:alert('markdown'))
[data](data:text/html;base64,PHNjcmlwdD4=)
[safe](https://os.ryo.lu)`);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('href="https://os.ryo.lu"');
  });

  test("converts tables into TipTap JSON and round-trips rich metadata", async () => {
    const editorJson = await generateJsonFromHtml(
      markdownToSafeHtml(DEBUG_SNAPSHOT)
    );
    expect(hasNodeType(editorJson, "table")).toBe(true);
    expect(hasNodeType(editorJson, "tableHeader")).toBe(true);
    expect(hasNodeType(editorJson, "tableCell")).toBe(true);

    const persisted = serializeRichMarkdown(
      htmlToMarkdown(generateHtmlFromJsonSync(editorJson) || ""),
      editorJson
    );
    const reopened = parseRichMarkdown(persisted);
    expect(hasNodeType(reopened.editorJson, "table")).toBe(true);

    const exportedMarkdown = reopened.markdown;
    expect(exportedMarkdown).toContain(
      "| Metric | Value |\n| --- | --- |\n| Log buffer | 41 / 1000 |"
    );
  });
});
