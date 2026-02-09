#!/usr/bin/env bun

import { handleChatGenerateHtmlToolCall } from "../src/apps/chats/utils/chatGenerateHtmlToolHandler";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

type ToolResult =
  | { tool: string; toolCallId: string; output: unknown; state?: "output-available" }
  | { tool: string; toolCallId: string; state: "output-error"; errorText: string };

const t = (key: string): string => key;

const createCollector = () => {
  const results: ToolResult[] = [];
  return {
    results,
    addToolResult: (result: ToolResult) => {
      results.push(result);
    },
  };
};

export async function runChatGenerateHtmlToolHandlerTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Generate HTML Tool Handler Tests"));

  console.log(section("Validation"));
  await runTest("emits output-error when html payload is missing", async () => {
    const collector = createCollector();
    handleChatGenerateHtmlToolCall({
      html: "",
      toolName: "generateHtml",
      toolCallId: "tc-1",
      addToolResult: collector.addToolResult,
      t,
    });

    assertEq(collector.results.length, 1);
    assertEq((collector.results[0] as { state?: string }).state, "output-error");
    assertEq(
      (collector.results[0] as { errorText?: string }).errorText,
      "apps.chats.toolCalls.noContentProvided",
    );
  });

  console.log(section("Valid payload behavior"));
  await runTest("does not emit tool error for non-empty html", async () => {
    const collector = createCollector();
    handleChatGenerateHtmlToolCall({
      html: "<div>hello</div>",
      toolName: "generateHtml",
      toolCallId: "tc-2",
      addToolResult: collector.addToolResult,
      t,
    });

    assertEq(collector.results.length, 0);
  });

  return printSummary();
}

if (import.meta.main) {
  runChatGenerateHtmlToolHandlerTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
