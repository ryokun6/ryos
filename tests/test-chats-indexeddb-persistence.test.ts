/**
 * End-to-end persistence coverage for AI chats whose tool parts can inline
 * multi-megabyte applet HTML. The chat slice must not consume localStorage's
 * small per-origin quota, and legacy localStorage state must migrate intact.
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AIChatMessage } from "../src/types/chat";
import type { ChatRoom } from "../src/types/chat";
import { installTestLocalStorage } from "./setup";
import {
  resetPersistWritesForTests,
  settleAllPersistWrites,
} from "../src/utils/persistWriteQueue";

const CHATS_KEY = "ryos:chats";
const LOCAL_STORAGE_QUOTA = 5 * 1024 * 1024;

class QuotaStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    const nextValue = String(value);
    const nextSize =
      Array.from(this.map.entries()).reduce(
        (total, [storedKey, storedValue]) =>
          total + (storedKey === key ? 0 : storedValue.length),
        0
      ) + nextValue.length;
    if (nextSize > LOCAL_STORAGE_QUOTA) {
      throw new DOMException(
        `Storage quota exceeded (${nextSize} > ${LOCAL_STORAGE_QUOTA})`,
        "QuotaExceededError"
      );
    }
    this.map.set(key, nextValue);
  }
}

const resetDb = () =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("ryOS");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

const makeLargeToolConversation = (): AIChatMessage[] => [
  {
    id: "greeting",
    role: "assistant",
    parts: [{ type: "text", text: "How can I help?" }],
  },
  {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Read and edit my applet" }],
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `assistant-tool-${index}`,
    role: "assistant" as const,
    parts: [
      {
        type: "tool-read",
        toolCallId: `read-${index}`,
        state: "output-available" as const,
        input: { path: `/Applets/example-${index}.html` },
        output: `<html><body>${"x".repeat(2 * 1024 * 1024)}</body></html>`,
      },
    ],
  })),
  {
    id: "assistant-final",
    role: "assistant",
    parts: [{ type: "text", text: "Applet updated." }],
  },
];

let listRoomsImpl: () => Promise<{ rooms: ChatRoom[] }> = async () => ({
  rooms: [],
});

mock.module("@/api/rooms", () => ({
  listRooms: mock(() => listRoomsImpl()),
  getRoomMessages: mock(async () => ({ messages: [] })),
  getBulkMessages: mock(async () => ({
    messagesMap: {},
    validRoomIds: [],
    invalidRoomIds: [],
  })),
  switchPresence: mock(async () => ({ success: true })),
  deleteRoom: mock(async () => ({ success: true })),
  createRoom: mock(async () => ({
    room: {
      id: "created",
      name: "Created",
      type: "public",
      createdAt: 1,
      userCount: 0,
    },
  })),
  sendRoomMessage: mock(async () => ({ success: true })),
}));

const { useChatsStore } = await import("../src/stores/useChatsStore");

async function readPersistedChatRecord(): Promise<{
  state?: { aiMessages?: AIChatMessage[] };
} | null> {
  const { ensureIndexedDBInitialized, STORES } = await import(
    "../src/utils/indexedDB"
  );
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PERSISTED_STATE, "readonly");
      const req = tx.objectStore(STORES.PERSISTED_STATE).get(CHATS_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function readPersistedAiMessages(): Promise<AIChatMessage[]> {
  const { ensureIndexedDBInitialized, STORES } = await import(
    "../src/utils/indexedDB"
  );
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const rows: Array<{ message: AIChatMessage; order: number }> = [];
      const request = db
        .transaction(STORES.CHATS_AI_MESSAGES, "readonly")
        .objectStore(STORES.CHATS_AI_MESSAGES)
        .openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          rows.push(cursor.value);
          cursor.continue();
          return;
        }
        resolve(
          rows
            .sort((left, right) => left.order - right.order)
            .map((row) => row.message)
        );
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  resetPersistWritesForTests();
  installTestLocalStorage(new QuotaStorage());
  await resetDb();
  listRoomsImpl = async () => ({ rooms: [] });
});

describe("useChatsStore IndexedDB persistence", () => {
  test("migrates legacy localStorage chat state on hydration", async () => {
    const legacyMessage: AIChatMessage = {
      id: "legacy",
      role: "user",
      parts: [{ type: "text", text: "persist me" }],
    };
    localStorage.setItem(
      CHATS_KEY,
      JSON.stringify({
        state: { aiMessages: [legacyMessage] },
        version: 3,
      })
    );

    await useChatsStore.persist.rehydrate();

    expect(useChatsStore.getState().aiMessages).toEqual([legacyMessage]);
    expect(localStorage.getItem(CHATS_KEY)).toBeNull();
    expect((await readPersistedChatRecord())?.state?.aiMessages).toEqual([]);
    expect(await readPersistedAiMessages()).toEqual([legacyMessage]);
  });

  test("persists large applet tool results without localStorage quota errors", async () => {
    await useChatsStore.persist.rehydrate();
    const messages = makeLargeToolConversation();
    const serializedBytes = JSON.stringify(messages).length;

    let capturedWriteError: unknown;
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (String(args[0]).includes(`Failed to write "${CHATS_KEY}"`)) {
        capturedWriteError = args[1];
      }
    };
    try {
      useChatsStore.getState().setAiMessages(messages);
      await settleAllPersistWrites();
    } finally {
      console.error = originalConsoleError;
    }

    const persisted = await readPersistedChatRecord();

    expect(serializedBytes).toBeGreaterThan(LOCAL_STORAGE_QUOTA);
    expect(capturedWriteError).toBeUndefined();
    expect(localStorage.getItem(CHATS_KEY)).toBeNull();
    expect(persisted?.state?.aiMessages).toEqual([]);
    expect(await readPersistedAiMessages()).toEqual(messages);
  });
});
