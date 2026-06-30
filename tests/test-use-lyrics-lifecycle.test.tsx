import {
  afterAll,
  afterEach,
  describe,
  expect,
  mock,
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

const actualSongs = await import("../src/api/songs");
const actualChunkedStream = await import("../src/utils/chunkedStream");

interface LyricsResponse {
  lyrics: {
    parsedLines: Array<{ startTimeMs: string; words: string }>;
  };
}

let resolveSecondSong: ((response: LyricsResponse) => void) | null = null;
let secondSongPromise = createPendingSecondSong();
const translationSongIds: string[] = [];

function createPendingSecondSong(): Promise<LyricsResponse> {
  return new Promise((resolve) => {
    resolveSecondSong = resolve;
  });
}

const fetchSongLyricsMock = mock(async (songId: string) => {
  if (songId === "song-a") {
    return {
      lyrics: {
        parsedLines: [{ startTimeMs: "0", words: "Song A" }],
      },
    };
  }
  if (songId === "song-b") return secondSongPromise;
  throw new Error(`Unexpected song: ${songId}`);
});

const processTranslationSSEMock = mock(async (songId: string) => {
  translationSongIds.push(songId);
  return { data: [`Translated ${songId}`], success: true };
});

mock.module("@/api/songs", () => ({
  ...actualSongs,
  fetchSongLyrics: fetchSongLyricsMock,
}));
mock.module("@/utils/chunkedStream", () => ({
  ...actualChunkedStream,
  processTranslationSSE: processTranslationSSEMock,
}));

const { useLyrics } = await import("../src/hooks/useLyrics");

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

afterEach(async () => {
  root?.unmount();
  root = null;
  latestLyrics = null;
  translationSongIds.length = 0;
  fetchSongLyricsMock.mockClear();
  processTranslationSSEMock.mockClear();
  secondSongPromise = createPendingSecondSong();
  document.body.replaceChildren();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterAll(() => {
  mock.module("@/api/songs", () => actualSongs);
  mock.module("@/utils/chunkedStream", () => actualChunkedStream);
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
        translationSongIds.includes("song-a")
    );

    root.render(React.createElement(LyricsProbe, { songId: "song-b" }));
    await waitFor(() => fetchSongLyricsMock.mock.calls.length >= 2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(translationSongIds).not.toContain("song-b");

    resolveSecondSong?.({
      lyrics: {
        parsedLines: [{ startTimeMs: "0", words: "Song B" }],
      },
    });
    await waitFor(
      () =>
        latestLyrics?.loadedSongId === "song-b" &&
        translationSongIds.includes("song-b")
    );
  });
});
