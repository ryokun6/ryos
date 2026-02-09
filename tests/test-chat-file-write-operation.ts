#!/usr/bin/env bun

import { executeChatFileWriteOperation } from "../src/apps/chats/utils/chatFileWriteOperation";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

export async function runChatFileWriteOperationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat File Write Operation Tests"));

  console.log(section("Validation mapping"));
  await runTest("returns validation error for invalid write input", async () => {
    let called = false;
    const result = await executeChatFileWriteOperation({
      path: "/Music/song.mp3",
      content: "hello",
      mode: "overwrite",
      writeDocumentWithMode: async () => {
        called = true;
        throw new Error("should not execute");
      },
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.invalidPathForWrite");
      assertEq(
        "errorParams" in result.error ? result.error.errorParams?.path : "",
        "/Music/song.mp3",
      );
    }
    assertEq(called, false);
  });

  console.log(section("Write execution"));
  await runTest("executes write with sanitized path and mode", async () => {
    let capturedPath = "";
    let capturedMode = "";
    let capturedFileName = "";
    let capturedIncomingContent = "";
    const result = await executeChatFileWriteOperation({
      path: "  /Documents/test.md  ",
      content: "body",
      mode: "invalid",
      writeDocumentWithMode: async (params) => {
        capturedPath = params.path;
        capturedMode = params.mode;
        capturedFileName = params.fileName;
        capturedIncomingContent = params.incomingContent;
        return {
          isNewFile: true,
          finalContent: "final body",
        };
      },
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.path, "/Documents/test.md");
      assertEq(result.mode, "overwrite");
      assertEq(result.fileName, "test.md");
      assertEq(result.successKey, "apps.chats.toolCalls.createdDocument");
      assertEq(result.finalContent, "final body");
    }
    assertEq(capturedPath, "/Documents/test.md");
    assertEq(capturedMode, "overwrite");
    assertEq(capturedFileName, "test.md");
    assertEq(capturedIncomingContent, "body");
  });

  await runTest("returns updatedDocument key when existing file is updated", async () => {
    const result = await executeChatFileWriteOperation({
      path: "/Documents/existing.md",
      content: "body",
      mode: "append",
      writeDocumentWithMode: async () => ({
        isNewFile: false,
        finalContent: "merged body",
      }),
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.mode, "append");
      assertEq(result.successKey, "apps.chats.toolCalls.updatedDocument");
      assertEq(result.finalContent, "merged body");
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runChatFileWriteOperationTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
