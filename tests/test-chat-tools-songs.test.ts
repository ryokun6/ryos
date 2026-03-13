import { describe, expect, mock, test } from "bun:test";
import type { Redis } from "@upstash/redis";
import { createChatTools } from "../api/chat/tools/index.js";
import { writeSongsState } from "../api/_utils/song-library-state.js";
import { saveSong } from "../api/_utils/_song-service.js";

class FakeRedisPipeline {
  private operations: Array<() => void> = [];

  constructor(private readonly redis: FakeRedis) {}

  set(key: string, value: unknown): this {
    this.operations.push(() => {
      this.redis.setSync(key, value);
    });
    return this;
  }

  del(...keys: string[]): this {
    this.operations.push(() => {
      this.redis.delSync(...keys);
    });
    return this;
  }

  async exec(): Promise<unknown[]> {
    for (const operation of this.operations) {
      operation();
    }
    return [];
  }
}

class FakeRedis {
  private readonly kv = new Map<string, string>();
  private readonly sets = new Map<string, Set<string>>();

  setSync(key: string, value: unknown): void {
    this.kv.set(
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    );
  }

  delSync(...keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.kv.delete(key)) deleted += 1;
      if (this.sets.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.kv.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<string> {
    this.setSync(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    return this.delSync(...keys);
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.some((key) => this.kv.has(key) || this.sets.has(key)) ? 1 : 0;
  }

  pipeline(): FakeRedisPipeline {
    return new FakeRedisPipeline(this);
  }

  async smembers<T = string[]>(key: string): Promise<T> {
    return Array.from(this.sets.get(key) || []) as T;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) || new Set<string>();
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added += 1;
      }
    }
    this.sets.set(key, set);
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) {
        removed += 1;
      }
    }
    if (set.size === 0) {
      this.sets.delete(key);
    }
    return removed;
  }

  async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
    return keys.map((key) => (this.kv.get(key) as T | undefined) ?? null);
  }
}

function createContext(redis: FakeRedis, username: string | null = "alice") {
  return {
    log: mock(() => {}),
    logError: mock(() => {}),
    env: {},
    username,
    redis: redis as unknown as Redis,
    timeZone: "UTC",
  };
}

async function seedSongs(redis: FakeRedis): Promise<void> {
  await writeSongsState(
    redis as unknown as Redis,
    "alice",
    {
      tracks: [
        {
          id: "song_user_1",
          url: "https://www.youtube.com/watch?v=song_user_1",
          title: "Shared Song",
          artist: "Alice Artist",
          album: "User Album",
          cover: "https://example.com/user-cover.png",
        },
        {
          id: "song_user_2",
          url: "https://www.youtube.com/watch?v=song_user_2",
          title: "Private Favorite",
          artist: "Alice Artist",
        },
      ],
      libraryState: "loaded",
      lastKnownVersion: 9,
    }
  );

  await saveSong(redis as unknown as Redis, {
    id: "song_user_1",
    title: "Shared Song",
    artist: "Cache Artist",
    album: "Global Album",
    cover: "https://example.com/global-cover.png",
    createdBy: "ryo",
    createdAt: 111,
    lyricsSource: {
      hash: "hash-1",
      albumId: "album-1",
      title: "Shared Song",
      artist: "Cache Artist",
    },
    lyrics: { lrc: "[00:00.00]hello world" },
    translations: { en: "[00:00.00]hello world" },
    furigana: [[{ text: "hello" }]],
  });

  await saveSong(redis as unknown as Redis, {
    id: "song_global_1",
    title: "Global Only Song",
    artist: "Server Artist",
    createdBy: "ryo",
    createdAt: 222,
  });
}

describe("song library chat tools", () => {
  test("all profile exposes server-executed songLibraryControl", () => {
    const tools = createChatTools(createContext(new FakeRedis()), { profile: "all" });
    expect("songLibraryControl" in tools).toBe(true);
    expect(typeof tools.songLibraryControl.execute).toBe("function");
  });

  test("telegram profile exposes server-executed songLibraryControl", () => {
    const tools = createChatTools(createContext(new FakeRedis()), { profile: "telegram" });
    expect("songLibraryControl" in tools).toBe(true);
    expect(typeof tools.songLibraryControl.execute).toBe("function");
  });

  test("searches the user library and returns canonical ryOS links", async () => {
    const redis = new FakeRedis();
    await seedSongs(redis);
    const tools = createChatTools(createContext(redis), { profile: "telegram" });

    const result = await tools.songLibraryControl.execute?.({
      action: "search",
      scope: "user",
      query: "private favorite",
      limit: 5,
    });

    expect(result?.success).toBe(true);
    expect(result?.scope).toBe("user");
    expect(result?.songs).toHaveLength(1);
    expect(result?.songs?.[0]?.id).toBe("song_user_2");
    expect(result?.songs?.[0]?.ipodUrl).toBe("https://os.ryo.lu/ipod/song_user_2");
    expect(result?.songs?.[0]?.karaokeUrl).toBe(
      "https://os.ryo.lu/karaoke/song_user_2"
    );
  });

  test("gets combined metadata when a song exists in user and global libraries", async () => {
    const redis = new FakeRedis();
    await seedSongs(redis);
    const tools = createChatTools(createContext(redis), { profile: "telegram" });

    const result = await tools.songLibraryControl.execute?.({
      action: "get",
      scope: "any",
      id: "song_user_1",
    });

    expect(result?.success).toBe(true);
    expect(result?.scope).toBe("any");
    expect(result?.song?.source).toBe("combined");
    expect(result?.song?.inUserLibrary).toBe(true);
    expect(result?.song?.createdBy).toBe("ryo");
    expect(result?.song?.hasLyrics).toBe(true);
    expect(result?.song?.hasTranslations).toBe(true);
    expect(result?.song?.hasFurigana).toBe(true);
    expect(result?.song?.ipodUrl).toBe("https://os.ryo.lu/ipod/song_user_1");
  });

  test("requires auth for user-scope song lookups", async () => {
    const redis = new FakeRedis();
    await seedSongs(redis);
    const tools = createChatTools(createContext(redis, null), { profile: "telegram" });

    const result = await tools.songLibraryControl.execute?.({
      action: "search",
      scope: "user",
      query: "shared",
    });

    expect(result?.success).toBe(false);
    expect((result?.message || "").toLowerCase()).toContain("authentication");
    expect(result?.scope).toBe("user");
  });
});
