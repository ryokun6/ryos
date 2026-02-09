#!/usr/bin/env bun

import { executeChatListOperation } from "../src/apps/chats/utils/chatListOperation";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const baseDependencies = {
  getMusicItems: () => [
    { path: "/Music/1", id: "1", title: "Song A", artist: "Alpha" },
    { path: "/Music/2", id: "2", title: "Song B", artist: "Beta" },
  ],
  getSharedApplets: async () => [
    { id: "abc", title: "Focus Timer", createdAt: 20, createdBy: "Ryo" },
    { id: "def", title: "Weather Desk", createdAt: 10, createdBy: "Sam" },
  ],
  getApplications: () => [
    { path: "/Applications/chats", name: "Chats" },
    { path: "/Applications/ipod", name: "iPod" },
  ],
  getFileItems: (root: "/Applets" | "/Documents") =>
    root === "/Applets"
      ? [{ path: "/Applets/demo.html", name: "demo.html", type: "html" }]
      : [{ path: "/Documents/notes.md", name: "notes.md", type: "markdown" }],
};

export async function runChatListOperationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat List Operation Tests"));

  console.log(section("Validation"));
  await runTest("returns no-path error for empty input", async () => {
    const result = await executeChatListOperation({
      path: "",
      dependencies: baseDependencies,
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.noPathProvided");
    }
  });

  await runTest("returns invalid-path error for unsupported roots", async () => {
    const result = await executeChatListOperation({
      path: "/Unknown",
      dependencies: baseDependencies,
    });

    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.error.errorKey, "apps.chats.toolCalls.invalidPathForList");
      assertEq(
        "errorParams" in result.error ? result.error.errorParams?.path : "",
        "/Unknown",
      );
    }
  });

  console.log(section("Route behavior"));
  await runTest("returns music records for /Music root", async () => {
    const result = await executeChatListOperation({
      path: "/Music",
      dependencies: baseDependencies,
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.target, "music");
      assertEq(result.items.length, 2);
      assertEq(result.items[0]?.title, "Song A");
    }
  });

  await runTest("filters and limits shared applets by query", async () => {
    const result = await executeChatListOperation({
      path: "/Applets Store",
      query: "focus",
      limit: 1,
      dependencies: baseDependencies,
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.target, "shared-applets");
      assertEq(result.hasKeyword, true);
      assertEq(result.items.length, 1);
      assertEq(result.items[0]?.id, "abc");
    }
  });

  await runTest("maps listable file roots to file-type payloads", async () => {
    const documentsResult = await executeChatListOperation({
      path: "/Documents",
      dependencies: baseDependencies,
    });
    const appletsResult = await executeChatListOperation({
      path: "/Applets",
      dependencies: baseDependencies,
    });

    assertEq(documentsResult.ok, true);
    assertEq(appletsResult.ok, true);

    if (documentsResult.ok && appletsResult.ok) {
      assertEq(documentsResult.target, "files");
      assertEq(documentsResult.fileType, "document");
      assertEq(documentsResult.items[0]?.name, "notes.md");

      assertEq(appletsResult.target, "files");
      assertEq(appletsResult.fileType, "applet");
      assertEq(appletsResult.items[0]?.name, "demo.html");
    }
  });

  await runTest("sorts applications alphabetically for stable results", async () => {
    const result = await executeChatListOperation({
      path: "/Applications",
      dependencies: {
        ...baseDependencies,
        getApplications: () => [
          { path: "/Applications/videos", name: "Videos" },
          { path: "/Applications/chats", name: "Chats" },
        ],
      },
    });

    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.target, "applications");
      assertEq(result.items[0]?.name, "Chats");
      assertEq(result.items[1]?.name, "Videos");
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runChatListOperationTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
