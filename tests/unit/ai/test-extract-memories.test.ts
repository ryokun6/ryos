import { describe, expect, test } from "bun:test";
import type { Redis } from "../../../api/_utils/redis";
import {
  withMemoryAccountMutation,
  withUserMemoryMutationLock,
} from "../../../api/_utils/_memory";
import {
  getChatMessageTimestamp,
  getDailyNoteDatesToMarkProcessed,
  resolveDailyNoteSourceTimestamp,
  type NormalizedConversationMessage,
} from "../../../api/ai/extract-memories";
import { processDailyNotesForUser } from "../../../api/ai/process-daily-notes";
import { executeMemoryWrite } from "../../../api/chat/tools/executors";
import { redisKeys } from "../../../src/shared/redisKeys";

class MemoryMutationRedis {
  private readonly values = new Map<string, unknown>();
  onBlockedSet: ((key: string) => void) | null = null;
  onGet: ((key: string) => void) | null = null;

  async get<T = unknown>(key: string): Promise<T | null> {
    this.onGet?.(key);
    return (this.values.get(key) ?? null) as T | null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean }
  ): Promise<"OK" | null> {
    if (options?.nx && this.values.has(key)) {
      this.onBlockedSet?.(key);
      return null;
    }
    this.values.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.values.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async eval<T = unknown>(
    _script: string,
    keys: string[],
    args: Array<string | number>
  ): Promise<T> {
    if (this.values.get(keys[0] ?? "") === args[0]) {
      return (await this.del(keys[0] ?? "")) as T;
    }
    return 0 as T;
  }
}

