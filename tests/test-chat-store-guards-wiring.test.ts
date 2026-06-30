/**
 * Guardrail tests for chat store API response/cooldown wiring.
 *
 * Ensures useChatsStore keeps its cooldown + availability-gate pattern
 * so frontend-only mode doesn't spam failing requests.
 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect, mock } from "bun:test";
import type { ChatRoom } from "../src/types/chat";

const readStoreSource = (): string =>
  readFileSync(resolve(process.cwd(), "src/stores/useChatsStore.ts"), "utf-8");

const countMatches = (source: string, pattern: RegExp): number =>
  source.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))
    ?.length || 0;

class MemoryStorage implements Storage {
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
    this.map.set(key, value);
  }
}

const globals = globalThis as typeof globalThis & { localStorage?: Storage };
if (!globals.localStorage) {
  Object.defineProperty(globals, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}

let listRoomsImpl: () => Promise<{ rooms: ChatRoom[] }> = async () => ({
  rooms: [],
});
const listRoomsMock = mock(() => listRoomsImpl());
const successMock = mock(async () => ({ success: true }));

mock.module("@/api/rooms", () => ({
  listRooms: listRoomsMock,
  getRoomMessages: mock(async () => ({ messages: [] })),
  getBulkMessages: mock(async () => ({
    messagesMap: {},
    validRoomIds: [],
    invalidRoomIds: [],
  })),
  switchPresence: successMock,
  deleteRoom: successMock,
  createRoom: mock(async () => ({
    room: { id: "created", name: "Created", type: "public", createdAt: 1, userCount: 0 },
  })),
  sendRoomMessage: mock(async () => ({
    message: {
      id: "message",
      roomId: "general",
      username: "ryo",
      content: "hi",
      timestamp: Date.now(),
    },
  })),
}));

const { useChatsStore } = await import("../src/stores/useChatsStore");

describe("Chat Store Guard Wiring Tests", () => {
  describe("Rooms fetch deduplication", () => {
    test("coalesces concurrent fetchRooms calls and reuses a fresh result", async () => {
      useChatsStore.getState().reset();

      const rooms: ChatRoom[] = [
        {
          id: "general",
          name: "General",
          type: "public",
          createdAt: 1,
          userCount: 0,
        },
      ];
      let resolveRooms: ((value: { rooms: ChatRoom[] }) => void) | null = null;
      listRoomsImpl = () =>
        new Promise((resolve) => {
          resolveRooms = resolve;
        });

      const first = useChatsStore.getState().fetchRooms({ force: true });
      const second = useChatsStore.getState().fetchRooms();

      expect(listRoomsMock).toHaveBeenCalledTimes(1);

      resolveRooms?.({ rooms });
      await expect(Promise.all([first, second])).resolves.toEqual([
        { ok: true },
        { ok: true },
      ]);
      expect(useChatsStore.getState().rooms.map((room) => room.id)).toEqual([
        "general",
      ]);

      await expect(useChatsStore.getState().fetchRooms()).resolves.toEqual({
        ok: true,
      });
      expect(listRoomsMock).toHaveBeenCalledTimes(1);
    });

    test("shares fetchRooms failures across concurrent callers", async () => {
      useChatsStore.getState().reset();

      const startCallCount = listRoomsMock.mock.calls.length;
      listRoomsImpl = async () => {
        throw new Error("rooms unavailable");
      };

      const originalConsoleError = console.error;
      console.error = mock(() => {});
      try {
        await expect(
          Promise.all([
            useChatsStore.getState().fetchRooms({ force: true }),
            useChatsStore.getState().fetchRooms({ force: true }),
          ])
        ).resolves.toEqual([
          { ok: false, error: "rooms unavailable" },
          { ok: false, error: "rooms unavailable" },
        ]);
      } finally {
        console.error = originalConsoleError;
      }
      expect(listRoomsMock.mock.calls.length - startCallCount).toBe(1);
    });
  });

  describe("Cooldown availability checks", () => {
    test("checks cooldown gate for each chat fetch endpoint", async () => {
      const source = readStoreSource();

      expect(countMatches(source, /isApiTemporarilyUnavailable\("rooms"\)/)).toBe(1);
      expect(countMatches(source, /isApiTemporarilyUnavailable\("room-messages"\)/)).toBe(1);
      expect(countMatches(source, /isApiTemporarilyUnavailable\("bulk-messages"\)/)).toBe(1);
    });

    test("uses a positive cooldown duration constant", async () => {
      const source = readStoreSource();
      const match = source.match(/API_UNAVAILABLE_COOLDOWN_MS\s*=\s*([0-9_]+)/);
      expect(match?.[1]).toBeTruthy();
      const parsedMs = Number((match?.[1] || "").replaceAll("_", ""));
      expect(parsedMs).toBeGreaterThan(0);
    });

    test("marks cooldown on fetch failures", async () => {
      const source = readStoreSource();

      expect(countMatches(source, /markApiTemporarilyUnavailable\("rooms"\)/)).toBeGreaterThanOrEqual(1);
      expect(countMatches(source, /markApiTemporarilyUnavailable\("room-messages"\)/)).toBeGreaterThanOrEqual(1);
      expect(countMatches(source, /markApiTemporarilyUnavailable\("bulk-messages"\)/)).toBeGreaterThanOrEqual(1);
    });

    test("clears cooldown after successful payload parse", async () => {
      const source = readStoreSource();

      expect(countMatches(source, /clearApiUnavailable\("rooms"\)/)).toBe(1);
      expect(countMatches(source, /clearApiUnavailable\("room-messages"\)/)).toBe(1);
      expect(countMatches(source, /clearApiUnavailable\("bulk-messages"\)/)).toBe(1);
    });
  });

  describe("Initial chat hydration", () => {
    test("starts rooms and initial bulk messages in parallel", async () => {
      const source = readFileSync(
        resolve(process.cwd(), "src/apps/chats/hooks/useChatRoom.ts"),
        "utf-8"
      );

      expect(source).toContain("const roomsPromise = fetchRooms()");
      expect(source).toContain(
        "const cachedMessagesPromise = fetchInitialMessages(cachedRoomIds)"
      );
      expect(source).toContain("Promise.all([");
      expect(source).toContain("roomsPromise,");
      expect(source).toContain("cachedMessagesPromise,");
    });
  });
});
