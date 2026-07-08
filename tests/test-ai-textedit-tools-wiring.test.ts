#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const vfsHandlersSource = readFileSync(
  "src/apps/chats/tools/vfsHandlers.ts",
  "utf8"
);
const textEditAppSource = readFileSync(
  "src/apps/textedit/components/TextEditAppComponent.tsx",
  "utf8"
);
const editorProviderSource = readFileSync(
  "src/apps/textedit/components/EditorProvider.tsx",
  "utf8"
);

describe("AI TextEdit tool wiring", () => {
  test("AI write/edit tools convert markdown through the GFM-aware pipeline", () => {
    // The legacy markdownToHtml converter drops GFM tables and inline links,
    // which made AI-authored content render as raw markdown text.
    expect(vfsHandlersSource).toContain(
      'import { markdownToSafeHtml } from "@/apps/textedit/utils/markdownPaste"'
    );
    expect(vfsHandlersSource).not.toContain("markdownToHtml(");
  });

  test("AI edits to an open document become a pending save, not a silent disk write", () => {
    expect(vfsHandlersSource).toContain("hasUnsavedChanges: true");
    // The edit tool must source content from the live buffer when the doc is
    // open so consecutive AI edits and unsaved user edits are not clobbered.
    expect(vfsHandlersSource).toContain("getInstanceIdByPath(path)");
    expect(vfsHandlersSource).toContain("generateHtmlFromJson");
  });

  test("AI tool reads strip the rich-markdown metadata comment", () => {
    expect(vfsHandlersSource).toContain("storedDocumentToMarkdown");
    expect(vfsHandlersSource).toContain("parseRichMarkdown");
  });

  test("store-driven merges preserve the unsaved flag set by the updater", () => {
    // The contentJson sync effect must not force hasUnsavedChanges(false),
    // otherwise the AI edit tool's pending-save state is immediately cleared.
    const effectStart = textEditAppSource.indexOf(
      "// Sync editor when contentJson is externally updated"
    );
    expect(effectStart).toBeGreaterThan(-1);
    const effectSource = textEditAppSource.slice(
      effectStart,
      textEditAppSource.indexOf("}, [contentJson, editor]", effectStart)
    );
    expect(effectSource).toContain("mergeEditorContent(editor, contentJson)");
    expect(effectSource).not.toContain("setHasUnsavedChanges");
  });

  test("TextEdit links open on click", () => {
    expect(editorProviderSource).toContain("openOnClick: true");
  });
});
