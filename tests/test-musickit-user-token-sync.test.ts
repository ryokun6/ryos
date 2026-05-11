/**
 * Unit tests for the MusicKit user-token cloud-sync surface.
 *
 *   - `parseStoredToken`    (server)  — input validation / shape handling
 *   - `musickitUserTokenKey` (server) — Redis key derivation
 *   - `isExpired`           (client)  — client-side expiry predicate
 *
 * Integration coverage for the HTTP endpoint itself
 * (GET / PUT / DELETE round trip with auth) lives in the standalone
 * API server test suite — these tests focus on the pure helpers so
 * they don't need a running Redis or fake-indexeddb.
 */

import { describe, expect, test } from "bun:test";

// Browser globals must be installed before importing the client-side
// sync helper, because it transitively touches zustand stores that
// read from localStorage at module init. Static `import` is hoisted,
// so we install the globals first and then resolve every browser-side
// module via top-level `await import(...)` (mirrors
// test-ipod-apple-music.test.ts).
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

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
  navigator?: Navigator;
};
if (!browserGlobals.localStorage) {
  browserGlobals.localStorage = new MemoryStorage();
}
if (!browserGlobals.navigator) {
  browserGlobals.navigator = { onLine: true, userAgent: "test" } as Navigator;
}

// Server-side imports — no browser globals needed.
import {
  parseStoredToken,
  MAX_TOKEN_LENGTH,
} from "../api/sync/musickit-user-token";
import { musickitUserTokenKey } from "../api/sync/_keys";

// Client-side imports — must run *after* the browser-global stubs.
const {
  fetchMusicKitUserTokenFromCloud,
  isExpired,
  saveMusicKitUserTokenToCloud,
  clearCachedMusicKitUserToken,
  clearMusicKitUserTokenIfStale,
} = await import("../src/utils/musicKitUserTokenCloudSync");
const { useChatsStore } = await import("../src/stores/useChatsStore");
const { useCloudSyncStore } = await import(
  "../src/stores/useCloudSyncStore"
);

describe("parseStoredToken (server)", () => {
  test("returns null for falsy / non-object inputs", () => {
    expect(parseStoredToken(null)).toBeNull();
    expect(parseStoredToken(undefined)).toBeNull();
    expect(parseStoredToken("")).toBeNull();
    expect(parseStoredToken(0)).toBeNull();
    expect(parseStoredToken(false)).toBeNull();
  });

  test("returns null when the JSON string fails to parse", () => {
    expect(parseStoredToken("{ broken json")).toBeNull();
  });

  test("returns null when the parsed object has no musicUserToken", () => {
    expect(parseStoredToken({})).toBeNull();
    expect(parseStoredToken({ musicUserToken: "" })).toBeNull();
    expect(parseStoredToken({ musicUserToken: 42 })).toBeNull();
  });

  test("accepts an already-parsed object", () => {
    const result = parseStoredToken({
      musicUserToken: "user-token-xyz",
      expiresAt: 1_700_000_000_000,
      storedAt: 1_699_999_999_000,
    });
    expect(result).toEqual({
      musicUserToken: "user-token-xyz",
      expiresAt: 1_700_000_000_000,
      storedAt: 1_699_999_999_000,
    });
  });

  test("accepts a JSON-encoded string and decodes it", () => {
    const raw = JSON.stringify({
      musicUserToken: "abc.def.ghi",
      expiresAt: 1_750_000_000_000,
      storedAt: 1_749_000_000_000,
    });
    const result = parseStoredToken(raw);
    expect(result).toEqual({
      musicUserToken: "abc.def.ghi",
      expiresAt: 1_750_000_000_000,
      storedAt: 1_749_000_000_000,
    });
  });

  test("coerces missing/invalid expiresAt to null and missing storedAt to a recent value", () => {
    const before = Date.now();
    const result = parseStoredToken({
      musicUserToken: "tok",
      expiresAt: "not-a-number",
    });
    const after = Date.now();
    expect(result?.musicUserToken).toBe("tok");
    expect(result?.expiresAt).toBeNull();
    // storedAt is filled in defensively when absent so downstream
    // consumers can always rely on a number.
    expect(result?.storedAt).toBeGreaterThanOrEqual(before);
    expect(result?.storedAt).toBeLessThanOrEqual(after);
  });
});

