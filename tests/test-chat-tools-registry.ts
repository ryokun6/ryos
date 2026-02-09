#!/usr/bin/env bun

import {
  executeToolHandler,
  hasToolHandler,
  getRegisteredTools,
} from "../src/apps/chats/tools";
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

const createContext = ({
  includeAppHandlers = false,
}: {
  includeAppHandlers?: boolean;
} = {}) => {
  const results: ToolResult[] = [];
  const launches: Array<{ appId: string; options?: unknown }> = [];
  const closedInstanceIds: string[] = [];
  const context: ToolContext = {
    launchApp: (appId, options) => {
      launches.push({ appId, options });
      return "instance";
    },
    addToolResult: (result) => {
      results.push(result);
    },
    detectUserOS: () => "Linux",
    translate: (key) => key,
    appHandlers: includeAppHandlers
      ? {
          translate: (key) => key,
          getInstancesByAppId: () => [
            { instanceId: "win-1", isOpen: true },
            { instanceId: "win-2", isOpen: false },
          ],
          closeWindowByInstanceId: (instanceId) => {
            closedInstanceIds.push(instanceId);
          },
        }
      : undefined,
  };
  return { context, results, launches, closedInstanceIds };
};

export async function runChatToolsRegistryTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Tools Registry Tests"));

  console.log(section("Registry presence"));
  await runTest("includes expected chat tool registrations", async () => {
    assertEq(hasToolHandler("aquarium"), true);
    assertEq(hasToolHandler("generateHtml"), true);
    assertEq(hasToolHandler("launchApp"), true);
    assertEq(hasToolHandler("list"), true);
    assertEq(getRegisteredTools().includes("edit"), true);
  });

  console.log(section("Execution behavior"));
  await runTest("executes aquarium handler through registry", async () => {
    const { context, results } = createContext();
    const executed = await executeToolHandler("aquarium", {}, "tc-aq", context);
    assertEq(executed, true);
    assertEq(results.length, 1);
    assertEq((results[0] as { tool?: string }).tool, "aquarium");
  });

  await runTest("executes generateHtml validation through registry", async () => {
    const { context, results } = createContext();
    const executed = await executeToolHandler(
      "generateHtml",
      { html: "" },
      "tc-html",
      context,
    );
    assertEq(executed, true);
    assertEq(results.length, 1);
    assertEq((results[0] as { state?: string }).state, "output-error");
  });

  await runTest("emits generateHtml success output through registry", async () => {
    const { context, results } = createContext();
    const executed = await executeToolHandler(
      "generateHtml",
      { html: "<div>ok</div>" },
      "tc-html-success",
      context,
    );
    assertEq(executed, true);
    assertEq(results.length, 1);
    assertEq(
      (results[0] as { output?: unknown }).output,
      "apps.chats.toolCalls.generatedHtml",
    );
  });

  await runTest("executes launchApp validation through registry", async () => {
    const { context, results } = createContext();
    const executed = await executeToolHandler(
      "launchApp",
      { id: "missing-app" },
      "tc-launch",
      context,
    );
    assertEq(executed, true);
    assertEq(results.length, 1);
    assertEq((results[0] as { state?: string }).state, "output-error");
  });

  await runTest("emits launchApp success output through registry", async () => {
    const { context, results, launches } = createContext();
    const executed = await executeToolHandler(
      "launchApp",
      { id: "chats" },
      "tc-launch-success",
      context,
    );
    assertEq(executed, true);
    assertEq(launches.length, 1);
    assertEq(results.length, 1);
    assertEq((results[0] as { output?: unknown }).output, "Launched Chats");
  });

  await runTest("emits closeApp success output through registry", async () => {
    const { context, results, closedInstanceIds } = createContext({
      includeAppHandlers: true,
    });
    const executed = await executeToolHandler(
      "closeApp",
      { id: "chats" },
      "tc-close-success",
      context,
    );
    assertEq(executed, true);
    assertEq(closedInstanceIds.length, 1);
    assertEq(closedInstanceIds[0], "win-1");
    assertEq(results.length, 1);
    assertEq((results[0] as { output?: unknown }).output, "Closed Chats");
  });

  await runTest("returns VFS error when context dependencies are missing", async () => {
    const { context, results } = createContext();
    const executed = await executeToolHandler(
      "list",
      { path: "/Documents" },
      "tc-list",
      context,
    );
    assertEq(executed, true);
    assertEq(results.length, 1);
    assertEq((results[0] as { state?: string }).state, "output-error");
    assertEq(
      (results[0] as { errorText?: string }).errorText,
      "apps.chats.toolCalls.unknownError",
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runChatToolsRegistryTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
