import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import { withUserMemoryMutationLock } from "../api/_utils/_memory";
import {
  getChatMessageTimestamp,
  getDailyNoteDatesToMarkProcessed,
  resolveDailyNoteSourceTimestamp,
  withCurrentAccountMemoryMutation,
  type NormalizedConversationMessage,
} from "../api/ai/extract-memories";
import { processDailyNotesForUser } from "../api/ai/process-daily-notes";
import { executeMemoryWrite } from "../api/chat/tools/executors";
import { redisKeys } from "../src/shared/redisKeys";

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

  test("an old extraction skips its write after same-name re-registration wins the mutation fence", async () => {
    const fakeRedis = new MemoryMutationRedis();
    const redis = fakeRedis as unknown as Redis;
    const username = "memory_race_user";
    const oldAccountCreatedAt = 100;
    const newAccountCreatedAt = 200;
    await fakeRedis.set(
      redisKeys.auth.userProfile(username),
      JSON.stringify({
        username,
        createdAt: oldAccountCreatedAt,
        lastActive: oldAccountCreatedAt,
      })
    );

    let releaseIdentityChange = () => {};
    const identityChangeAllowed = new Promise<void>((resolve) => {
      releaseIdentityChange = resolve;
    });
    let markLockHeld = () => {};
    const lockHeld = new Promise<void>((resolve) => {
      markLockHeld = resolve;
    });
    const identityChange = withUserMemoryMutationLock(
      redis,
      username,
      async () => {
        markLockHeld();
        await identityChangeAllowed;
        await fakeRedis.set(
          redisKeys.chat.aiConversationTombstone(username),
          "1"
        );
        await fakeRedis.set(
          redisKeys.auth.userProfile(username),
          JSON.stringify({
            username,
            createdAt: newAccountCreatedAt,
            lastActive: newAccountCreatedAt,
          })
        );
        await fakeRedis.del(
          redisKeys.chat.aiConversationTombstone(username)
        );
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
    const oldExtractionMutation = withCurrentAccountMemoryMutation({
      redis,
      username,
      accountCreatedAt: oldAccountCreatedAt,
      mutation: async () => {
        wroteMemory = true;
        await fakeRedis.set(
          redisKeys.memory.daily(username, "2026-07-06"),
          "stale"
        );
      },
    });
    await oldExtractionBlocked;

    releaseIdentityChange();
    await identityChange;
    const result = await oldExtractionMutation;

    expect(result).toEqual({ status: "account_changed" });
    expect(wroteMemory).toBe(false);
    expect(
      await fakeRedis.get(
        redisKeys.memory.daily(username, "2026-07-06")
      )
    ).toBeNull();
  });

  test("an old-generation chat memory tool cannot recreate memory after re-registration", async () => {
    const fakeRedis = new MemoryMutationRedis();
    const redis = fakeRedis as unknown as Redis;
    const username = "tool_generation_user";
    const oldAccountCreatedAt = 100;
    const newAccountCreatedAt = 200;
    await fakeRedis.set(
      redisKeys.auth.userProfile(username),
      JSON.stringify({
        username,
        createdAt: oldAccountCreatedAt,
        lastActive: oldAccountCreatedAt,
      })
    );
    await fakeRedis.set(redisKeys.chat.aiConversationTombstone(username), "1");
    await fakeRedis.del(redisKeys.memory.index(username));
    await fakeRedis.set(
      redisKeys.auth.userProfile(username),
      JSON.stringify({
        username,
        createdAt: newAccountCreatedAt,
        lastActive: newAccountCreatedAt,
      })
    );
    await fakeRedis.del(redisKeys.chat.aiConversationTombstone(username));

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
        accountCreatedAt: oldAccountCreatedAt,
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

  test("an old-generation daily-note processor cannot write into a re-registered account", async () => {
    const fakeRedis = new MemoryMutationRedis();
    const redis = fakeRedis as unknown as Redis;
    const username = "processor_generation_user";
    const oldAccountCreatedAt = 300;
    const newAccountCreatedAt = 400;
    const noteDate = "2026-07-05";
    await fakeRedis.set(
      redisKeys.auth.userProfile(username),
      JSON.stringify({
        username,
        createdAt: newAccountCreatedAt,
        lastActive: newAccountCreatedAt,
      })
    );
    await fakeRedis.set(
      redisKeys.memory.daily(username, noteDate),
      JSON.stringify({
        date: noteDate,
        timeZone: "UTC",
        entries: [{ timestamp: Date.UTC(2026, 6, 5), content: "New account note" }],
        processedForMemories: false,
        updatedAt: Date.UTC(2026, 6, 5),
      })
    );

    const result = await processDailyNotesForUser(
      redis,
      username,
      () => {},
      () => {},
      "UTC",
      oldAccountCreatedAt
    );

    expect(result.skippedReason).toBe("account_changed");
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
    const accountCreatedAt = 500;
    const processLockKey = redisKeys.memory.processingLock(username);
    const tombstoneKey = redisKeys.chat.aiConversationTombstone(username);
    await fakeRedis.set(
      redisKeys.auth.userProfile(username),
      JSON.stringify({
        username,
        createdAt: accountCreatedAt,
        lastActive: accountCreatedAt,
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
      "UTC",
      accountCreatedAt
    );

    expect(await fakeRedis.get(processLockKey)).toBe("replacement-owner");
  });
});
