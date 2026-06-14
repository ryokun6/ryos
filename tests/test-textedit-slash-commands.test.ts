#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import type { Editor } from "@tiptap/core";
import {
  executeSlashCommand,
  getNextSlashCommandIndex,
  getSlashMenuPosition,
  getSlashCommandItems,
  type SlashCommandItem,
} from "../src/apps/textedit/utils/slashCommandUtils";

describe("TextEdit slash commands", () => {
  test("matches commands by aliases used in the help text", () => {
    expect(getSlashCommandItems("h1").map((item) => item.key)).toContain(
      "heading1"
    );
    expect(getSlashCommandItems("todo").map((item) => item.key)).toContain(
      "taskList"
    );
    expect(getSlashCommandItems("ol").map((item) => item.key)).toContain(
      "numberedList"
    );
  });

  test("keeps keyboard navigation index stable with no results", () => {
    expect(getSlashCommandItems("definitely-not-a-command")).toEqual([]);
    expect(getNextSlashCommandIndex(0, 0, 1)).toBe(0);
    expect(getNextSlashCommandIndex(0, 0, -1)).toBe(0);
  });

  test("positions the menu directly under the cursor rect", () => {
    expect(
      getSlashMenuPosition(
        { top: 120, left: 240, height: 18 },
        { viewportWidth: 1000 }
      )
    ).toEqual({ top: 142, left: 240 });
  });

  test("clamps menu position inside narrow viewports", () => {
    expect(
      getSlashMenuPosition(
        { top: 20, left: 450, height: 16 },
        { viewportWidth: 500, menuWidth: 288 }
      )
    ).toEqual({ top: 40, left: 204 });
  });

  test("deletes slash query before applying the selected command", () => {
    const calls: string[] = [];
    const editor = {
      chain: () => ({
        focus() {
          calls.push("focus");
          return this;
        },
        deleteRange(range: { from: number; to: number }) {
          calls.push(`delete:${range.from}-${range.to}`);
          return this;
        },
        run() {
          calls.push("run-delete");
          return true;
        },
      }),
    } as unknown as Editor;
    const item: SlashCommandItem = {
      key: "heading1",
      title: "Heading 1",
      description: "Large section heading",
      aliases: ["h1"],
      command: () => {
        calls.push("apply-command");
      },
    };

    executeSlashCommand(editor, { from: 1, to: 4 }, item);

    expect(calls).toEqual(["focus", "delete:1-4", "run-delete", "apply-command"]);
  });
});
