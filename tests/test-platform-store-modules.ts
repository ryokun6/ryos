#!/usr/bin/env bun
/**
 * Runtime checks for the new store module seams (selectors + pure helpers).
 *
 * Why:
 * These modules were extracted specifically to make store behavior easier to
 * test. This file proves those pure seams work without mounting the app.
 */

import type { ChatMessage, ChatRoom } from "../src/types/chat";
import type { AppStoreState } from "../src/stores/app-store/types";
import type { FileSystemItem } from "../src/stores/files-store/types";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
  assertEq,
} from "./test-utils";
import {
  getForegroundInstance,
  getInstancesByAppId,
  getRecentDocuments,
} from "../src/stores/app-store/selectors";
import {
  getItem,
  getItemsInPath,
  getParentPath,
  getTrashItems,
  ensurePathQueryCache,
} from "../src/stores/files-store/selectors";
import {
  selectCurrentRoom,
  selectCurrentRoomMessages,
  selectIsAuthenticated,
  selectTotalUnreadCount,
  selectUnreadCountForRoom,
} from "../src/stores/chats-store/selectors";
import {
  mergeFetchedMessages,
  upsertIncomingRoomMessage,
} from "../src/stores/chats-store/services/messages";

const noop = () => {};

const makeAppState = (): AppStoreState =>
  ({
    instances: {
      "1": {
        instanceId: "1",
        appId: "finder",
        isOpen: true,
        isForeground: false,
        position: { x: 10, y: 20 },
        size: { width: 500, height: 400 },
        createdAt: 1,
      },
      "2": {
        instanceId: "2",
        appId: "finder",
        isOpen: true,
        isForeground: true,
        position: { x: 20, y: 30 },
        size: { width: 600, height: 500 },
        createdAt: 2,
      },
      "3": {
        instanceId: "3",
        appId: "textedit",
        isOpen: true,
        isForeground: false,
        position: { x: 30, y: 40 },
        size: { width: 300, height: 200 },
        createdAt: 3,
      },
    },
    instanceOrder: ["1", "2", "3"],
    foregroundInstanceId: "2",
    nextInstanceId: 4,
    version: 4,
    createAppInstance: () => "",
    markInstanceAsLoaded: noop,
    closeAppInstance: noop,
    bringInstanceToForeground: noop,
    updateInstanceWindowState: noop,
    getInstancesByAppId: () => [],
    getForegroundInstance: () => null,
    navigateToNextInstance: noop,
    navigateToPreviousInstance: noop,
    minimizeInstance: noop,
    restoreInstance: noop,
    updateInstanceTitle: noop,
    launchApp: () => "",
    clearInstanceInitialData: noop,
    updateInstanceInitialData: noop,
    aiModel: null,
    setAiModel: noop,
    isFirstBoot: false,
    setHasBooted: noop,
    macAppToastShown: true,
    setMacAppToastShown: noop,
    lastSeenDesktopVersion: "1.0.0",
    setLastSeenDesktopVersion: noop,
    _debugCheckInstanceIntegrity: noop,
    exposeMode: false,
    setExposeMode: noop,
    ryOSVersion: "1.0.0",
    ryOSBuildNumber: "100",
    ryOSBuildTime: "now",
    setRyOSVersion: noop,
    recentApps: [{ appId: "finder", timestamp: 1 }],
    recentDocuments: [
      {
        path: "/Documents/spec.txt",
        name: "spec.txt",
        appId: "textedit",
        timestamp: 2,
      },
    ],
    addRecentApp: noop,
    addRecentDocument: noop,
    clearRecentItems: noop,
  }) as AppStoreState;

const makeFileItems = (): Record<string, FileSystemItem> => ({
  "/": {
    path: "/",
    name: "",
    isDirectory: true,
    type: "directory",
    status: "active",
  },
  "/Desktop": {
    path: "/Desktop",
    name: "Desktop",
    isDirectory: true,
    type: "directory",
    status: "active",
  },
  "/Desktop/Notes.txt": {
    path: "/Desktop/Notes.txt",
    name: "Notes.txt",
    isDirectory: false,
    type: "text",
    status: "active",
  },
  "/Trash": {
    path: "/Trash",
    name: "Trash",
    isDirectory: true,
    type: "directory",
    status: "active",
  },
  "/Documents/Old.txt": {
    path: "/Documents/Old.txt",
    name: "Old.txt",
    isDirectory: false,
    type: "text",
    status: "trashed",
  },
});

