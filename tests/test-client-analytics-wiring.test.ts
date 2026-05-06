#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

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
      expect(readSource(file).includes("@vercel/analytics")).toBe(false);
    }

    const main = readSource("src/main.tsx");
    expect(main.includes("<Analytics")).toBe(false);
    expect(main.includes("initializeAnalytics")).toBe(true);
  });

  test("exports first-party analytics SDK functions", () => {
    const source = readSource("src/utils/analytics.ts");
    expect(source.includes("export function track")).toBe(true);
    expect(source.includes("export function initializeAnalytics")).toBe(true);
    expect(source.includes("export async function flushAnalytics")).toBe(true);
    expect(source.includes("export function getTextAnalytics")).toBe(true);
    expect(source.includes("export function normalizeUrlForAnalytics")).toBe(true);
  });

  test("does not send raw chat messages or terminal prompts", () => {
    expect(readSource("src/apps/chats/components/ChatInput.tsx")).not.toContain(
      "message: input"
    );
    expect(readSource("src/apps/terminal/hooks/useTerminalLogic.ts")).not.toContain(
      "prompt: command"
    );
    expect(readSource("src/apps/terminal/commands/ai.ts")).not.toContain(
      "prompt: initialPrompt"
    );
  });
});
