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
  test("songs write canonical and legacy keys and read after legacy keys are gone", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    await saveSong(redis, {
      id: "am:1441633005",
      title: "Canonical Song",
      lyrics: { lrc: "[00:00.00]hello" },
    });

    expect(await redis.get(getSongMetaKey("am:1441633005"))).not.toBeNull();
    expect(await redis.get(getLegacySongMetaKey("am:1441633005"))).not.toBeNull();
    expect(await redis.smembers(redisKeys.media.songIds())).toEqual(["am:1441633005"]);
    expect(await redis.smembers(SONG_SET_KEY)).toEqual(["am:1441633005"]);

    await redis.del(
      getLegacySongMetaKey("am:1441633005"),
      getLegacySongContentKey("am:1441633005"),
      SONG_SET_KEY
    );

    const song = await getSong(redis, "am:1441633005", { includeLyrics: true });
    expect(song?.title).toBe("Canonical Song");
    expect(song?.lyrics?.lrc).toBe("[00:00.00]hello");
    expect((await listSongs(redis)).map((item) => item.id)).toEqual(["am:1441633005"]);

    expect(await deleteSong(redis, "am:1441633005")).toBe(true);
    expect(await redis.get(getSongMetaKey("am:1441633005"))).toBeNull();
    expect(await redis.get(getSongContentKey("am:1441633005"))).toBeNull();
  });

  test("sync2 writes canonical and legacy state and reads legacy-only users", async () => {
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
    expect(await redis.get(legacySync2SeqKey("ryo"))).toBe("1");
    expect(await redis.hget(sync2KvKey("ryo"), "settings/display")).not.toBeNull();
    expect(await redis.hget(legacySync2KvKey("ryo"), "settings/display")).not.toBeNull();
    expect(await redis.zcard(sync2JournalKey("ryo"))).toBe(1);
    expect(await redis.zcard(legacySync2JournalKey("ryo"))).toBe(1);

    await redis.del(legacySync2SeqKey("ryo"), legacySync2KvKey("ryo"), legacySync2JournalKey("ryo"));
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

  test("realtime tickets consume canonical keys after legacy ticket deletion", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const ticket = await issueRealtimeTicket(redis, "Ryo");
    const ticketHash = await sha256RedisIdentifier(ticket);
    expect(await redis.get(redisKeys.realtime.ticket(ticketHash))).toBe("ryo");

    await redis.del(`rt:ticket:${ticket}`);
    expect(await consumeRealtimeTicket(redis, ticket)).toBe("ryo");
    expect(await redis.get(redisKeys.realtime.ticket(ticketHash))).toBeNull();
  });

  test("telegram link codes and history use canonical keys with legacy fallback", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const { code } = await createTelegramLinkCode(redis, "Ryo", 60);
    await redis.del(`telegram:link:code:${code}`, "telegram:link:username:ryo");
    expect(await consumeTelegramLinkCode(redis, code)).toEqual({
      username: "ryo",
      createdAt: expect.any(Number),
    });

    await redis.lpush(
      "telegram:history:chat-1",
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
