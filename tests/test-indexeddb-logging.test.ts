import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import "fake-indexeddb/auto";

import { dbOperations, STORES } from "../src/utils/indexedDB";

const originalConsoleLog = console.log;
let logCalls: unknown[][] = [];

async function deleteRyOsDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("IndexedDB logging", () => {
  beforeEach(async () => {
    logCalls = [];
    console.log = mock((...args: unknown[]) => {
      logCalls.push(args);
    }) as unknown as typeof console.log;
    await deleteRyOsDatabase();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
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
      ([message]) =>
        typeof message === "string" &&
        message.includes('[dbOperations] Get success for key "library"')
    );

    expect(successCall).toBeDefined();
    expect(successCall).toHaveLength(1);

    const successMessage = successCall?.[0] as string;
    expect(successMessage).toContain(
      "Result: object(keys=generatedAt,tracks,storefront; arrayFields=tracks:2)"
    );
    expect(successMessage).not.toContain("Song One");
    expect(successMessage).not.toContain("Artist Two");
  });
});
