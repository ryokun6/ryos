import { describe, expect, test } from "bun:test";
import {
  ANON_KARAOKE_CLIENT_ID_KEY,
  ANON_KARAOKE_GENERATED_SONGS_KEY,
  ANON_KARAOKE_GENERATION_LIMIT,
  attachAnonKaraokeClient,
  getAnonKaraokeClientId,
  readAnonGeneratedSongIds,
  recordAnonGeneratedSong,
} from "../../../src/utils/anonKaraokeGeneration";
import {
  DEFAULT_LYRICS_FONT,
  LyricsFont,
  getLyricsFontClassName,
  resolveLyricsFont,
} from "../../../src/types/lyrics";
import {
  allowLyricsGeneration,
  claimAnonymousKaraokeSong,
} from "../../../api/songs/_anon-generation";
import { lyricsGenerationBlockedToastOptions } from "../../../src/utils/chunkedStream";
import { LyricsGenerationBlockedError } from "../../../src/utils/chunkedStream";
import i18n from "../../../src/lib/i18n";
import enShell from "../../../src/lib/locales/en/shell.json";
import {
  REQUEST_SIGN_IN_EVENT,
  dispatchSignInRequest,
} from "../../../src/utils/requestSignIn";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    data,
  };
}

function memoryRedis() {
  const sets = new Map<string, Set<string>>();
  return {
    async sadd(key: string, ...members: string[]) {
      const set = sets.get(key) ?? new Set<string>();
      let added = 0;
      for (const member of members) {
        if (!set.has(member)) {
          set.add(member);
          added += 1;
        }
      }
      sets.set(key, set);
      return added;
    },
    async scard(key: string) {
      return sets.get(key)?.size ?? 0;
    },
    async srem(key: string, ...members: string[]) {
      const set = sets.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const member of members) {
        if (set.delete(member)) removed += 1;
      }
      return removed;
    },
  };
}

describe("lyrics style default", () => {
  test("unset preferences use the rounded outline style", async () => {
    expect(DEFAULT_LYRICS_FONT).toBe(LyricsFont.Rounded);
    expect(resolveLyricsFont(undefined)).toBe(LyricsFont.Rounded);
    expect(resolveLyricsFont(null)).toBe(LyricsFont.Rounded);
    expect(getLyricsFontClassName(resolveLyricsFont(undefined))).toBe(
      "font-lyrics-rounded"
    );
    const { useIpodStore } = await import("../../../src/stores/useIpodStore");
    expect(useIpodStore.getInitialState().lyricsFont).toBe(LyricsFont.Rounded);
  });

  test("a saved style is left unchanged", () => {
    expect(resolveLyricsFont(LyricsFont.GoldGlow)).toBe(LyricsFont.GoldGlow);
    expect(resolveLyricsFont(LyricsFont.SerifRed)).toBe(LyricsFont.SerifRed);
  });
});

describe("anonymous karaoke generation quota", () => {
  test("records three songs in local storage and ignores repeats", () => {
    const storage = memoryStorage();
    expect(recordAnonGeneratedSong("song-1", storage)).toMatchObject({
      count: 1,
      recorded: true,
      reachedLimit: false,
    });
    expect(recordAnonGeneratedSong("song-1", storage).recorded).toBe(false);
    recordAnonGeneratedSong("song-2", storage);
    const third = recordAnonGeneratedSong("song-3", storage);
    expect(third).toMatchObject({
      count: ANON_KARAOKE_GENERATION_LIMIT,
      recorded: true,
      reachedLimit: true,
    });
    const fourth = recordAnonGeneratedSong("song-4", storage);
    expect(fourth.recorded).toBe(false);
    expect(fourth.count).toBe(3);
    expect(readAnonGeneratedSongIds(storage)).toEqual([
      "song-1",
      "song-2",
      "song-3",
    ]);
    expect(storage.data[ANON_KARAOKE_GENERATED_SONGS_KEY]).toContain("song-3");
  });

  test("keeps a stable anonymous client id and omits it for signed-in requests", () => {
    const storage = memoryStorage();
    const first = getAnonKaraokeClientId(storage);
    const second = getAnonKaraokeClientId(storage);
    expect(second).toBe(first);
    expect(storage.data[ANON_KARAOKE_CLIENT_ID_KEY]).toBe(first);
    expect(first.length).toBeGreaterThanOrEqual(8);

    const signedIn = attachAnonKaraokeClient(
      { action: "translate-stream" },
      { username: "ada", isAuthenticated: true }
    );
    expect(signedIn).toEqual({ action: "translate-stream" });
    expect(signedIn).not.toHaveProperty("anonClientId");
  });

  test("server allows three songs for an anonymous client and blocks the fourth", async () => {
    const redis = memoryRedis();
    const clientId = "clientabc123";
    expect(await claimAnonymousKaraokeSong(redis, clientId, "a")).toBe(true);
    expect(await claimAnonymousKaraokeSong(redis, clientId, "b")).toBe(true);
    expect(await claimAnonymousKaraokeSong(redis, clientId, "a")).toBe(true);
    expect(await claimAnonymousKaraokeSong(redis, clientId, "c")).toBe(true);
    expect(await claimAnonymousKaraokeSong(redis, clientId, "d")).toBe(false);
    expect(await claimAnonymousKaraokeSong(redis, clientId, "c")).toBe(true);
  });

  test("signed-in users skip the anonymous song cap", async () => {
    let claims = 0;
    const allowed = await allowLyricsGeneration({
      username: "ada",
      body: {},
      songId: "song",
      claim: async () => {
        claims += 1;
        return false;
      },
    });
    expect(allowed).toBe(true);
    expect(claims).toBe(0);
  });

  test("anonymous requests without a client id stay blocked", async () => {
    const allowed = await allowLyricsGeneration({
      username: null,
      body: { action: "translate-stream" },
      songId: "song",
      claim: async () => true,
    });
    expect(allowed).toBe(false);
  });
});

describe("lyrics sign-in toast", () => {
  test("auth-required toast includes a Sign In action", async () => {
    if (!i18n.isInitialized) {
      await i18n.init({
        lng: "en",
        resources: { en: { translation: enShell } },
        interpolation: { escapeValue: false },
      });
    }
    const options = lyricsGenerationBlockedToastOptions(
      new LyricsGenerationBlockedError("auth_required")
    );
    expect(options.action?.label).toBe("Sign In");
    expect(typeof options.action?.onClick).toBe("function");
  });

  test("requestSignIn dispatches the shell sign-in event", () => {
    const target = new EventTarget();
    let seen = 0;
    target.addEventListener(REQUEST_SIGN_IN_EVENT, () => {
      seen += 1;
    });
    dispatchSignInRequest(target);
    expect(seen).toBe(1);
  });
});
