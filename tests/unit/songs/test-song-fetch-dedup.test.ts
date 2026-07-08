/**
 * Tests for the song fetch dedup layer.
 *
 * - `fetchSongLyrics` shares in-flight requests and caches responses per
 *   (songId, params) with TTL; `force` bypasses + invalidates.
 * - A caller aborting its own signal must not cancel the shared request for
 *   other awaiters.
 * - `getCachedSongMetadata` dedupes concurrent lookups and memoizes hits.
 * - The iPod library poller probes the lightweight `include=version` endpoint
 *   before downloading the full catalog.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  fetchSongLyrics,
  __clearLyricsCachesForTests,
} from "../../../src/api/songs";
import {
  getCachedSongMetadata,
  invalidateCachedSongMetadata,
} from "../../../src/utils/songMetadataCache";

const originalFetch = globalThis.fetch;

type FetchStub = {
  calls: Array<{ url: string; body: unknown }>;
  restore: () => void;
};

function stubFetch(makeResponse: (url: string, body: unknown) => unknown): FetchStub {
  const calls: FetchStub["calls"] = [];
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url = String(input);
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    return new Response(JSON.stringify(makeResponse(url, body)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

let activeStub: FetchStub | null = null;

beforeEach(() => {
  __clearLyricsCachesForTests();
  invalidateCachedSongMetadata();
});

afterEach(() => {
  activeStub?.restore();
  activeStub = null;
});

describe("fetchSongLyrics dedup", () => {
  test("concurrent identical requests share one HTTP call", async () => {
    activeStub = stubFetch(() => ({ lyrics: { lrc: "[00:00.00]hi" } }));

    const [a, b] = await Promise.all([
      fetchSongLyrics("vid-1", { title: "Song" }),
      fetchSongLyrics("vid-1", { title: "Song" }),
    ]);

    expect(activeStub.calls).toHaveLength(1);
    expect(a.lyrics?.lrc).toBe("[00:00.00]hi");
    expect(b.lyrics?.lrc).toBe("[00:00.00]hi");
  });

  test("a repeat request within the TTL is served from cache", async () => {
    activeStub = stubFetch(() => ({ lyrics: { lrc: "x" } }));

    await fetchSongLyrics("vid-1", { title: "Song" });
    await fetchSongLyrics("vid-1", { title: "Song" });

    expect(activeStub.calls).toHaveLength(1);
  });

  test("different params do not share cache entries", async () => {
    activeStub = stubFetch(() => ({ lyrics: { lrc: "x" } }));

    await fetchSongLyrics("vid-1", { title: "Song" });
    await fetchSongLyrics("vid-1", { title: "Song", translateTo: "ja" });

    expect(activeStub.calls).toHaveLength(2);
  });

  test("force bypasses and invalidates the cache for the song", async () => {
    activeStub = stubFetch(() => ({ lyrics: { lrc: "x" } }));

    await fetchSongLyrics("vid-1", { title: "Song" });
    await fetchSongLyrics("vid-1", { title: "Song", force: true });
    // Cached non-force entry was invalidated by the force request.
    await fetchSongLyrics("vid-1", { title: "Song" });

    expect(activeStub.calls).toHaveLength(3);
  });

  test("one caller aborting does not cancel the shared request", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const calls: unknown[] = [];
    globalThis.fetch = (async () => {
      calls.push(1);
      await gate;
      return new Response(JSON.stringify({ lyrics: { lrc: "shared" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    activeStub = { calls: [], restore: () => (globalThis.fetch = originalFetch) };

    const controller = new AbortController();
    const aborting = fetchSongLyrics("vid-1", {
      title: "Song",
      signal: controller.signal,
    });
    const surviving = fetchSongLyrics("vid-1", { title: "Song" });

    controller.abort();
    await expect(aborting).rejects.toMatchObject({ name: "AbortError" });

    release!();
    const result = await surviving;
    expect(result.lyrics?.lrc).toBe("shared");
    expect(calls).toHaveLength(1);
  });
});

describe("getCachedSongMetadata dedup", () => {
  const metadataDoc = {
    id: "vid-9",
    title: "Title",
    artist: "Artist",
    createdAt: 100,
    updatedAt: 200,
  };

  test("concurrent lookups for the same id share one HTTP call", async () => {
    activeStub = stubFetch(() => metadataDoc);

    const [a, b] = await Promise.all([
      getCachedSongMetadata("vid-9"),
      getCachedSongMetadata("vid-9"),
    ]);

    expect(activeStub.calls).toHaveLength(1);
    expect(a?.youtubeId).toBe("vid-9");
    expect(b?.title).toBe("Title");
  });

  test("hits are memoized; invalidation forces a refetch", async () => {
    activeStub = stubFetch(() => metadataDoc);

    await getCachedSongMetadata("vid-9");
    await getCachedSongMetadata("vid-9");
    expect(activeStub.calls).toHaveLength(1);

    invalidateCachedSongMetadata("vid-9");
    await getCachedSongMetadata("vid-9");
    expect(activeStub.calls).toHaveLength(2);
  });
});

describe("source wiring", () => {
  test("library poller probes the version endpoint before a full fetch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/apps/ipod/hooks/useLibraryUpdateChecker.ts"),
      "utf-8"
    );
    expect(source).toContain("fetchSongsVersion");
    expect(source).toContain("lastInSyncVersionRef");
  });

  test("songs API exposes the lightweight version probe", () => {
    const source = readFileSync(
      resolve(process.cwd(), "api/songs/index.ts"),
      "utf-8"
    );
    expect(source).toContain('includes.includes("version")');
    expect(source).toContain("getSongsVersionInfo");
  });
});
