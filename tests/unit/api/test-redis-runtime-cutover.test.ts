import { describe, expect, test } from "bun:test";
import type { Redis } from "../../../api/_utils/redis";
import {
  consumeRealtimeTicket,
  issueRealtimeTicket,
} from "../../../api/_utils/realtime-auth";
import {
  clearTelegramConversationHistory,
  consumeTelegramLinkCode,
  createTelegramLinkCode,
  loadTelegramConversationHistory,
} from "../../../api/_utils/telegram-link";
import {
  deleteSong,
  getSong,
  getSongContentKey,
  getSongMetaKey,
  getSongsVersionInfo,
  listSongs,
  saveSong,
} from "../../../api/_utils/_song-service";
import {
  applySyncOps,
  readSyncChanges,
  readSyncSnapshot,
  sync2JournalKey,
  sync2KvKey,
  sync2SeqKey,
} from "../../../api/sync/v2/_core";
import { redisKeys, sha256RedisIdentifier } from "../../../src/shared/redisKeys";
import { formatHlc } from "../../../src/shared/sync2/hlc";
import { FakeRedis } from "../../helpers/fake-redis";

// Pre-rename legacy key shapes that the runtime must no longer read.
const legacySongMetaKey = (id: string) => `song:meta:${id}`;
const legacySongContentKey = (id: string) => `song:content:${id}`;
const LEGACY_SONG_SET_KEY = "song:all";
const legacySync2SeqKey = (u: string) => `sync2:seq:${u.toLowerCase()}`;
const legacySync2KvKey = (u: string) => `sync2:kv:${u.toLowerCase()}`;
const legacySync2JournalKey = (u: string) => `sync2:jrnl:${u.toLowerCase()}`;

const hlc = (offsetMs: number, clientId = "client-a") =>
  formatHlc(1_718_180_000_000 + offsetMs, 0, clientId);

