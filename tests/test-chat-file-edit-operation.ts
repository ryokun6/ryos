#!/usr/bin/env bun

import { STORES } from "../src/utils/indexedDB";
import { executeChatFileEditOperation } from "../src/apps/chats/utils/chatFileEditOperation";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

export async function runChatFileEditOperationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat File Edit Operation Tests"));

  console.log(section("Target resolution"));
  await runTest("returns invalid-path error before replacement call", async () => {
    let called = false;
    const result = await executeChatFileEditOperation({
      path: "/Music/song.mp3",
      oldString: "old",
      newString: "new",
      replaceAndPersist: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.invalidPathForEdit");
      assertEq("errorParams" in result.error ? result.error.errorParams?.path : "", "/Music/song.mp3");
    }
    assertEq(called, false);
  });

  console.log(section("Replacement failure mapping"));
  await runTest("maps not_found replacement failures to translated error key", async () => {
    const result = await executeChatFileEditOperation({
      path: "/Documents/file.md",
      oldString: "old",
      newString: "new",
      replaceAndPersist: async () => ({
        ok: false,
        reason: "not_found",
        occurrences: 0,
      }),
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.oldStringNotFound");
    }
  });

  await runTest("maps multiple_matches replacement failures with count", async () => {
    const result = await executeChatFileEditOperation({
      path: "/Applets/demo.html",
      oldString: "old",
      newString: "new",
      replaceAndPersist: async () => ({
        ok: false,
        reason: "multiple_matches",
        occurrences: 3,
      }),
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(
        result.error.errorKey,
        "apps.chats.toolCalls.oldStringMultipleMatches",
      );
      assertEq(
        "errorParams" in result.error ? result.error.errorParams?.count : undefined,
        3,
      );
    }
  });

  console.log(section("Successful edit flow"));
  await runTest("returns document success descriptor with document store args", async () => {
    let capturedStore = "";
    let capturedRecordName = "";
    const result = await executeChatFileEditOperation({
      path: "/Documents/file.md",
      oldString: "old",
      newString: "new",
      replaceAndPersist: async (params) => {
        capturedStore = params.storeName;
        capturedRecordName = params.resolveRecordName({
          path: params.path,
          name: "file.md",
          isDirectory: false,
          status: "active",
          uuid: "uuid-doc",
        });
        return {
          ok: true,
          fileItem: {
            path: params.path,
            name: "file.md",
            isDirectory: false,
            status: "active",
            uuid: "uuid-doc",
          },
          updatedContent: "updated",
        };
      },
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.target, "document");
      assertEq(result.successKey, "apps.chats.toolCalls.editedDocument");
      assertEq(result.updatedContent, "updated");
    }
    assertEq(capturedStore, STORES.DOCUMENTS);
    assertEq(capturedRecordName, "file.md");
  });

  await runTest("returns applet success descriptor with applet store args", async () => {
    let capturedStore = "";
    let capturedRecordName = "";
    const result = await executeChatFileEditOperation({
      path: "/Applets/demo.html",
      oldString: "old",
      newString: "new",
      replaceAndPersist: async (params) => {
        capturedStore = params.storeName;
        capturedRecordName = params.resolveRecordName({
          path: params.path,
          name: "demo.html",
          isDirectory: false,
          status: "active",
          uuid: "uuid-applet",
        });
        return {
          ok: true,
          fileItem: {
            path: params.path,
            name: "demo.html",
            isDirectory: false,
            status: "active",
            uuid: "uuid-applet",
          },
          updatedContent: "updated applet",
        };
      },
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.target, "applet");
      assertEq(result.successKey, "apps.chats.toolCalls.editedApplet");
      assertEq(result.updatedContent, "updated applet");
    }
    assertEq(capturedStore, STORES.APPLETS);
    assertEq(capturedRecordName, "uuid-applet");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatFileEditOperationTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
