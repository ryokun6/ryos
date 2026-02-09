#!/usr/bin/env bun

import {
  clearUnreadCount,
  getTokenRefreshTime,
  incrementUnreadCount,
  resolveNextFontSize,
  sanitizeMessageRenderLimit,
  saveTokenRefreshTime,
} from "../src/stores/chats/authFlows";
import {
  assert,
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

type StorageRecord = Record<string, string>;

class MemoryLocalStorage {
  private data: StorageRecord = {};
  public lastSetKey: string | null = null;

  getItem(key: string): string | null {
    return key in this.data ? this.data[key] : null;
  }

  setItem(key: string, value: string): void {
    this.lastSetKey = key;
    this.data[key] = value;
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
    this.lastSetKey = null;
  }
}

const withMockLocalStorage = async (
  run: (storage: MemoryLocalStorage) => Promise<void>,
): Promise<void> => {
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  const storage = new MemoryLocalStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });

  try {
    await run(storage);
  } finally {
    if (typeof original === "undefined") {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  }
};

export async function runChatStoreStateHelpersTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Store State Helpers Tests"));

  console.log(section("Token refresh time parsing"));
  await runTest("returns null when no refresh timestamp exists", async () => {
    await withMockLocalStorage(async () => {
      assertEq(getTokenRefreshTime("alice"), null);
    });
  });

  await runTest("parses numeric refresh timestamp with surrounding whitespace", async () => {
    await withMockLocalStorage(async (storage) => {
      saveTokenRefreshTime("alice");
      const key = storage.lastSetKey;
      assert(typeof key === "string", "Expected saveTokenRefreshTime to set storage key");
      storage.setItem(key as string, " 123456 ");
      assertEq(getTokenRefreshTime("alice"), 123456);
    });
  });

  await runTest("rejects non-integer refresh timestamps", async () => {
    await withMockLocalStorage(async (storage) => {
      saveTokenRefreshTime("alice");
      const key = storage.lastSetKey;
      assert(typeof key === "string", "Expected saveTokenRefreshTime to set storage key");
      storage.setItem(key as string, "12.34");
      assertEq(getTokenRefreshTime("alice"), null);
      storage.setItem(key as string, "abc");
      assertEq(getTokenRefreshTime("alice"), null);
    });
  });

  console.log(section("UI settings guards"));
  await runTest("resolveNextFontSize keeps previous value for non-finite updates", async () => {
    assertEq(resolveNextFontSize(14, Number.NaN), 14);
    assertEq(resolveNextFontSize(14, () => Number.POSITIVE_INFINITY), 14);
  });

  await runTest("sanitizeMessageRenderLimit floors and enforces minimum", async () => {
    assertEq(sanitizeMessageRenderLimit(89.9), 89);
    assertEq(sanitizeMessageRenderLimit(19), 20);
    assertEq(sanitizeMessageRenderLimit(Number.NaN), 20);
  });

  console.log(section("Unread count state updates"));
  await runTest("incrementUnreadCount is no-op for empty room id", async () => {
    const state = { roomA: 1 };
    const next = incrementUnreadCount(state, "");
    assert(next === state, "Expected same object reference for empty room id");
  });

  await runTest("incrementUnreadCount increments existing room count", async () => {
    const next = incrementUnreadCount({ roomA: 1 }, "roomA");
    assertEq(next.roomA, 2);
  });

  await runTest("clearUnreadCount is no-op when room key does not exist", async () => {
    const state = { roomA: 1 };
    const next = clearUnreadCount(state, "roomB");
    assert(next === state, "Expected same object reference when room key missing");
  });

  await runTest("clearUnreadCount removes existing room key", async () => {
    const next = clearUnreadCount({ roomA: 1, roomB: 4 }, "roomB");
    assertEq(next.roomA, 1);
    assertEq("roomB" in next, false);
  });

  return printSummary();
}

if (import.meta.main) {
  runChatStoreStateHelpersTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
