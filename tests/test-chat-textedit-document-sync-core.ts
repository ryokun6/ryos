#!/usr/bin/env bun

import {
  buildTextEditWindowTitle,
  syncTextEditDocumentForPathCore,
  type SyncTextEditDocumentOptions,
  type TextEditDocumentSyncDependencies,
} from "../src/apps/chats/utils/textEditDocumentSyncCore";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

type CallLog = {
  removed: string[];
  updated: Array<{ instanceId: string; filePath?: string; contentJson: string }>;
  broughtToForeground: string[];
  launched: Array<{ initialData: { path: string; content: string }; windowTitle: string }>;
  dispatched: Array<{ path: string; contentJson: string }>;
};

const createDependencies = (
  overrides?: Partial<TextEditDocumentSyncDependencies<string>>,
): {
  dependencies: TextEditDocumentSyncDependencies<string>;
  calls: CallLog;
} => {
  const calls: CallLog = {
    removed: [],
    updated: [],
    broughtToForeground: [],
    launched: [],
    dispatched: [],
  };

  const dependencies: TextEditDocumentSyncDependencies<string> = {
    appInstances: {},
    textEditInstances: {},
    removeTextEditInstance: (instanceId) => {
      calls.removed.push(instanceId);
    },
    updateTextEditInstance: (instanceId, updates) => {
      calls.updated.push({
        instanceId,
        filePath: updates.filePath,
        contentJson: updates.contentJson,
      });
    },
    bringToForeground: (instanceId) => {
      calls.broughtToForeground.push(instanceId);
    },
    launchTextEdit: (initialData, windowTitle) => {
      calls.launched.push({ initialData, windowTitle });
      return "launched-1";
    },
    buildContentJson: (content) => `json:${content}`,
    dispatchDocumentUpdated: (path, contentJson) => {
      calls.dispatched.push({ path, contentJson });
    },
    ...overrides,
  };

  return { dependencies, calls };
};

const createOptions = (
  overrides?: Partial<SyncTextEditDocumentOptions>,
): SyncTextEditDocumentOptions => ({
  path: "/Documents/test.md",
  content: "hello",
  fileName: "test.md",
  launchIfMissing: true,
  bringToForeground: true,
  includeFilePathOnUpdate: true,
  ...overrides,
});

export async function runChatTextEditDocumentSyncCoreTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat TextEdit Document Sync Core Tests"));

  console.log(section("Window title helper"));
  await runTest("strips .md extension and defaults to Untitled", async () => {
    assertEq(buildTextEditWindowTitle("notes.md"), "notes");
    assertEq(buildTextEditWindowTitle(""), "Untitled");
    assertEq(buildTextEditWindowTitle(undefined), "Untitled");
  });

  console.log(section("Existing instance updates"));
  await runTest("updates existing live instance and dispatches event", async () => {
    const { dependencies, calls } = createDependencies({
      appInstances: { "inst-1": {} },
      textEditInstances: {
        "inst-1": { filePath: "/Documents/test.md" },
      },
    });

    const result = syncTextEditDocumentForPathCore(createOptions(), dependencies);
    assertEq(result.updated, true);
    assertEq(result.launched, false);
    assertEq(result.instanceId, "inst-1");

    assertEq(calls.updated.length, 1);
    assertEq(calls.updated[0]?.instanceId, "inst-1");
    assertEq(calls.updated[0]?.filePath, "/Documents/test.md");
    assertEq(calls.updated[0]?.contentJson, "json:hello");
    assertEq(calls.dispatched.length, 1);
    assertEq(calls.broughtToForeground[0], "inst-1");
    assertEq(calls.launched.length, 0);
  });

  await runTest("omits filePath update when include flag is false", async () => {
    const { dependencies, calls } = createDependencies({
      appInstances: { "inst-2": {} },
      textEditInstances: {
        "inst-2": { filePath: "/Documents/test.md" },
      },
    });

    syncTextEditDocumentForPathCore(
      createOptions({ includeFilePathOnUpdate: false }),
      dependencies,
    );

    assertEq(calls.updated.length, 1);
    assertEq(calls.updated[0]?.filePath, undefined);
  });

  await runTest("removes stale instance and launches replacement when allowed", async () => {
    const { dependencies, calls } = createDependencies({
      appInstances: {},
      textEditInstances: {
        "stale-1": { filePath: "/Documents/test.md" },
      },
    });

    const result = syncTextEditDocumentForPathCore(createOptions(), dependencies);
    assertEq(result.updated, false);
    assertEq(result.launched, true);
    assertEq(result.instanceId, "launched-1");
    assertEq(calls.removed[0], "stale-1");
    assertEq(calls.launched.length, 1);
  });

  await runTest("prefers foreground live instance when multiple match same path", async () => {
    const { dependencies } = createDependencies({
      appInstances: { "inst-a": {}, "inst-b": {} },
      foregroundInstanceId: "inst-b",
      textEditInstances: {
        "inst-a": { filePath: "/Documents/test.md" },
        "inst-b": { filePath: "/Documents/test.md" },
      },
    });

    const result = syncTextEditDocumentForPathCore(createOptions(), dependencies);
    assertEq(result.instanceId, "inst-b");
    assertEq(result.updated, true);
  });

  await runTest("falls back to most recently iterated live instance without foreground match", async () => {
    const { dependencies } = createDependencies({
      appInstances: { "inst-a": {}, "inst-b": {} },
      foregroundInstanceId: "other-inst",
      textEditInstances: {
        "inst-a": { filePath: "/Documents/test.md" },
        "inst-b": { filePath: "/Documents/test.md" },
      },
    });

    const result = syncTextEditDocumentForPathCore(createOptions(), dependencies);
    assertEq(result.instanceId, "inst-b");
    assertEq(result.updated, true);
  });

  await runTest("returns no-op result when missing and launch is disabled", async () => {
    const { dependencies, calls } = createDependencies({
      appInstances: {},
      textEditInstances: {},
    });

    const result = syncTextEditDocumentForPathCore(
      createOptions({ launchIfMissing: false }),
      dependencies,
    );

    assertEq(result.updated, false);
    assertEq(result.launched, false);
    assertEq(result.instanceId, null);
    assertEq(calls.launched.length, 0);
    assertEq(calls.updated.length, 0);
    assertEq(calls.dispatched.length, 0);
  });

  return printSummary();
}

if (import.meta.main) {
  runChatTextEditDocumentSyncCoreTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