describe("runtime Redis canonical cutover", () => {
  test("songs read/write canonical keys only and ignore legacy-only songs", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    await saveSong(redis, {
      id: "am:1441633005",
      title: "Canonical Song",
      lyrics: { lrc: "[00:00.00]hello" },
    });

    expect(await redis.get(getSongMetaKey("am:1441633005"))).not.toBeNull();
    expect(await redis.get(legacySongMetaKey("am:1441633005"))).toBeNull();
    expect(await redis.smembers(redisKeys.media.songIds())).toEqual([
      "am:1441633005",
    ]);
    expect(await redis.smembers(LEGACY_SONG_SET_KEY)).toEqual([]);

    const song = await getSong(redis, "am:1441633005", { includeLyrics: true });
    expect(song?.title).toBe("Canonical Song");
    expect(song?.lyrics?.lrc).toBe("[00:00.00]hello");
    expect((await listSongs(redis)).map((item) => item.id)).toEqual([
      "am:1441633005",
    ]);

    // A song that only exists under the legacy scheme must be invisible now.
    await redis.set(
      legacySongMetaKey("legacy-song"),
      JSON.stringify({ id: "legacy-song", title: "Legacy Song" })
    );
    await redis.set(
      legacySongContentKey("legacy-song"),
      JSON.stringify({ lyrics: { lrc: "[00:01.00]legacy" } })
    );
    await redis.sadd(LEGACY_SONG_SET_KEY, "legacy-song");

    expect(await getSong(redis, "legacy-song", { includeLyrics: true })).toBeNull();
    expect((await listSongs(redis)).map((item) => item.id)).toEqual([
      "am:1441633005",
    ]);

    expect(await deleteSong(redis, "am:1441633005")).toBe(true);
    expect(await redis.get(getSongMetaKey("am:1441633005"))).toBeNull();
    expect(await redis.get(getSongContentKey("am:1441633005"))).toBeNull();
  });

  test("song catalog listing and version probe batch metadata reads", async () => {
    class CountingRedis extends FakeRedis {
      getCalls = 0;
      mgetCalls = 0;
      maxMgetKeys = 0;

      override async get<T = unknown>(key: string): Promise<T | null> {
        this.getCalls += 1;
        return super.get<T>(key);
      }

      override async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
        this.mgetCalls += 1;
        this.maxMgetKeys = Math.max(this.maxMgetKeys, keys.length);
        return super.mget<T>(...keys);
      }

      resetCounts() {
        this.getCalls = 0;
        this.mgetCalls = 0;
        this.maxMgetKeys = 0;
      }
    }

    const fake = new CountingRedis();
    const redis = fake as unknown as Redis;

    for (let index = 0; index < 125; index++) {
      const id = `song-${index}`;
      await redis.set(
        getSongMetaKey(id),
        JSON.stringify({
          id,
          title: `Song ${index}`,
          coverColor: "#123456",
          createdBy: index % 2 === 0 ? "ryo" : "alice",
          createdAt: 1_718_180_000_000 + index,
          updatedAt: 1_718_180_001_000 + index,
        })
      );
      await redis.sadd(redisKeys.media.songIds(), id);
    }

    fake.resetCounts();
    const listed = await listSongs(redis, { createdBy: "ryo" });
    expect(listed).toHaveLength(63);
    expect(listed[0].coverColor).toBe("#123456");
    expect(fake.getCalls).toBe(0);
    expect(fake.mgetCalls).toBe(2);
    expect(fake.maxMgetKeys).toBeLessThanOrEqual(100);

    fake.resetCounts();
    const versionInfo = await getSongsVersionInfo(redis, { createdBy: "ryo" });
    expect(versionInfo).toEqual({
      count: 63,
      version: 1_718_180_001_124,
    });
    expect(fake.getCalls).toBe(0);
    expect(fake.mgetCalls).toBe(2);
    expect(fake.maxMgetKeys).toBeLessThanOrEqual(100);
  });

  test("sync2 reads/writes canonical state only and ignores legacy-only users", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const result = await applySyncOps(
      redis,
      "ryo",
      [{ k: "settings/display", v: { desktopScale: 1 }, t: hlc(0) }],
      "client-a",
      { trusted: true }
    );

    expect(result.seq).toBe(1);
    expect(await redis.get(sync2SeqKey("ryo"))).toBe("1");
    expect(await redis.get(legacySync2SeqKey("ryo"))).toBeNull();
    expect(await redis.hget(sync2KvKey("ryo"), "settings/display")).not.toBeNull();
    expect(await redis.hget(legacySync2KvKey("ryo"), "settings/display")).toBeNull();
    expect(await redis.zcard(sync2JournalKey("ryo"))).toBe(1);
    expect(await redis.zcard(legacySync2JournalKey("ryo"))).toBe(0);

    const canonicalSnapshot = await readSyncSnapshot(redis, "ryo");
    expect(canonicalSnapshot.entries["settings/display"]?.v).toEqual({
      desktopScale: 1,
    });

    // State that only exists under the legacy `sync2:*` scheme must be ignored.
    fake.setSync(legacySync2SeqKey("legacy"), "2");
    await redis.hset(legacySync2KvKey("legacy"), {
      "settings/theme": JSON.stringify({
        v: { theme: "aqua" },
        t: hlc(1, "legacy"),
        seq: 2,
      }),
    });
    await redis.zadd(legacySync2JournalKey("legacy"), {
      score: 2,
      member: JSON.stringify({
        k: "settings/theme",
        v: { theme: "aqua" },
        t: hlc(1, "legacy"),
        seq: 2,
        c: "legacy-client",
      }),
    });

    const legacySnapshot = await readSyncSnapshot(redis, "legacy");
    expect(legacySnapshot.seq).toBe(0);
    expect(legacySnapshot.entries["settings/theme"]).toBeUndefined();
    const changes = await readSyncChanges(redis, "legacy", 1);
    expect(changes.ops ?? []).toEqual([]);
  });

  test("realtime tickets write canonical keys only and ignore legacy tickets", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const ticket = await issueRealtimeTicket(redis, "Ryo");
    const ticketHash = await sha256RedisIdentifier(ticket);
    expect(await redis.get(redisKeys.realtime.ticket(ticketHash))).toBe("ryo");
    expect(await redis.get(`rt:ticket:${ticket}`)).toBeNull();

    expect(await consumeRealtimeTicket(redis, ticket)).toBe("ryo");
    expect(await redis.get(redisKeys.realtime.ticket(ticketHash))).toBeNull();

    // A legacy-only ticket must not be consumable and must be left untouched.
    await redis.set("rt:ticket:legacy-ticket", "legacy-user");
    expect(await consumeRealtimeTicket(redis, "legacy-ticket")).toBeNull();
    expect(await redis.get("rt:ticket:legacy-ticket")).toBe("legacy-user");
  });

  test("telegram link codes and history write canonical only and ignore legacy", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const { code } = await createTelegramLinkCode(redis, "Ryo", 60);
    expect(await redis.get(`telegram:link:code:${code}`)).toBeNull();
    expect(await redis.get("telegram:link:username:ryo")).toBeNull();
    expect(await consumeTelegramLinkCode(redis, code)).toEqual({
      username: "ryo",
      createdAt: expect.any(Number),
    });

    // History stored only under the legacy key must be ignored.
    await redis.lpush(
      "telegram:history:chat-1",
      JSON.stringify({ role: "user", content: "legacy", createdAt: 1 })
    );
    await redis.lpush(
      redisKeys.integration.telegramHistory("chat-1"),
      JSON.stringify({ role: "user", content: "hello", createdAt: 2 })
    );
    expect(await loadTelegramConversationHistory(redis, "chat-1")).toEqual([
      { role: "user", content: "hello", createdAt: 2 },
    ]);

    await clearTelegramConversationHistory(redis, "chat-1");
    expect(
      await redis.lrange(redisKeys.integration.telegramHistory("chat-1"), 0, -1)
    ).toEqual([]);
    // The legacy list is never touched by the canonical clear path.
    expect(await redis.lrange("telegram:history:chat-1", 0, -1)).toEqual([
      JSON.stringify({ role: "user", content: "legacy", createdAt: 1 }),
    ]);
  });
});
