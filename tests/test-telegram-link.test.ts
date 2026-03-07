import { describe, expect, test } from "bun:test";
import {
  appendTelegramConversationMessage,
  createTelegramLinkCode,
  getLinkedTelegramAccountByTelegramUserId,
  getLinkedTelegramAccountByUsername,
  linkTelegramAccount,
  loadTelegramConversationHistory,
  type TelegramConversationMessage,
} from "../api/_utils/telegram-link";
import {
  buildTelegramDeepLink,
  extractTelegramStartPayload,
  parseTelegramTextUpdate,
} from "../api/_utils/telegram";

class MemoryRedis {
  private values = new Map<string, string>();
  private lists = new Map<string, string[]>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    _options?: { ex?: number }
  ): Promise<unknown> {
    this.values.set(key, typeof value === "string" ? value : JSON.stringify(value));
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.values.delete(key)) deleted += 1;
      if (this.lists.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.some((key) => this.values.has(key) || this.lists.has(key)) ? 1 : 0;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }

  async incr(key: string): Promise<number> {
    const current = Number(this.values.get(key) || "0");
    const next = current + 1;
    this.values.set(key, String(next));
    return next;
  }

  async ttl(_key: string): Promise<number> {
    return 60;
  }

  async scan(): Promise<[string | number, string[]]> {
    return [0, []];
  }

  pipeline() {
    throw new Error("Not implemented");
  }

  async smembers(): Promise<string[]> {
    return [];
  }

  async sadd(): Promise<number> {
    return 0;
  }

  async srem(): Promise<number> {
    return 0;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const existing = this.lists.get(key) || [];
    const next = [...values.reverse(), ...existing];
    this.lists.set(key, next);
    return next.length;
  }

  async lrange<T = unknown>(
    key: string,
    start: number,
    stop: number
  ): Promise<T[]> {
    const values = this.lists.get(key) || [];
    const end = stop >= 0 ? stop + 1 : values.length + stop + 1;
    return values.slice(start, end) as T[];
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    const values = this.lists.get(key) || [];
    const end = stop >= 0 ? stop + 1 : values.length + stop + 1;
    this.lists.set(key, values.slice(start, end));
    return "OK";
  }

  async llen(key: string): Promise<number> {
    return (this.lists.get(key) || []).length;
  }

  async zadd(): Promise<number> {
    return 0;
  }

  async zrangebyscore<T = string>(): Promise<T[]> {
    return [];
  }

  async zremrangebyscore(): Promise<number> {
    return 0;
  }

  async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((key) => this.get<T>(key)));
  }
}

describe("telegram helpers", () => {
  test("parses telegram start payloads and update structure", () => {
    expect(extractTelegramStartPayload("/start")).toBeNull();
    expect(extractTelegramStartPayload("/start link_123")).toBe("link_123");
    expect(extractTelegramStartPayload("/start@ryos_bot link_abc")).toBe(
      "link_abc"
    );

    const parsed = parseTelegramTextUpdate({
      update_id: 11,
      message: {
        message_id: 9,
        from: {
          id: 42,
          first_name: "Ryo",
          username: "ryo_test",
        },
        chat: {
          id: 42,
          type: "private",
        },
        text: "/start link_abc",
      },
    });

    expect(parsed).toEqual({
      updateId: 11,
      messageId: 9,
      chatId: "42",
      chatType: "private",
      text: "/start link_abc",
      telegramUserId: "42",
      telegramUsername: "ryo_test",
      firstName: "Ryo",
      lastName: null,
      isPrivateChat: true,
      startPayload: "link_abc",
    });
  });

  test("builds telegram deep links", () => {
    expect(buildTelegramDeepLink("@ryos_bot", "link_deadbeef")).toBe(
      "https://t.me/ryos_bot?start=link_deadbeef"
    );
    expect(buildTelegramDeepLink(undefined, "link_deadbeef")).toBeNull();
  });

  test("creates and consumes a one-time link code", async () => {
    const redis = new MemoryRedis();
    const { code, expiresIn } = await createTelegramLinkCode(redis, "ryo");

    expect(code.length).toBe(24);
    expect(expiresIn).toBeGreaterThan(0);

    const linked = await linkTelegramAccount(redis, {
      code,
      telegramUserId: "1001",
      chatId: "1001",
      telegramUsername: "ryo_test",
      firstName: "Ryo",
    });

    expect(linked?.username).toBe("ryo");
    expect(linked?.telegramUserId).toBe("1001");

    const byUsername = await getLinkedTelegramAccountByUsername(redis, "ryo");
    const byTelegram = await getLinkedTelegramAccountByTelegramUserId(
      redis,
      "1001"
    );

    expect(byUsername?.telegramUsername).toBe("ryo_test");
    expect(byTelegram?.username).toBe("ryo");

    const secondAttempt = await linkTelegramAccount(redis, {
      code,
      telegramUserId: "1001",
      chatId: "1001",
    });
    expect(secondAttempt).toBeNull();
  });

  test("enforces one-to-one telegram account mapping", async () => {
    const redis = new MemoryRedis();

    const firstCode = await createTelegramLinkCode(redis, "ryo");
    const secondCode = await createTelegramLinkCode(redis, "sam");

    await linkTelegramAccount(redis, {
      code: firstCode.code,
      telegramUserId: "2002",
      chatId: "2002",
    });

    await linkTelegramAccount(redis, {
      code: secondCode.code,
      telegramUserId: "2002",
      chatId: "2002",
    });

    expect(await getLinkedTelegramAccountByUsername(redis, "ryo")).toBeNull();
    expect(
      (await getLinkedTelegramAccountByUsername(redis, "sam"))?.telegramUserId
    ).toBe("2002");
  });

  test("stores telegram conversation history in chronological order", async () => {
    const redis = new MemoryRedis();
    const messages: TelegramConversationMessage[] = [
      { role: "user", content: "hello", createdAt: 1 },
      { role: "assistant", content: "yo", createdAt: 2 },
      { role: "user", content: "what's up", createdAt: 3 },
    ];

    for (const message of messages) {
      await appendTelegramConversationMessage(redis, "chat-1", message, {
        limit: 10,
      });
    }

    const history = await loadTelegramConversationHistory(redis, "chat-1", 10);
    expect(history).toEqual(messages);
  });
});
