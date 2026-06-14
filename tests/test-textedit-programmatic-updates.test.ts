#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEXTEDIT_APP_COMPONENT = readFileSync(
  join(import.meta.dir, "../src/apps/textedit/components/TextEditAppComponent.tsx"),
  "utf8"
);
const SLASH_COMMANDS_EXTENSION = readFileSync(
  join(import.meta.dir, "../src/apps/textedit/extensions/SlashCommands.tsx"),
  "utf8"
);
const FILE_OPERATIONS = readFileSync(
  join(import.meta.dir, "../src/apps/textedit/hooks/useFileOperations.ts"),
  "utf8"
);
const MERGE_EDITOR_CONTENT = readFileSync(
  join(import.meta.dir, "../src/apps/textedit/utils/mergeEditorContent.ts"),
  "utf8"
);

describe("TextEdit programmatic editor updates", () => {
  test("external document updates merge through the cursor-preserving helper", () => {
    // External updates must not directly replace content (which would reset the
    // caret); they go through mergeEditorContent instead.
    expect(TEXTEDIT_APP_COMPONENT).not.toContain(
      "editor.commands.setContent(jsonContent);"
    );
    expect(TEXTEDIT_APP_COMPONENT).not.toContain(
      "editor.commands.setContent(jsonContent, false);"
    );
    expect(TEXTEDIT_APP_COMPONENT).toContain("mergeEditorContent(editor");
    expect(TEXTEDIT_APP_COMPONENT).toContain("applyExternalUpdate(jsonContent)");
  });

  test("external merge transactions are ignored by the dirty-state tracker", () => {
    expect(TEXTEDIT_APP_COMPONENT).toContain('transaction?.getMeta("external")');
  });

  test("merge helper tags external, non-undoable transactions", () => {
    expect(MERGE_EDITOR_CONTENT).toContain('tr.setMeta("external", true)');
    expect(MERGE_EDITOR_CONTENT).toContain('tr.setMeta("addToHistory", false)');
    expect(MERGE_EDITOR_CONTENT).toContain("findDiffStart");
    expect(MERGE_EDITOR_CONTENT).toContain("findDiffEnd");
  });

  test("new-file and pending-file loads are silent editor updates", () => {
    expect(TEXTEDIT_APP_COMPONENT).not.toContain("editor.commands.clearContent();");
    expect(TEXTEDIT_APP_COMPONENT).not.toContain(
      "editor.commands.setContent(processedContent);"
    );
    expect(TEXTEDIT_APP_COMPONENT).toContain("editor.commands.clearContent(false);");
    expect(TEXTEDIT_APP_COMPONENT).toContain(
      "editor.commands.setContent(processedContent, false);"
    );
  });

  test("device imports load cleanly after saving", () => {
    expect(FILE_OPERATIONS).not.toContain("editor.commands.setContent(editorContent);");
    expect(FILE_OPERATIONS).toContain(
      "editor.commands.setContent(editorContent, false);"
    );
  });

  test("slash menu anchors DropdownMenu to the cursor instead of using triggerless popper", () => {
    expect(SLASH_COMMANDS_EXTENSION).toContain("<DropdownMenu");
    expect(SLASH_COMMANDS_EXTENSION).toContain("open");
    expect(SLASH_COMMANDS_EXTENSION).toContain("modal={false}");
    expect(SLASH_COMMANDS_EXTENSION).toContain("<DropdownMenuTrigger asChild>");
    expect(SLASH_COMMANDS_EXTENSION).toContain("<DropdownMenuContent");
    expect(SLASH_COMMANDS_EXTENSION).toContain("getSlashMenuPosition(rect)");
    expect(SLASH_COMMANDS_EXTENSION).toContain('position: "fixed"');
    expect(SLASH_COMMANDS_EXTENSION).toContain("onOpenChange={(open)");
    expect(SLASH_COMMANDS_EXTENSION).toContain("window.setTimeout(cleanup, 0);");
    expect(SLASH_COMMANDS_EXTENSION).toContain("cleanup();");
  });
});
