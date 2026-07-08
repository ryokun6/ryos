/**
 * React render / Zustand subscription performance guardrails.
 *
 * These pin the selector and signature helpers that keep shell chrome and
 * chat sidebars off high-frequency commit paths (window focus, Finder
 * navigation, room message content ticks).
 */

import { describe, expect, test } from "bun:test";
import {
  getZIndexForInstance,
  selectOpenInstanceCount,
  selectZIndexForInstance,
} from "../../../src/apps/base/app-manager/instanceHelpers";
import { BASE_Z_INDEX } from "../../../src/apps/base/app-manager/constants";
import { getDockInstancesSignature } from "../../../src/components/layout/dock/dockInstancesSnapshot";
import {
  getFinderInstancesSignature,
  getFinderInstancesSnapshot,
} from "../../../src/components/layout/dock/finderInstancesSnapshot";
import { getRoomActivitySignature } from "../../../src/apps/chats/utils/roomActivitySignature";
import type { AppInstance } from "../../../src/stores/useAppStore";
import type { FinderInstance } from "../../../src/stores/useFinderStore";
import type { ChatMessage, ChatRoom } from "../../../src/types/chat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relPath: string): string =>
  readFileSync(resolve(process.cwd(), relPath), "utf-8");

function makeAppInstance(overrides: Partial<AppInstance>): AppInstance {
  return {
    instanceId: overrides.instanceId ?? "i-1",
    appId: overrides.appId ?? "chats",
    isOpen: overrides.isOpen ?? true,
    isMinimized: overrides.isMinimized ?? false,
    createdAt: overrides.createdAt ?? 0,
    ...overrides,
  } as AppInstance;
}

function makeFinderInstance(
  overrides: Partial<FinderInstance>
): FinderInstance {
  return {
    instanceId: overrides.instanceId ?? "f-1",
    currentPath: overrides.currentPath ?? "/",
    navigationHistory: overrides.navigationHistory ?? ["/"],
    navigationIndex: overrides.navigationIndex ?? 0,
    viewType: overrides.viewType ?? "list",
    sortType: overrides.sortType ?? "name",
    selectedFile: overrides.selectedFile ?? null,
    selectedFiles: overrides.selectedFiles ?? [],
    selectionAnchorPath: overrides.selectionAnchorPath ?? null,
  };
}

describe("selectZIndexForInstance", () => {
  test("returns a scalar that is stable when stack position is unchanged", () => {
    const order = ["a", "b", "c"];
    const first = selectZIndexForInstance({ instanceOrder: order }, "b");
    const second = selectZIndexForInstance(
      { instanceOrder: [...order] },
      "b"
    );
    expect(first).toBe(second);
    expect(first).toBe(BASE_Z_INDEX + 2);
  });

  test("changes only for instances whose order index moved", () => {
    const before = ["a", "b", "c"];
    const after = ["a", "c", "b"]; // b brought to front
    expect(selectZIndexForInstance({ instanceOrder: before }, "a")).toBe(
      selectZIndexForInstance({ instanceOrder: after }, "a")
    );
    expect(selectZIndexForInstance({ instanceOrder: before }, "b")).not.toBe(
      selectZIndexForInstance({ instanceOrder: after }, "b")
    );
    expect(getZIndexForInstance("missing", before)).toBe(BASE_Z_INDEX);
  });
});

describe("selectOpenInstanceCount", () => {
  test("counts open instances and ignores closed ones", () => {
    const state = {
      instances: {
        a: makeAppInstance({ instanceId: "a", isOpen: true }),
        b: makeAppInstance({ instanceId: "b", isOpen: false }),
        c: makeAppInstance({ instanceId: "c", isOpen: true }),
      },
    };
    expect(selectOpenInstanceCount(state)).toBe(2);
  });
});

describe("getFinderInstancesSignature", () => {
  test("is stable when only selection/view fields change", () => {
    const a = {
      f1: makeFinderInstance({
        instanceId: "f1",
        currentPath: "/Documents",
        selectedFiles: ["a.txt"],
        viewType: "list",
      }),
    };
    const b = {
      f1: makeFinderInstance({
        instanceId: "f1",
        currentPath: "/Documents",
        selectedFiles: ["b.txt", "c.txt"],
        viewType: "icons",
        sortType: "date",
      }),
    };
    expect(getFinderInstancesSignature(a)).toBe(getFinderInstancesSignature(b));
  });

  test("changes when a Finder path changes", () => {
    const a = {
      f1: makeFinderInstance({
        instanceId: "f1",
        currentPath: "/Documents",
      }),
    };
    const b = {
      f1: makeFinderInstance({
        instanceId: "f1",
        currentPath: "/Applications",
      }),
    };
    expect(getFinderInstancesSignature(a)).not.toBe(
      getFinderInstancesSignature(b)
    );
  });

  test("snapshot preserves path for dock routing", () => {
    const instances = {
      f1: makeFinderInstance({
        instanceId: "f1",
        currentPath: "/Trash",
      }),
    };
    const snap = getFinderInstancesSnapshot(instances);
    expect(snap.f1?.currentPath).toBe("/Trash");
  });
});

