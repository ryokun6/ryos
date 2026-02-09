#!/usr/bin/env bun

import {
  handleChatEditToolCall,
  handleChatListToolCall,
  handleChatReadToolCall,
  handleChatWriteToolCall,
} from "../src/apps/chats/utils/chatFileToolHandlers";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

type ToolResult =
  | { state?: "output-available"; tool: string; toolCallId: string; output: unknown }
  | { state: "output-error"; tool: string; toolCallId: string; errorText: string };

const createCollector = () => {
  const results: ToolResult[] = [];
  return {
    results,
    addToolResult: (result: ToolResult) => {
      results.push(result);
    },
  };
};

const t = (key: string, params?: Record<string, unknown>): string =>
  `${key}${params ? `:${JSON.stringify(params)}` : ""}`;

const listDependencies = {
  getMusicItems: () => [{ path: "/Music/1", id: "1", title: "Song", artist: "Ryo" }],
  getSharedApplets: async () => [{ id: "demo", title: "Demo Applet", createdAt: 1 }],
  getApplications: () => [{ path: "/Applications/chats", name: "Chats" }],
  getFileItems: (_root: "/Applets" | "/Documents") => [
    { path: "/Documents/file.md", name: "file.md", type: "markdown" },
  ],
};

export async function runChatFileToolHandlersTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat File Tool Handlers Tests"));

  console.log(section("Write handler"));
  await runTest("emits validation error from write operation failure", async () => {
    const collector = createCollector();
    await handleChatWriteToolCall({
      path: "/Music/song.mp3",
      content: "hello",
      mode: "overwrite",
      toolName: "write",
      toolCallId: "tc-1",
      addToolResult: collector.addToolResult,
      t,
      syncTextEdit: () => {},
      executeWriteOperation: async () => ({
        ok: false,
        error: {
          ok: false,
          errorKey: "apps.chats.toolCalls.invalidPathForWrite",
          errorParams: { path: "/Music/song.mp3" },
        },
      }),
    });

    assertEq(collector.results.length, 1);
    assertEq((collector.results[0] as { state?: string }).state, "output-error");
  });

  await runTest("syncs textedit and emits output when write succeeds", async () => {
    const collector = createCollector();
    let syncCalled = false;
    await handleChatWriteToolCall({
      path: "/Documents/file.md",
      content: "hello",
      mode: "overwrite",
      toolName: "write",
      toolCallId: "tc-2",
      addToolResult: collector.addToolResult,
      t,
      executeWriteOperation: async () => ({
        ok: true,
        path: "/Documents/file.md",
        fileName: "file.md",
        mode: "overwrite",
        finalContent: "final",
        successKey: "apps.chats.toolCalls.createdDocument",
      }),
      syncTextEdit: () => {
        syncCalled = true;
      },
    });

    assertEq(syncCalled, true);
    assertEq(collector.results.length, 1);
    assertEq(
      (collector.results[0] as { output?: unknown }).output,
      'apps.chats.toolCalls.createdDocument:{"path":"/Documents/file.md"}',
    );
  });

  console.log(section("Edit handler"));
  await runTest("emits validation error when edit input is invalid", async () => {
    const collector = createCollector();
    await handleChatEditToolCall({
      path: "",
      oldString: "old",
      newString: "new",
      toolName: "edit",
      toolCallId: "tc-3",
      addToolResult: collector.addToolResult,
      t,
      syncTextEdit: () => {},
      executeEditOperation: async () => {
        throw new Error("should not run");
      },
    });

    assertEq(collector.results.length, 1);
    assertEq((collector.results[0] as { state?: string }).state, "output-error");
  });

  await runTest("syncs textedit only for document edit targets", async () => {
    const collector = createCollector();
    let documentSyncCount = 0;
    await handleChatEditToolCall({
      path: "/Documents/file.md",
      oldString: "old",
      newString: "new",
      toolName: "edit",
      toolCallId: "tc-4",
      addToolResult: collector.addToolResult,
      t,
      executeEditOperation: async () => ({
        ok: true,
        target: "document",
        path: "/Documents/file.md",
        successKey: "apps.chats.toolCalls.editedDocument",
        updatedContent: "updated",
      }),
      syncTextEdit: () => {
        documentSyncCount += 1;
      },
    });

    await handleChatEditToolCall({
      path: "/Applets/demo.html",
      oldString: "old",
      newString: "new",
      toolName: "edit",
      toolCallId: "tc-5",
      addToolResult: collector.addToolResult,
      t,
      executeEditOperation: async () => ({
        ok: true,
        target: "applet",
        path: "/Applets/demo.html",
        successKey: "apps.chats.toolCalls.editedApplet",
        updatedContent: "updated",
      }),
      syncTextEdit: () => {
        documentSyncCount += 1;
      },
    });

    assertEq(documentSyncCount, 1);
    assertEq(collector.results.length, 2);
  });

  console.log(section("Read handler"));
  await runTest("emits error result when shared applet read fails", async () => {
    const collector = createCollector();
    await handleChatReadToolCall({
      path: "/Applets Store/demo",
      toolName: "read",
      toolCallId: "tc-6",
      addToolResult: collector.addToolResult,
      t,
      executeSharedAppletReadOperation: async () => ({
        ok: false,
        error: {
          errorKey: "apps.chats.toolCalls.invalidPathForRead",
          errorParams: { path: "/Applets Store/demo" },
        },
      }),
    });

    assertEq(collector.results.length, 1);
    assertEq((collector.results[0] as { state?: string }).state, "output-error");
  });

  await runTest("returns JSON payload for shared applet read success", async () => {
    const collector = createCollector();
    await handleChatReadToolCall({
      path: "/Applets Store/demo",
      toolName: "read",
      toolCallId: "tc-7",
      addToolResult: collector.addToolResult,
      t,
      executeSharedAppletReadOperation: async () => ({
        ok: true,
        payload: {
          id: "demo",
          title: "Demo",
          name: "Demo",
          icon: null,
          createdBy: "ryo",
          installedPath: "/Applets/Demo",
          content: "<html></html>",
        },
      }),
    });

    assertEq(collector.results.length, 1);
    assertEq(
      (collector.results[0] as { output?: unknown }).output,
      JSON.stringify(
        {
          id: "demo",
          title: "Demo",
          name: "Demo",
          icon: null,
          createdBy: "ryo",
          installedPath: "/Applets/Demo",
          content: "<html></html>",
        },
        null,
        2,
      ),
    );
  });

  await runTest("formats local file read content with translated label", async () => {
    const collector = createCollector();
    await handleChatReadToolCall({
      path: "/Documents/file.md",
      toolName: "read",
      toolCallId: "tc-8",
      addToolResult: collector.addToolResult,
      t,
      executeReadOperation: async () => ({
        ok: true,
        target: "document",
        path: "/Documents/file.md",
        fileName: "file.md",
        content: "body",
      }),
    });

    assertEq(collector.results.length, 1);
    assertEq(
      (collector.results[0] as { output?: unknown }).output,
      'apps.chats.toolCalls.fileContent:{"fileLabel":"apps.chats.toolCalls.document","fileName":"file.md","charCount":4}\n\nbody',
    );
  });

  console.log(section("List handler"));
  await runTest("emits translated error when list operation fails", async () => {
    const collector = createCollector();
    await handleChatListToolCall({
      path: "/bad",
      query: "x",
      limit: 5,
      listDependencies,
      toolName: "list",
      toolCallId: "tc-9",
      addToolResult: collector.addToolResult,
      t,
      executeListOperation: async () => ({
        ok: false,
        error: {
          errorKey: "apps.chats.toolCalls.invalidPathForList",
          errorParams: { path: "/bad" },
        },
      }),
    });

    assertEq(collector.results.length, 1);
    assertEq((collector.results[0] as { state?: string }).state, "output-error");
  });

  await runTest("formats shared applet list payload on success", async () => {
    const collector = createCollector();
    await handleChatListToolCall({
      path: "/Applets Store",
      query: "demo",
      limit: 3,
      listDependencies,
      toolName: "list",
      toolCallId: "tc-10",
      addToolResult: collector.addToolResult,
      t,
      executeListOperation: async () => ({
        ok: true,
        target: "shared-applets",
        hasKeyword: true,
        query: "demo",
        items: [{ path: "/Applets Store/demo", id: "demo", title: "Demo Applet" }],
      }),
    });

    assertEq(collector.results.length, 1);
    assertEq(
      (collector.results[0] as { output?: unknown }).output,
      'apps.chats.toolCalls.foundSharedApplets:{"count":1}:\n[\n  {\n    "path": "/Applets Store/demo",\n    "id": "demo",\n    "title": "Demo Applet"\n  }\n]',
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runChatFileToolHandlersTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
