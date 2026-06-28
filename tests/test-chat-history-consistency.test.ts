import { describe, expect, test } from "bun:test";
import {
  ROOM_MESSAGE_HISTORY_LIMIT,
  type ChatMessage,
} from "../src/shared/contracts/chat";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
  writable: true,
});

const { capRoomMessages, mergeFetchedRoomMessages } = await import(
  "../src/stores/useChatsStore"
);

const message = (index: number): ChatMessage => ({
  id: `message-${index}`,
  roomId: "general",
  username: "tester",
  content: `content-${index}`,
  timestamp: index,
});

describe("chat history consistency", () => {
  test("uses the shared server retention limit on the client", () => {
    const messages = Array.from(
      { length: ROOM_MESSAGE_HISTORY_LIMIT + 5 },
      (_, index) => message(index)
    );

    const capped = capRoomMessages(messages);
    expect(capped).toHaveLength(ROOM_MESSAGE_HISTORY_LIMIT);
    expect(capped[0]?.id).toBe("message-5");
  });

  test("reconciles an optimistic message by stable clientId", () => {
    const clientId = "5b8c784d-98bb-4f4e-9a90-78cd741e819d";
    const optimistic: ChatMessage = {
      ...message(1),
      id: `temp_${clientId}`,
      clientId,
    };
    const fetched = {
      ...message(2),
      id: "server-id",
      clientId,
    };

    expect(mergeFetchedRoomMessages([optimistic], [fetched])).toEqual([
      fetched,
    ]);
  });
});
