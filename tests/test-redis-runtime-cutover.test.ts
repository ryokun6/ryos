import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import {
  consumeRealtimeTicket,
  issueRealtimeTicket,
} from "../api/_utils/realtime-auth";
import {
  clearTelegramConversationHistory,
  consumeTelegramLinkCode,
  createTelegramLinkCode,
  loadTelegramConversationHistory,
} from "../api/_utils/telegram-link";
import {
  deleteSong,
  getLegacySongContentKey,
  getLegacySongMetaKey,
  getSong,
  getSongContentKey,
  getSongMetaKey,
  listSongs,
  saveSong,
  SONG_SET_KEY,
} from "../api/_utils/_song-service";
import {
  applySyncOps,
  legacySync2JournalKey,
  legacySync2KvKey,
  legacySync2SeqKey,
  readSyncChanges,
  readSyncSnapshot,
  sync2JournalKey,
  sync2KvKey,
  sync2SeqKey,
} from "../api/sync/v2/_core";
import { redisKeys, sha256RedisIdentifier } from "../src/shared/redisKeys";
import { formatHlc } from "../src/shared/sync2/hlc";
import { FakeRedis } from "./fake-redis";

const hlc = (offsetMs: number, clientId = "client-a") =>
  formatHlc(1_718_180_000_000 + offsetMs, 0, clientId);

describe("runtime Redis canonical cutover", () => {
  test("songs write canonical keys only and still read legacy-only songs", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    await saveSong(redis, {
      id: "am:1441633005",
      title: "Canonical Song",
      lyrics: { lrc: "[00:00.00]hello" },
    });

    expect(await redis.get(getSongMetaKey("am:1441633005"))).not.toBeNull();
    expect(await redis.get(getLegacySongMetaKey("am:1441633005"))).toBeNull();
    expect(await redis.smembers(redisKeys.media.songIds())).toEqual(["am:1441633005"]);
    expect(await redis.smembers(SONG_SET_KEY)).toEqual([]);

    const song = await getSong(redis, "am:1441633005", { includeLyrics: true });
    expect(song?.title).toBe("Canonical Song");
    expect(song?.lyrics?.lrc).toBe("[00:00.00]hello");
    expect((await listSongs(redis)).map((item) => item.id)).toEqual(["am:1441633005"]);

    await redis.set(
      getLegacySongMetaKey("legacy-song"),
      JSON.stringify({ id: "legacy-song", title: "Legacy Song" })
    );
    await redis.set(
      getLegacySongContentKey("legacy-song"),
      JSON.stringify({ lyrics: { lrc: "[00:01.00]legacy" } })
    );
    await redis.sadd(SONG_SET_KEY, "legacy-song");
    const legacySong = await getSong(redis, "legacy-song", { includeLyrics: true });
    expect(legacySong?.title).toBe("Legacy Song");
    expect(legacySong?.lyrics?.lrc).toBe("[00:01.00]legacy");

    expect(await deleteSong(redis, "am:1441633005")).toBe(true);
    expect(await redis.get(getSongMetaKey("am:1441633005"))).toBeNull();
    expect(await redis.get(getSongContentKey("am:1441633005"))).toBeNull();
  });

  test("sync2 writes canonical state only and reads legacy-only users", async () => {
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
    expect(canonicalSnapshot.entries["settings/display"]?.v).toEqual({ desktopScale: 1 });

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
    expect(legacySnapshot.seq).toBe(2);
    expect(legacySnapshot.entries["settings/theme"]?.v).toEqual({ theme: "aqua" });
    const changes = await readSyncChanges(redis, "legacy", 1);
    expect(changes.ops?.[0]?.k).toBe("settings/theme");
  });

  test("realtime tickets write canonical keys only and consume legacy fallback", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const ticket = await issueRealtimeTicket(redis, "Ryo");
    const ticketHash = await sha256RedisIdentifier(ticket);
    expect(await redis.get(redisKeys.realtime.ticket(ticketHash))).toBe("ryo");
    expect(await redis.get(`rt:ticket:${ticket}`)).toBeNull();

    expect(await consumeRealtimeTicket(redis, ticket)).toBe("ryo");
    expect(await redis.get(redisKeys.realtime.ticket(ticketHash))).toBeNull();

    await redis.set("rt:ticket:legacy-ticket", "legacy-user");
    expect(await consumeRealtimeTicket(redis, "legacy-ticket")).toBe("legacy-user");
    expect(await redis.get("rt:ticket:legacy-ticket")).toBeNull();
  });

  test("telegram link codes and history write canonical only with legacy fallback", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const { code } = await createTelegramLinkCode(redis, "Ryo", 60);
    expect(await redis.get(`telegram:link:code:${code}`)).toBeNull();
    expect(await redis.get("telegram:link:username:ryo")).toBeNull();
    expect(await consumeTelegramLinkCode(redis, code)).toEqual({
      username: "ryo",
      createdAt: expect.any(Number),
    });

    await redis.lpush(
      "telegram:history:chat-1",
      JSON.stringify({ role: "user", content: "hello", createdAt: 1 })
    );
    await redis.lpush(
      redisKeys.integration.telegramHistory("chat-1"),
      JSON.stringify({ role: "user", content: "hello", createdAt: 1 })
    );
    expect(await loadTelegramConversationHistory(redis, "chat-1")).toEqual([
      { role: "user", content: "hello", createdAt: 1 },
    ]);

    await clearTelegramConversationHistory(redis, "chat-1");
    expect(await redis.lrange("telegram:history:chat-1", 0, -1)).toEqual([]);
    expect(await redis.lrange(redisKeys.integration.telegramHistory("chat-1"), 0, -1)).toEqual([]);
  });
});
