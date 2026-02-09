#!/usr/bin/env bun

import { STORES } from "../src/utils/indexedDB";
import { executeChatFileReadOperation } from "../src/apps/chats/utils/chatFileReadOperation";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

export async function runChatFileReadOperationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat File Read Operation Tests"));

  console.log(section("Read path validation"));
  await runTest("returns invalid-path error for unsupported roots", async () => {
    const result = await executeChatFileReadOperation({
      path: "/Music/song.mp3",
      readLocalFile: async () => {
        throw new Error("should not be called");
      },
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.invalidPathForRead");
      assertEq(
        "errorParams" in result.error ? result.error.errorParams?.path : "",
        "/Music/song.mp3",
      );
    }
  });

  await runTest("returns no-path error for empty paths", async () => {
    const result = await executeChatFileReadOperation({
      path: "",
      readLocalFile: async () => {
        throw new Error("should not be called");
      },
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.noPathProvided");
    }
  });

  console.log(section("Read execution"));
  await runTest("reads document content from documents store", async () => {
    let capturedStore = "";
    const result = await executeChatFileReadOperation({
      path: "/Documents/file.md",
      readLocalFile: async (path, storeName) => {
        capturedStore = storeName;
        return {
          fileItem: {
            path,
            name: "file.md",
            isDirectory: false,
            status: "active",
            uuid: "uuid-doc",
          },
          content: "document body",
        };
      },
    });
    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.target, "document");
      assertEq(result.fileName, "file.md");
      assertEq(result.content, "document body");
    }
    assertEq(capturedStore, STORES.DOCUMENTS);
  });

  await runTest("reads applet content from applets store", async () => {
    let capturedStore = "";
    const result = await executeChatFileReadOperation({
      path: "/Applets/demo.html",
      readLocalFile: async (path, storeName) => {
        capturedStore = storeName;
        return {
          fileItem: {
            path,
            name: "demo.html",
            isDirectory: false,
            status: "active",
            uuid: "uuid-applet",
          },
          content: "applet body",
        };
      },
    });
    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.target, "applet");
      assertEq(result.fileName, "demo.html");
      assertEq(result.content, "applet body");
    }
    assertEq(capturedStore, STORES.APPLETS);
  });

  await runTest("returns string error when local read throws", async () => {
    const result = await executeChatFileReadOperation({
      path: "/Documents/file.md",
      readLocalFile: async () => {
        throw new Error("disk unavailable");
      },
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "disk unavailable");
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runChatFileReadOperationTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
