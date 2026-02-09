#!/usr/bin/env bun

import { handleGenerateHtml } from "../src/apps/chats/tools/generateHtmlHandler";
import type { ToolContext } from "../src/apps/chats/tools/types";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

type ToolResult = Parameters<ToolContext["addToolResult"]>[0];

const createContext = (results: ToolResult[]): ToolContext => ({
  launchApp: () => "instance",
  addToolResult: (result) => {
    results.push(result);
  },
  detectUserOS: () => "Linux",
  translate: (key) => key,
});

export async function runChatGenerateHtmlHandlerTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Generate HTML Handler Tests"));

  console.log(section("Validation"));
  await runTest("emits translated error for empty html payload", async () => {
    const results: ToolResult[] = [];
    const context = createContext(results);

    await handleGenerateHtml({ html: "  " }, "tc-1", context);
    assertEq(results.length, 1);
    assertEq((results[0] as { state?: string }).state, "output-error");
    assertEq(
      (results[0] as { errorText?: string }).errorText,
      "apps.chats.toolCalls.noContentProvided",
    );
  });

  console.log(section("Valid payload behavior"));
  await runTest("emits success output for non-empty html", async () => {
    const results: ToolResult[] = [];
    const context = createContext(results);

    await handleGenerateHtml({ html: "<div>hello</div>" }, "tc-2", context);
    assertEq(results.length, 1);
    assertEq(
      (results[0] as { output?: unknown }).output,
      "apps.chats.toolCalls.generatedHtml",
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runChatGenerateHtmlHandlerTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
