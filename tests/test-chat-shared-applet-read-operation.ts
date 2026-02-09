#!/usr/bin/env bun

import { executeChatSharedAppletReadOperation } from "../src/apps/chats/utils/chatSharedAppletReadOperation";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

export async function runChatSharedAppletReadOperationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Shared Applet Read Operation Tests"));

  console.log(section("Path validation"));
  await runTest("returns no-path error for empty paths", async () => {
    const result = await executeChatSharedAppletReadOperation({
      path: "",
      fetchSharedApplet: async () => {
        throw new Error("should not execute");
      },
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.noPathProvided");
    }
  });

  await runTest("returns invalid-path error for non-store roots", async () => {
    const result = await executeChatSharedAppletReadOperation({
      path: "/Documents/file.md",
      fetchSharedApplet: async () => {
        throw new Error("should not execute");
      },
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.invalidPathForRead");
      assertEq(
        "errorParams" in result.error ? result.error.errorParams?.path : "",
        "/Documents/file.md",
      );
    }
  });

  await runTest("returns invalid-path error when share id is missing", async () => {
    const result = await executeChatSharedAppletReadOperation({
      path: "/Applets Store/   ",
      fetchSharedApplet: async () => {
        throw new Error("should not execute");
      },
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.invalidPathForRead");
    }
  });

  console.log(section("Remote payload mapping"));
  await runTest("maps fetched payload and installed path into response object", async () => {
    const result = await executeChatSharedAppletReadOperation({
      path: "/Applets Store/demo-id",
      fetchSharedApplet: async () => ({
        title: "Demo Applet",
        name: "Demo",
        icon: "🧪",
        createdBy: "ryo",
        content: "<html>demo</html>",
      }),
      resolveInstalledPath: () => "/Applets/Demo",
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.payload.id, "demo-id");
      assertEq(result.payload.title, "Demo Applet");
      assertEq(result.payload.installedPath, "/Applets/Demo");
      assertEq(result.payload.content, "<html>demo</html>");
    }
  });

  await runTest("returns string error message when fetch fails", async () => {
    const result = await executeChatSharedAppletReadOperation({
      path: "/Applets Store/bad-id",
      fetchSharedApplet: async () => {
        throw new Error("remote unavailable");
      },
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "remote unavailable");
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runChatSharedAppletReadOperationTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
