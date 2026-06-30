import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ensureTestLocalStorage } from "./setup";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}
ensureTestLocalStorage();

interface LyricsResponse {
  lyrics: {
    parsedLines: Array<{ startTimeMs: string; words: string }>;
  };
  translation: {
    totalLines: number;
    cached: boolean;
    lrc: string;
  };
}

const originalFetch = globalThis.fetch;
let resolveSecondSong: ((response: LyricsResponse) => void) | null = null;
let secondSongPromise = createPendingSecondSong();
const requests: Array<{ action: string; songId: string }> = [];

function createPendingSecondSong(): Promise<LyricsResponse> {
  return new Promise((resolve) => {
    resolveSecondSong = resolve;
  });
}

const { useLyrics } = await import("../src/hooks/useLyrics");
const { __clearLyricsCachesForTests } = await import("../src/api/songs");

function lyricsResponse(songId: string): LyricsResponse {
  return {
    lyrics: {
      parsedLines: [{ startTimeMs: "0", words: songId }],
    },
    translation: {
      totalLines: 1,
      cached: true,
      lrc: `[00:00.00]Translated ${songId}`,
    },
  };
}

function installFetchStub() {
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { action?: string })
        : {};
    const action = body.action ?? "";
    const pathname = new URL(String(input), "http://localhost").pathname;
    const songId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
    requests.push({ action, songId });

    if (action === "fetch-lyrics" && songId === "song-a") {
      return Response.json(lyricsResponse(songId));
    }
    if (action === "fetch-lyrics" && songId === "song-b") {
      return Response.json(await secondSongPromise);
    }
    if (action === "translate-stream") {
      return Response.json({ error: "Unexpected premature translation" }, { status: 404 });
    }
    throw new Error(`Unexpected lyrics request: ${action} ${songId}`);
  }) as typeof fetch;
}

let latestLyrics: ReturnType<typeof useLyrics> | null = null;

function LyricsProbe({ songId }: { songId: string }) {
  latestLyrics = useLyrics({
    songId,
    title: songId,
    artist: "Artist",
    currentTime: 0,
    translateTo: "ja",
  });
  return null;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for lyrics lifecycle");
}

let root: Root | null = null;

beforeEach(() => {
  __clearLyricsCachesForTests();
  requests.length = 0;
  secondSongPromise = createPendingSecondSong();
  installFetchStub();
});

afterEach(async () => {
  resolveSecondSong?.(lyricsResponse("song-b"));
  root?.unmount();
  root = null;
  latestLyrics = null;
  globalThis.fetch = originalFetch;
  document.body.replaceChildren();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
  ensureTestLocalStorage();
});

describe("useLyrics track changes", () => {
  test("waits for the new song's lyrics before translating", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    root.render(React.createElement(LyricsProbe, { songId: "song-a" }));
    await waitFor(
      () =>
        latestLyrics?.loadedSongId === "song-a" &&
        latestLyrics.lines[0]?.words === "Translated song-a"
    );

    root.render(React.createElement(LyricsProbe, { songId: "song-b" }));
    await waitFor(() =>
      requests.some(
        (request) =>
          request.action === "fetch-lyrics" && request.songId === "song-b"
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).not.toContainEqual({
      action: "translate-stream",
      songId: "song-b",
    });

    resolveSecondSong?.(lyricsResponse("song-b"));
    await waitFor(
      () =>
        latestLyrics?.loadedSongId === "song-b" &&
        latestLyrics.lines[0]?.words === "Translated song-b"
    );
  });
});