describe("extract memories helpers", () => {
  test("parses chat message timestamps from metadata, strings, and numbers", () => {
    const isoTimestamp = "2026-03-08T01:30:00.000Z";

    expect(
      getChatMessageTimestamp({
        role: "user",
        metadata: {
          createdAt: isoTimestamp,
        },
      })
    ).toBe(new Date(isoTimestamp).getTime());

    expect(
      getChatMessageTimestamp({
        role: "assistant",
        createdAt: 12345,
      })
    ).toBe(12345);

    expect(
      getChatMessageTimestamp({
        role: "user",
        timestamp: 67890,
      })
    ).toBe(67890);
  });

  test("resolves a real source timestamp from the referenced user message", () => {
    const messages: NormalizedConversationMessage[] = [
      {
        role: "user",
        text: "i need to review the cron behavior",
        sourceTimestamp: 100,
      },
      {
        role: "assistant",
        text: "want me to review it with you?",
        sourceTimestamp: 110,
      },
      {
        role: "user",
        text: "yes, tomorrow morning",
        sourceTimestamp: 120,
      },
    ];

    expect(resolveDailyNoteSourceTimestamp(messages, 2)).toBe(120);
  });

  test("falls back to the nearest prior user timestamp when an assistant index is returned", () => {
    const messages: NormalizedConversationMessage[] = [
      {
        role: "user",
        text: "i need to review the cron behavior",
        sourceTimestamp: 100,
      },
      {
        role: "assistant",
        text: "want me to review it with you?",
        sourceTimestamp: 110,
      },
      {
        role: "assistant",
        text: "i can remind you tomorrow morning",
        sourceTimestamp: 120,
      },
    ];

    expect(resolveDailyNoteSourceTimestamp(messages, 2)).toBe(100);
  });

  test("only marks today processed when clear extraction stores source-dated notes", () => {
    expect(
      getDailyNoteDatesToMarkProcessed({
        today: "2026-01-16",
        touchedDates: ["2026-01-15"],
        hasExistingDailyEntries: false,
      })
    ).toEqual([]);

    expect(
      getDailyNoteDatesToMarkProcessed({
        today: "2026-01-16",
        touchedDates: ["2026-01-15", "2026-01-16"],
        hasExistingDailyEntries: false,
      })
    ).toEqual(["2026-01-16"]);
  });

  test("marks today processed when existing daily entries were part of clear extraction", () => {
    expect(
      getDailyNoteDatesToMarkProcessed({
        today: "2026-01-16",
        touchedDates: [],
        hasExistingDailyEntries: true,
      })
    ).toEqual(["2026-01-16"]);
  });

  test("an in-flight extraction skips its write after the account is deleted mid-mutation", async () => {
    const fakeRedis = new MemoryMutationRedis();
    const redis = fakeRedis as unknown as Redis;
    const username = "memory_race_user";
    await fakeRedis.set(
      redisKeys.auth.userProfile(username),
      JSON.stringify({
        username,
        createdAt: 100,
        lastActive: 100,
      })
    );

    let releaseDeletion = () => {};
    const deletionAllowed = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    let markLockHeld = () => {};
    const lockHeld = new Promise<void>((resolve) => {
      markLockHeld = resolve;
    });
    const deletion = withUserMemoryMutationLock(
      redis,
      username,
      async () => {
        markLockHeld();
        await deletionAllowed;
        await fakeRedis.set(
          redisKeys.chat.aiConversationTombstone(username),
          "1"
        );
        await fakeRedis.del(redisKeys.auth.userProfile(username));
      }
    );
    await lockHeld;

    let markOldExtractionBlocked = () => {};
    const oldExtractionBlocked = new Promise<void>((resolve) => {
      markOldExtractionBlocked = resolve;
    });
    fakeRedis.onBlockedSet = (key) => {
      if (key === redisKeys.memory.mutationLock(username)) {
        markOldExtractionBlocked();
      }
    };
    let wroteMemory = false;
    const oldExtractionMutation = withMemoryAccountMutation({
      redis,
      username,
      mutation: async () => {
        wroteMemory = true;
        await fakeRedis.set(
          redisKeys.memory.daily(username, "2026-07-06"),
          "stale"
        );
      },
    });
    await oldExtractionBlocked;

    releaseDeletion();
    await deletion;
    const result = await oldExtractionMutation;

    expect(result).toEqual({ status: "account_deleted" });
    expect(wroteMemory).toBe(false);
    expect(
      await fakeRedis.get(
        redisKeys.memory.daily(username, "2026-07-06")
      )
    ).toBeNull();
  });

  test("a chat memory tool cannot recreate memory after the account is deleted", async () => {
    const fakeRedis = new MemoryMutationRedis();
    const redis = fakeRedis as unknown as Redis;
    const username = "tool_generation_user";
    await fakeRedis.set(redisKeys.chat.aiConversationTombstone(username), "1");
    await fakeRedis.del(redisKeys.memory.index(username));

    const result = await executeMemoryWrite(
      {
        type: "long_term",
        key: "location",
        summary: "User lives in the stale account",
        content: "This must not be recreated.",
        mode: "add",
      },
      {
        redis,
        username,
        env: {},
        log: () => {},
        logError: () => {},
      }
    );

    expect(result.success).toBe(false);
    expect(await fakeRedis.get(redisKeys.memory.index(username))).toBeNull();
    expect(
      await fakeRedis.get(redisKeys.memory.detail(username, "location"))
    ).toBeNull();
  });

  test("the daily-note processor cannot write into a deleted account", async () => {
    const fakeRedis = new MemoryMutationRedis();
    const redis = fakeRedis as unknown as Redis;
    const username = "processor_generation_user";
    const noteDate = "2026-07-05";
    await fakeRedis.set(redisKeys.chat.aiConversationTombstone(username), "1");
    await fakeRedis.set(
      redisKeys.memory.daily(username, noteDate),
      JSON.stringify({
        date: noteDate,
        timeZone: "UTC",
        entries: [{ timestamp: Date.UTC(2026, 6, 5), content: "Deleted account note" }],
        processedForMemories: false,
        updatedAt: Date.UTC(2026, 6, 5),
      })
    );

    const result = await processDailyNotesForUser(
      redis,
      username,
      () => {},
      () => {},
      "UTC"
    );

    expect(result.skippedReason).toBe("account_deleted");
    expect(await fakeRedis.get(redisKeys.memory.index(username))).toBeNull();
    const storedNote = await fakeRedis.get<string>(
      redisKeys.memory.daily(username, noteDate)
    );
    expect(JSON.parse(storedNote || "{}").processedForMemories).toBe(false);
  });

  test("daily-note processing releases only its own process-lock token", async () => {
    const fakeRedis = new MemoryMutationRedis();
    const redis = fakeRedis as unknown as Redis;
    const username = "processor_lock_owner_user";
    const processLockKey = redisKeys.memory.processingLock(username);
    const tombstoneKey = redisKeys.chat.aiConversationTombstone(username);
    await fakeRedis.set(
      redisKeys.auth.userProfile(username),
      JSON.stringify({
        username,
        createdAt: 500,
        lastActive: 500,
      })
    );

    let tombstoneReads = 0;
    fakeRedis.onGet = (key) => {
      if (key !== tombstoneKey) return;
      tombstoneReads += 1;
      if (tombstoneReads === 2) {
        void fakeRedis.set(processLockKey, "replacement-owner", { ex: 120 });
      }
    };

    await processDailyNotesForUser(
      redis,
      username,
      () => {},
      () => {},
      "UTC"
    );

    expect(await fakeRedis.get(processLockKey)).toBe("replacement-owner");
  });
});