describe("musickitUserTokenKey (server)", () => {
  test("namespaces under the shared sync:* Redis prefix", () => {
    // Sharing the prefix with other /api/sync/* keys keeps this
    // entry visible to operator tooling that scans the sync
    // namespace (TTL reports, backfills, deletion-on-account-purge).
    expect(musickitUserTokenKey("ryo")).toBe(
      "sync:musickit-user-token:ryo"
    );
  });

  test("lowercases the username so case-variants share storage", () => {
    expect(musickitUserTokenKey("RYO")).toBe("sync:musickit-user-token:ryo");
    expect(musickitUserTokenKey("Ryo")).toBe("sync:musickit-user-token:ryo");
  });

  test("MAX_TOKEN_LENGTH is large enough for real Apple-issued user tokens", () => {
    // Apple Music user tokens are typically a few hundred chars; the
    // 4 KiB cap leaves headroom for future format changes without
    // accepting nonsense-sized payloads.
    expect(MAX_TOKEN_LENGTH).toBeGreaterThan(1024);
  });
});

describe("cloud-sync gating (client)", () => {
  // The cloud helpers must silently no-op whenever (a) the user isn't
  // signed in to ryOS, or (b) Auto Sync is off. Local IndexedDB
  // persistence is intentionally untouched here — only the
  // /api/sync/musickit-user-token network call is gated.

  type FetchCall = { url: string; method?: string };
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  function installFakeFetch(response: Response) {
    calls.length = 0;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      calls.push({ url, method: init?.method });
      return response.clone();
    }) as typeof fetch;
  }

  function restoreFetch() {
    globalThis.fetch = originalFetch;
  }

  function setAuthAndSync(opts: {
    authenticated: boolean;
    autoSyncEnabled: boolean;
  }) {
    useChatsStore.setState({
      username: opts.authenticated ? "syncuser" : null,
      isAuthenticated: opts.authenticated,
    });
    useCloudSyncStore.setState({ autoSyncEnabled: opts.autoSyncEnabled });
  }

  test("fetch is skipped entirely when the user isn't signed in", async () => {
    installFakeFetch(
      new Response(JSON.stringify({ musicUserToken: "should-not-reach" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    try {
      setAuthAndSync({ authenticated: false, autoSyncEnabled: true });
      const result = await fetchMusicKitUserTokenFromCloud();
      expect(result).toBeNull();
      expect(calls).toHaveLength(0);
    } finally {
      restoreFetch();
    }
  });

  test("fetch is skipped when signed in but Auto Sync is off", async () => {
    installFakeFetch(
      new Response(JSON.stringify({ musicUserToken: "should-not-reach" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    try {
      setAuthAndSync({ authenticated: true, autoSyncEnabled: false });
      const result = await fetchMusicKitUserTokenFromCloud();
      expect(result).toBeNull();
      expect(calls).toHaveLength(0);
    } finally {
      restoreFetch();
    }
  });

  test("PUT is skipped when Auto Sync is off (local-only world)", async () => {
    installFakeFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    try {
      setAuthAndSync({ authenticated: true, autoSyncEnabled: false });
      await saveMusicKitUserTokenToCloud({
        musicUserToken: "abc",
        expiresAt: null,
        storedAt: Date.now(),
      });
      expect(calls).toHaveLength(0);
    } finally {
      restoreFetch();
    }
  });

  test("PUT fires when signed in AND Auto Sync is on", async () => {
    installFakeFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    try {
      setAuthAndSync({ authenticated: true, autoSyncEnabled: true });
      await saveMusicKitUserTokenToCloud({
        musicUserToken: "abc.def.ghi",
        expiresAt: null,
        storedAt: Date.now(),
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/api/sync/musickit-user-token");
    } finally {
      restoreFetch();
    }
  });

  test("GET fires when signed in AND Auto Sync is on, and parses the response", async () => {
    installFakeFetch(
      new Response(
        JSON.stringify({
          musicUserToken: "fetched-from-cloud",
          expiresAt: Date.now() + 60_000,
          storedAt: Date.now() - 1000,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    try {
      setAuthAndSync({ authenticated: true, autoSyncEnabled: true });
      const result = await fetchMusicKitUserTokenFromCloud();
      expect(result?.musicUserToken).toBe("fetched-from-cloud");
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/api/sync/musickit-user-token");
    } finally {
      restoreFetch();
    }
  });
});

describe("CAS-DELETE for stale-token cleanup (client)", () => {
  // The compare-and-swap delete is what protects multi-device users:
  // a device that discovers its token went stale shouldn't wipe a
  // fresh token another device just wrote to cloud. The client always
  // wipes the local IDB cache, but the cloud DELETE goes out with an
  // `ifMusicUserToken` body that the server uses to decide whether to
  // delete the row at all.

  type FetchCall = { url: string; method?: string; body?: unknown };
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  function installFakeFetch(response: Response) {
    calls.length = 0;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      let parsedBody: unknown = init?.body;
      if (typeof init?.body === "string") {
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          parsedBody = init.body;
        }
      }
      calls.push({ url, method: init?.method, body: parsedBody });
      return response.clone();
    }) as typeof fetch;
  }

  function restoreFetch() {
    globalThis.fetch = originalFetch;
  }

  function setAuth(authenticated: boolean) {
    useChatsStore.setState({
      username: authenticated ? "syncuser" : null,
      isAuthenticated: authenticated,
    });
    // The DELETE path intentionally bypasses the autoSyncEnabled
    // gate — but we still need the user signed in for the network
    // call to fire at all.
    useCloudSyncStore.setState({ autoSyncEnabled: false });
  }

  test("clearMusicKitUserTokenIfStale sends an ifMusicUserToken body for CAS", async () => {
    installFakeFetch(
      new Response(JSON.stringify({ ok: true, deleted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    try {
      setAuth(true);
      await clearMusicKitUserTokenIfStale("stale-token-abc");
      const deleteCall = calls.find((c) => c.method === "DELETE");
      expect(deleteCall).toBeDefined();
      expect(deleteCall!.url).toContain("/api/sync/musickit-user-token");
      expect(deleteCall!.body).toEqual({ ifMusicUserToken: "stale-token-abc" });
    } finally {
      restoreFetch();
    }
  });

  test("clearCachedMusicKitUserToken passes the CAS guard through to cloud", async () => {
    installFakeFetch(
      new Response(JSON.stringify({ ok: true, deleted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    try {
      setAuth(true);
      await clearCachedMusicKitUserToken("user-revoked-this-one");
      const deleteCall = calls.find((c) => c.method === "DELETE");
      expect(deleteCall).toBeDefined();
      expect(deleteCall!.body).toEqual({
        ifMusicUserToken: "user-revoked-this-one",
      });
    } finally {
      restoreFetch();
    }
  });

  test("clearCachedMusicKitUserToken without a token argument falls back to unconditional DELETE", async () => {
    installFakeFetch(
      new Response(JSON.stringify({ ok: true, deleted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    try {
      setAuth(true);
      await clearCachedMusicKitUserToken();
      const deleteCall = calls.find((c) => c.method === "DELETE");
      expect(deleteCall).toBeDefined();
      // No body == unconditional DELETE (historical shape, used by
      // account-purge tooling).
      expect(deleteCall!.body).toBeUndefined();
    } finally {
      restoreFetch();
    }
  });

  test("clearMusicKitUserTokenIfStale silently no-ops when the user isn't signed in", async () => {
    installFakeFetch(
      new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 })
    );
    try {
      setAuth(false);
      await clearMusicKitUserTokenIfStale("any-token");
      expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
    } finally {
      restoreFetch();
    }
  });
});

describe("isExpired (client)", () => {
  test("treats null expiresAt as 'unknown — not expired'", () => {
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: null,
        storedAt: 0,
      })
    ).toBe(false);
  });

  test("returns true for a past expiresAt", () => {
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: Date.now() - 1000,
        storedAt: 0,
      })
    ).toBe(true);
  });

  test("returns false for a future expiresAt", () => {
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: Date.now() + 60_000,
        storedAt: 0,
      })
    ).toBe(false);
  });

  test("returns true at the exact expiry boundary (defense in depth)", () => {
    const now = Date.now();
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: now,
        storedAt: 0,
      })
    ).toBe(true);
  });
});
