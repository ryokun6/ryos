#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import * as analytics from "../../../src/utils/analytics";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("client analytics wiring", () => {
  test("does not import or render Vercel Analytics", () => {
    const files = [
      "package.json",
      "bun.lock",
      "src/main.tsx",
      "src/utils/analytics.ts",
      "src/stores/useAppStore.ts",
      "src/apps/chats/components/ChatInput.tsx",
      "src/apps/terminal/hooks/useTerminalLogic.ts",
      "src/apps/terminal/commands/ai.ts",
    ];

    for (const file of files) {
      const source = readSource(file);
      expect(source.includes("@vercel" + "/analytics")).toBe(false);
    }

    const main = readSource("src/main.tsx");
    expect(main.includes("<Analytics")).toBe(false);
    expect(main.includes("initializeAnalytics")).toBe(true);
  });

  test("exports first-party analytics SDK functions", () => {
    for (const name of [
      "track",
      "initializeAnalytics",
      "flushAnalytics",
      "getTextAnalytics",
      "normalizeUrlForAnalytics",
    ] as const) {
      expect(typeof analytics[name]).toBe("function");
    }
  });

  test("does not send raw chat messages or terminal prompts", () => {
    expect(readSource("src/apps/chats/components/ChatInput.tsx")).not.toContain(
      "message: input"
    );
    expect(readSource("src/apps/terminal/hooks/useTerminalLogic.ts")).not.toContain(
      "prompt: command"
    );
    expect(readSource("src/apps/terminal/commands/ai.ts")).not.toContain(
      "track(TERMINAL_ANALYTICS.AI_COMMAND, { prompt:"
    );
  });
});
