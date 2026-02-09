#!/usr/bin/env bun

import {
  handleLaunchApp,
  handleCloseApp,
} from "../src/apps/chats/tools/appHandlers";
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

const createToolContext = () => {
  const toolResults: ToolResult[] = [];
  const launches: Array<{ appId: string; options?: unknown }> = [];
  const context: ToolContext = {
    launchApp: (appId, options) => {
      launches.push({ appId, options });
      return "instance-1";
    },
    addToolResult: (result) => {
      toolResults.push(result);
    },
    detectUserOS: () => "Linux",
  };

  return {
    context,
    launches,
    toolResults,
  };
};

export async function runChatAppHandlersTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat App Handlers Tests"));

  console.log(section("Launch app handler"));
  await runTest("emits error when app id is missing", async () => {
    const { context, toolResults } = createToolContext();
    const result = handleLaunchApp({ id: "" }, "tc-1", context, {
      translate: () => "No app ID provided",
    });

    assertEq(result, "");
    assertEq(toolResults.length, 1);
    assertEq((toolResults[0] as { state?: string }).state, "output-error");
  });

  await runTest("emits error when app id is invalid", async () => {
    const { context, toolResults } = createToolContext();
    const result = handleLaunchApp({ id: "not-an-app" }, "tc-2", context);

    assertEq(result, "");
    assertEq(toolResults.length, 1);
    assertEq((toolResults[0] as { errorText?: string }).errorText, "Application not found: not-an-app");
  });

  await runTest("launches internet explorer with url/year payload", async () => {
    const { context, launches } = createToolContext();
    const result = handleLaunchApp(
      { id: "internet-explorer", url: "https://example.com", year: "2003" },
      "tc-3",
      context,
    );

    assertEq(launches.length, 1);
    assertEq(launches[0]?.appId, "internet-explorer");
    assertEq(
      result,
      "Launched Internet Explorer to https://example.com in 2003",
    );
  });

  console.log(section("Close app handler"));
  await runTest("emits error for invalid app id", async () => {
    const { context, toolResults } = createToolContext();
    const result = handleCloseApp({ id: "missing-app" }, "tc-4", context);

    assertEq(result, "");
    assertEq(toolResults.length, 1);
    assertEq((toolResults[0] as { errorText?: string }).errorText, "Application not found: missing-app");
  });

  await runTest("emits error when close dependencies are unavailable", async () => {
    const { context, toolResults } = createToolContext();
    const result = handleCloseApp({ id: "chats" }, "tc-5", context);

    assertEq(result, "");
    assertEq(toolResults.length, 1);
    assertEq((toolResults[0] as { errorText?: string }).errorText, "Close app dependencies unavailable");
  });

  await runTest("closes all open windows and reports success", async () => {
    const { context } = createToolContext();
    const closedIds: string[] = [];
    const result = handleCloseApp(
      { id: "chats" },
      "tc-6",
      context,
      {
        getInstancesByAppId: () => [
          { instanceId: "a", isOpen: true },
          { instanceId: "b", isOpen: false },
          { instanceId: "c", isOpen: true },
        ],
        closeWindowByInstanceId: (instanceId) => {
          closedIds.push(instanceId);
        },
      },
    );

    assertEq(result, "Closed Chats");
    assertEq(closedIds.length, 2);
    assertEq(closedIds[0], "a");
    assertEq(closedIds[1], "c");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatAppHandlersTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
