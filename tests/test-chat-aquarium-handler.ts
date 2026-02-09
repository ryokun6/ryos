#!/usr/bin/env bun

import { handleAquarium } from "../src/apps/chats/tools/aquariumHandler";
import type { ToolContext } from "../src/apps/chats/tools/types";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
} from "./test-utils";

type ToolResult = Parameters<ToolContext["addToolResult"]>[0];

export async function runChatAquariumHandlerTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Aquarium Handler Tests"));

  await runTest("publishes aquarium displayed output", async () => {
    const results: ToolResult[] = [];
    const context: ToolContext = {
      launchApp: () => "instance",
      addToolResult: (result) => {
        results.push(result);
      },
      detectUserOS: () => "Linux",
    };

    await handleAquarium({}, "tc-1", context);
    assertEq(results.length, 1);
    assertEq((results[0] as { tool?: string }).tool, "aquarium");
    assertEq((results[0] as { output?: unknown }).output, "Aquarium displayed");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatAquariumHandlerTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
