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

  test("AI edits always persist to disk immediately", () => {
    // Pending-save is reserved for user keystrokes. AI edits write through
    // persistChatDocument and clear the dirty flag on any open instance.
    expect(vfsHandlersSource).toContain("persistChatDocument({");
    expect(vfsHandlersSource).toContain("hasUnsavedChanges: false");
    expect(vfsHandlersSource).not.toContain("hasUnsavedChanges: true");
    expect(vfsHandlersSource).not.toContain("generateHtmlFromJson");
  });

  test("AI tool reads strip the rich-markdown metadata comment", () => {
    expect(vfsHandlersSource).toContain("storedDocumentToMarkdown");
    expect(vfsHandlersSource).toContain("parseRichMarkdown");
  });

  test("store-driven merges clear the dirty flag for already-persisted AI updates", () => {
    const effectStart = textEditAppSource.indexOf(
      "// Sync editor when contentJson is externally updated"
    );
    expect(effectStart).toBeGreaterThan(-1);
    const effectSource = textEditAppSource.slice(
      effectStart,
      textEditAppSource.indexOf("}, [contentJson, editor", effectStart)
    );
    expect(effectSource).toContain("mergeEditorContent(editor, contentJson)");
    expect(effectSource).toContain("setHasUnsavedChanges(false)");
  });

  test("TextEdit links open on click", () => {
    expect(editorProviderSource).toContain("openOnClick: true");
  });
});
