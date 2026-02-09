#!/usr/bin/env bun

import {
  handleChatEditToolCall,
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