const makeChatRoom = (id: string, name: string): ChatRoom =>
  ({
    id,
    name,
    type: "public",
    memberCount: 1,
    activeUsers: [],
  }) as ChatRoom;

const makeMessage = (
  id: string,
  content: string,
  overrides: Partial<ChatMessage> = {}
): ChatMessage => ({
  id,
  roomId: "room-1",
  username: "ryo",
  content,
  timestamp: 1000,
  ...overrides,
});

export async function runPlatformStoreModuleTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Platform Store Module Tests"));

  console.log(section("App selectors"));
  await runTest("selects foreground instance and app-specific instances", async () => {
    const state = makeAppState();
    assertEq(getForegroundInstance(state)?.instanceId, "2");
    assertEq(getInstancesByAppId(state, "finder").length, 2);
    assertEq(getRecentDocuments(state)[0]?.path, "/Documents/spec.txt");
  });

  console.log(section("Files selectors"));
  await runTest("derives parent paths and cached item buckets", async () => {
    const items = makeFileItems();
    assertEq(getParentPath("/Desktop/Notes.txt"), "/Desktop");
    assertEq(getItem(items, "/Desktop/Notes.txt")?.name, "Notes.txt");

    ensurePathQueryCache(items);

    assertEq(getItemsInPath("/Desktop").length, 1);
    assertEq(getItemsInPath("/Desktop")[0]?.path, "/Desktop/Notes.txt");
    assertEq(getTrashItems().length, 1);
    assertEq(getTrashItems()[0]?.path, "/Documents/Old.txt");
  });

  console.log(section("Chat selectors"));
  await runTest("derives auth, room, and unread state", async () => {
    const roomOne = makeChatRoom("room-1", "General");
    const roomTwo = makeChatRoom("room-2", "Random");
    const state = {
      username: "ryo",
      authToken: "token",
      currentRoomId: "room-1",
      rooms: [roomOne, roomTwo],
      roomMessages: {
        "room-1": [makeMessage("1", "hello")],
      },
      unreadCounts: {
        "room-1": 2,
        "room-2": 3,
      },
    };

    assert(selectIsAuthenticated(state), "Expected auth selector to be truthy");
    assertEq(selectCurrentRoom(state)?.id, "room-1");
    assertEq(selectCurrentRoomMessages(state).length, 1);
    assertEq(selectUnreadCountForRoom(state, "room-2"), 3);
    assertEq(selectTotalUnreadCount(state), 5);
  });

  console.log(section("Chat message helpers"));
  await runTest("replaces optimistic message when server echoes clientId", async () => {
    const existing = [
      makeMessage("temp_1", "hello", {
        clientId: "temp_1",
        timestamp: 1000,
      }),
    ];
    const incoming = makeMessage("server-1", "hello", {
      clientId: "temp_1",
      timestamp: 1001,
    });

    const updated = upsertIncomingRoomMessage(existing, incoming);

    assertEq(updated.length, 1);
    assertEq(updated[0]?.id, "server-1");
    assertEq(updated[0]?.clientId, "temp_1");
  });

  await runTest("merges fetched server messages with still-pending optimistic ones", async () => {
    const existing = [
      makeMessage("temp_pending", "still pending", {
        clientId: "temp_pending",
        timestamp: 1000,
      }),
      makeMessage("temp_replace", "match me", {
        clientId: "temp_replace",
        timestamp: 1100,
      }),
    ];
    const fetched = [
      makeMessage("server-1", "match me", {
        clientId: "temp_replace",
        timestamp: 1101,
      }),
    ];

    const merged = mergeFetchedMessages(existing, fetched);
    const ids = merged.map((message) => message.id).sort();

    assertEq(merged.length, 2);
    assert(ids.includes("server-1"), "Expected server message to remain");
    assert(
      ids.includes("temp_pending"),
      "Expected unmatched optimistic message to remain"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runPlatformStoreModuleTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
