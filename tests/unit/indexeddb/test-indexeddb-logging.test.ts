import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import "fake-indexeddb/auto";

import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";
import { dbOperations, STORES } from "../../../src/utils/indexedDB";
import {
  refreshRuntimeDebugFlag,
  setRuntimeDebugEnabled,
} from "../../../src/utils/debug";

const originalConsoleLog = console.log;
let logCalls: unknown[][] = [];

describe("IndexedDB logging", () => {
  beforeEach(() => {
    logCalls = [];
    console.log = mock((...args: unknown[]) => {
      logCalls.push(args);
    }) as unknown as typeof console.log;
    refreshRuntimeDebugFlag();
    setRuntimeDebugEnabled(true);
    resetFakeIndexedDB();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    setRuntimeDebugEnabled(false);
    refreshRuntimeDebugFlag();
  });

  test("summarizes object results without logging full payloads", async () => {
    const payload = {
      generatedAt: 123,
      tracks: [
        { id: "song-1", title: "Song One", artist: "Artist One" },
        { id: "song-2", title: "Song Two", artist: "Artist Two" },
      ],
      storefront: "us",
    };

    await dbOperations.put(STORES.APPLE_MUSIC_LIBRARY, payload, "library");
    logCalls = [];

    const result = await dbOperations.get<typeof payload>(
      STORES.APPLE_MUSIC_LIBRARY,
      "library"
    );

    expect(result).toEqual(payload);

    const successCall = logCalls.find(
      ([scope, message]) =>
        scope === "[IndexedDB]" && message === "Get succeeded"
    );

    expect(successCall).toBeDefined();
    expect(successCall).toHaveLength(3);

    const successContext = successCall?.[2] as Record<string, unknown>;
    expect(successContext).toMatchObject({
      storeName: STORES.APPLE_MUSIC_LIBRARY,
      key: "library",
      resultSummary: "object(keys=generatedAt,tracks,storefront; arrayFields=tracks:2)",
    });
    expect(JSON.stringify(successContext)).not.toContain("Song One");
    expect(JSON.stringify(successContext)).not.toContain("Artist Two");
  });
});
