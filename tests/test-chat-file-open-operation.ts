#!/usr/bin/env bun

import { executeChatFileOpenOperation } from "../src/apps/chats/utils/chatFileOpenOperation";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

export async function runChatFileOpenOperationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat File Open Operation Tests"));

  console.log(section("Failure passthrough"));
  await runTest("returns read-operation error without changes", async () => {
    const result = await executeChatFileOpenOperation({
      path: "/invalid/path",
      executeReadOperation: async () => ({
        ok: false,
        error: {
          errorKey: "apps.chats.toolCalls.invalidPathForRead",
          errorParams: { path: "/invalid/path" },
        },
      }),
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.invalidPathForRead");
      assertEq(result.error.errorParams?.path, "/invalid/path");
    }
  });

  console.log(section("Launch payload mapping"));
  await runTest("maps applet reads to applet-viewer launch payload", async () => {
    const result = await executeChatFileOpenOperation({
      path: "/Applets/demo.html",
      executeReadOperation: async () => ({
        ok: true,
        target: "applet",
        path: "/Applets/demo.html",
        fileName: "demo.html",
        content: "<html></html>",
      }),
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.launchAppId, "applet-viewer");
      assertEq(result.successKey, "apps.chats.toolCalls.openedFile");
      assertEq(result.launchOptions.initialData.path, "/Applets/demo.html");
    }
  });

  await runTest("maps document reads to textedit launch payload", async () => {
    const result = await executeChatFileOpenOperation({
      path: "/Documents/demo.md",
      executeReadOperation: async () => ({
        ok: true,
        target: "document",
        path: "/Documents/demo.md",
        fileName: "demo.md",
        content: "# demo",
      }),
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.launchAppId, "textedit");
      assertEq(result.successKey, "apps.chats.toolCalls.openedDocument");
      assertEq(result.launchOptions.initialData.path, "/Documents/demo.md");
      assertEq("multiWindow" in result.launchOptions ? result.launchOptions.multiWindow : false, true);
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runChatFileOpenOperationTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