describe("getRoomActivitySignature", () => {
  test("is stable when message content changes but newest timestamp does not", () => {
    const rooms: ChatRoom[] = [
      {
        id: "dm-1",
        name: "alice",
        type: "private",
        createdAt: 1,
        lastMessageAt: 100,
      } as ChatRoom,
    ];
    const messagesA: ChatMessage[] = [
      { id: "m1", content: "hello", timestamp: 100 } as ChatMessage,
    ];
    const messagesB: ChatMessage[] = [
      { id: "m1", content: "hello world", timestamp: 100 } as ChatMessage,
    ];
    expect(
      getRoomActivitySignature(rooms, { "dm-1": messagesA })
    ).toBe(getRoomActivitySignature(rooms, { "dm-1": messagesB }));
  });

  test("changes when a newer message arrives", () => {
    const rooms: ChatRoom[] = [
      {
        id: "dm-1",
        name: "alice",
        type: "private",
        createdAt: 1,
        lastMessageAt: 100,
      } as ChatRoom,
    ];
    const messagesA: ChatMessage[] = [
      { id: "m1", content: "hello", timestamp: 100 } as ChatMessage,
    ];
    const messagesC: ChatMessage[] = [
      { id: "m1", content: "hello", timestamp: 100 } as ChatMessage,
      { id: "m2", content: "later", timestamp: 200 } as ChatMessage,
    ];
    expect(
      getRoomActivitySignature(rooms, { "dm-1": messagesA })
    ).not.toBe(getRoomActivitySignature(rooms, { "dm-1": messagesC }));
  });
});

describe("render-perf wiring", () => {
  test("ManagedAppInstance selects scalar z-index, not instanceOrder array", () => {
    const source = readSource("src/apps/base/app-manager/AppManagerView.tsx");
    expect(source).toContain("selectZIndexForInstance");
    expect(source).not.toMatch(
      /getZIndexForInstance\(instanceId,\s*state\.instanceOrder\)/
    );
  });

  test("WindowFrame selects openInstanceCount as a scalar", () => {
    const source = readSource(
      "src/components/layout/window-frame/WindowFrame.tsx"
    );
    expect(source).toContain("selectOpenInstanceCount");
    expect(source).not.toMatch(
      /Object\.values\(state\.instances\)\.filter/
    );
  });

  test("MacDock uses Finder path signature instead of full instances map", () => {
    const source = readSource("src/components/layout/dock/MacDock.tsx");
    expect(source).toContain("getFinderInstancesSignature");
    expect(source).not.toMatch(
      /useFinderStore\(\(s\) => s\.instances\)/
    );
  });

  test("ChatMessagesContent passes per-row copied/playing booleans", () => {
    const source = readSource(
      "src/apps/chats/components/chat-messages/ChatMessagesContent.tsx"
    );
    expect(source).toContain("isCopied={copiedMessageId === messageKey}");
    expect(source).toContain("isPlaying={playingMessageId === messageKey}");
    expect(source).not.toMatch(/copiedMessageId=\{copiedMessageId\}/);
  });

  test("ChatMessagesContent passes null highlightSegment to non-matching rows", () => {
    const source = readSource(
      "src/apps/chats/components/chat-messages/ChatMessagesContent.tsx"
    );
    expect(source).toContain("rowHighlight");
    expect(source).toMatch(
      /highlightSegment\?\.messageId === message\.id\s*\?\s*highlightSegment\s*:\s*null/
    );
    expect(source).toContain("highlightSegment={rowHighlight}");
  });

  test("useThemeFlags uses a single shallow Zustand subscription", () => {
    const source = readSource("src/hooks/useThemeFlags.ts");
    expect(source).toContain("useShallow");
    expect(source).toMatch(/useThemeStore\(\s*useShallow/);
    const storeCalls = source.match(/useThemeStore\(/g) ?? [];
    expect(storeCalls.length).toBe(1);
  });

  test("ThemedIcon is memoized and selects only current theme", () => {
    const source = readSource("src/components/shared/ThemedIcon.tsx");
    expect(source).toContain("export const ThemedIcon = memo(ThemedIconInner)");
    expect(source).toContain("useThemeStore((state) => state.current)");
    expect(source).not.toContain("useThemeFlags");
  });

  test("MacDock selects trashed count via path-query cache helper", () => {
    const source = readSource("src/components/layout/dock/MacDock.tsx");
    expect(source).toContain("selectTrashedCount");
    expect(source).not.toMatch(
      /Object\.values\(s\.items\)\.filter\(\(item\) => item\.status === ["']trashed["']\)/
    );
  });

  test("DesktopIconGrid uses memoized per-item FileIcon wrappers", () => {
    const source = readSource(
      "src/components/layout/desktop/DesktopIconGrid.tsx"
    );
    expect(source).toContain("memo(function DesktopIconGrid");
    expect(source).toContain("memo(function DesktopShortcutIcon");
    expect(source).toContain("memo(function DesktopAppIcon");
    expect(source).toContain("memo(function DesktopMacintoshHdIcon");
    expect(source).toContain("memo(function DesktopTrashIcon");
  });

  test("Finder file-list marquee paints via ref, not selectionRect state", () => {
    const source = readSource(
      "src/apps/finder/components/file-list/useFileList.ts"
    );
    expect(source).toContain("paintMarqueeRect");
    expect(source).toContain("isMarqueeSelecting");
    expect(source).not.toMatch(/setSelectionRect/);
  });

  test("dock app-instance signature still ignores geometry", () => {
    const a = {
      i1: makeAppInstance({
        instanceId: "i1",
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
      }),
    };
    const b = {
      i1: makeAppInstance({
        instanceId: "i1",
        position: { x: 50, y: 50 },
        size: { width: 200, height: 200 },
      }),
    };
    expect(getDockInstancesSignature(a)).toBe(getDockInstancesSignature(b));
  });
});
