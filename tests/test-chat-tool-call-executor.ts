#!/usr/bin/env bun

import { executeChatToolCall } from "../src/apps/chats/utils/chatToolCallExecutor";
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

const baseToolContext: ToolContext = {
  launchApp: () => "instance",
  addToolResult: () => {},
  detectUserOS: () => "Linux",
};

const t = (key: string): string => key;

export async function runChatToolCallExecutorTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Tool Call Executor Tests"));

  console.log(section("Successful execution"));
  await runTest("does not emit tool errors when execution succeeds", async () => {
    const results: ToolResult[] = [];
    await executeChatToolCall({
      toolCall: {
        toolName: "settings",
        toolCallId: "tc-1",
        input: { language: "en" },
      },
      toolContext: baseToolContext,
      addToolResult: (result) => {
        results.push(result);
      },
      t,
      executeTool: async () => true,
    });

    assertEq(results.length, 0);
  });

  console.log(section("Unknown tool behavior"));
  await runTest("emits unknown-error output when tool is not registered", async () => {
    const results: ToolResult[] = [];
    await executeChatToolCall({
      toolCall: {
        toolName: "missing-tool",
        toolCallId: "tc-2",
        input: {},
      },
      toolContext: baseToolContext,
      addToolResult: (result) => {
        results.push(result);
      },
      t,
      executeTool: async () => false,
    });

    assertEq(results.length, 1);
    assertEq((results[0] as { state?: string }).state, "output-error");
    assertEq(
      (results[0] as { errorText?: string }).errorText,
      "apps.chats.toolCalls.unknownError",
    );
  });

  console.log(section("Error propagation"));
  await runTest("emits thrown error message as tool output-error", async () => {
    const results: ToolResult[] = [];
    await executeChatToolCall({
      toolCall: {
        toolName: "throws",
        toolCallId: "tc-3",
        input: {},
      },
      toolContext: baseToolContext,
      addToolResult: (result) => {
        results.push(result);
      },
      t,
      executeTool: async () => {
        throw new Error("tool crashed");
      },
    });

    assertEq(results.length, 1);
    assertEq((results[0] as { state?: string }).state, "output-error");
    assertEq((results[0] as { errorText?: string }).errorText, "tool crashed");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatToolCallExecutorTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
