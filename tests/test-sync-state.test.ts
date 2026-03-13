import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { createRedis } from "../api/_utils/redis";
import { generateAuthToken, storeToken } from "../api/_utils/auth";
import { readSongsState } from "../api/_utils/song-library-state";
import { stateKey } from "../api/sync/state";
import { BASE_URL, fetchWithAuth } from "./test-utils";

const TEST_USERNAME = `sync_state_tester_${Date.now()}_${Math.floor(
  Math.random() * 1000
)}`;
let authTokenPromise: Promise<string> | null = null;

async function getAuthToken(): Promise<string> {
  if (!authTokenPromise) {
    authTokenPromise = (async () => {
      const redis = createRedis();
      const authToken = generateAuthToken();
      await storeToken(redis, TEST_USERNAME, authToken);
      return authToken;
    })();
  }

  return authTokenPromise;
}

function createLegacyDocumentsBlobUrl() {
  const envelope = {
    domain: "files-documents",
    version: 1,
    updatedAt: "2026-03-07T23:20:00.000Z",
    data: [
      {
        key: "doc-1",
        value: {
          name: "notes.md",
          content: "legacy hello world",
        },
      },
    ],
  };

  const compressed = gzipSync(JSON.stringify(envelope));
  return `data:application/gzip;base64,${compressed.toString("base64")}`;
}

async function seedLegacySyncState() {
  const redis = createRedis();
  const authToken = generateAuthToken();
  await storeToken(redis, TEST_USERNAME, authToken);

  const filesMetadataState = {
    data: {
      items: {
        "/Documents": {
          path: "/Documents",
          name: "Documents",
          isDirectory: true,
          status: "active",
          type: "directory",
        },
        "/Documents/notes.md": {
          path: "/Documents/notes.md",
          name: "notes.md",
          isDirectory: false,
          status: "active",
          type: "markdown",
          uuid: "doc-1",
          size: 11,
          createdAt: 1000,
          modifiedAt: 1000,
        },
      },
      libraryState: "loaded",
    },
    updatedAt: "2026-03-07T23:10:00.000Z",
    version: 1,
    createdAt: "2026-03-07T23:10:00.000Z",
  };

  await redis.set(
    stateKey(TEST_USERNAME, "files-metadata"),
    JSON.stringify(filesMetadataState)
  );
  await redis.set(
    `sync:state:meta:${TEST_USERNAME}`,
    JSON.stringify({
      "files-metadata": {
        updatedAt: filesMetadataState.updatedAt,
        version: 1,
        createdAt: filesMetadataState.createdAt,
      },
    })
  );
  await redis.set(
    `sync:auto:meta:${TEST_USERNAME}`,
    JSON.stringify({
      "files-documents": {
        updatedAt: "2026-03-07T23:20:00.000Z",
        version: 1,
        totalSize: 123,
        blobUrl: createLegacyDocumentsBlobUrl(),
        createdAt: "2026-03-07T23:20:00.000Z",
      },
    })
  );

  return { redis, authToken };
}

describe("sync state API legacy documents migration", () => {
  test("surfaces legacy document metadata through files-metadata and migrates on download", async () => {
    const { redis, authToken } = await seedLegacySyncState();

    const metadataRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state`,
      TEST_USERNAME,
      authToken
    );
    expect(metadataRes.status).toBe(200);
    const metadataJson = await metadataRes.json();
    expect(metadataJson.metadata["files-metadata"]?.updatedAt).toBe(
      "2026-03-07T23:20:00.000Z"
    );

    const downloadRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state?domain=files-metadata`,
      TEST_USERNAME,
      authToken
    );
    expect(downloadRes.status).toBe(200);
    const downloadJson = await downloadRes.json();
    expect(downloadJson.data.documents).toBeArray();
    expect(downloadJson.data.documents).toHaveLength(1);
    expect(downloadJson.data.documents[0].value.content).toBe(
      "legacy hello world"
    );

    const migratedRaw = await redis.get<string | { data?: unknown }>(
      stateKey(TEST_USERNAME, "files-metadata")
    );
    const migrated =
      typeof migratedRaw === "string"
        ? JSON.parse(migratedRaw)
        : migratedRaw;
    expect(migrated?.data?.documents).toBeArray();
    expect(migrated?.data?.documents).toHaveLength(1);
  });
});

describe("sync state API contacts validation", () => {
  test("rejects malformed contacts snapshots", async () => {
    const authToken = await getAuthToken();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/state`,
      TEST_USERNAME,
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "contacts",
          updatedAt: "2026-03-08T02:30:00.000Z",
          version: 1,
          data: {
            contacts: [{ id: "bad-1", displayName: "Bad Contact" }],
          },
        }),
      }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect((json.error || "").toLowerCase()).toContain("contacts");
  });

  test("accepts fully serialized contacts snapshots", async () => {
    const authToken = await getAuthToken();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/state`,
      TEST_USERNAME,
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "contacts",
          updatedAt: "2026-03-08T02:31:00.000Z",
          version: 1,
          data: {
            contacts: [
              {
                id: "contact-1",
                displayName: "Good Contact",
                firstName: "Good",
                lastName: "Contact",
                nickname: "",
                organization: "",
                title: "",
                notes: "",
                emails: [],
                phones: [],
                addresses: [],
                urls: [],
                birthday: null,
                telegramUsername: "",
                telegramUserId: "",
                source: "manual",
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        }),
      }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.domain).toBe("contacts");
  });
});

describe("sync state API deletion markers", () => {
  test("round-trips calendar and file tombstones", async () => {
    const authToken = await getAuthToken();

    const filesRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state`,
      TEST_USERNAME,
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "files-metadata",
          updatedAt: "2026-03-12T16:35:00.000Z",
          version: 1,
          data: {
            items: {},
            libraryState: "loaded",
            deletedPaths: {
              "/Photos/cat.png": "2026-03-12T16:34:00.000Z",
            },
          },
        }),
      }
    );
    expect(filesRes.status).toBe(200);

    const calendarRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state`,
      TEST_USERNAME,
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "calendar",
          updatedAt: "2026-03-12T16:36:00.000Z",
          version: 1,
          data: {
            events: [],
            calendars: [],
            todos: [],
            deletedTodoIds: {
              "todo-1": "2026-03-12T16:33:00.000Z",
            },
          },
        }),
      }
    );
    expect(calendarRes.status).toBe(200);

    const downloadFiles = await fetchWithAuth(
      `${BASE_URL}/api/sync/state?domain=files-metadata`,
      TEST_USERNAME,
      authToken
    );
    expect(downloadFiles.status).toBe(200);
    const filesJson = await downloadFiles.json();
    expect(filesJson.data.deletedPaths).toEqual({
      "/Photos/cat.png": "2026-03-12T16:34:00.000Z",
    });

    const downloadCalendar = await fetchWithAuth(
      `${BASE_URL}/api/sync/state?domain=calendar`,
      TEST_USERNAME,
      authToken
    );
    expect(downloadCalendar.status).toBe(200);
    const calendarJson = await downloadCalendar.json();
    expect(calendarJson.data.deletedTodoIds).toEqual({
      "todo-1": "2026-03-12T16:33:00.000Z",
    });
  });
});

describe("sync state API songs library storage", () => {
  test("writes and downloads songs through the item-based user store", async () => {
    const authToken = await getAuthToken();
    const redis = createRedis();
    const updatedAt = "2026-03-13T03:15:00.000Z";
    const payload = {
      tracks: [
        {
          id: "song_track_1",
          url: "https://www.youtube.com/watch?v=song_track_1",
          title: "First Song",
          artist: "Artist One",
          lyricOffset: 250,
          lyricsSource: {
            hash: "hash-1",
            albumId: "album-1",
            title: "First Song",
            artist: "Artist One",
          },
        },
        {
          id: "song_track_2",
          url: "https://www.youtube.com/watch?v=song_track_2",
          title: "Second Song",
          album: "Album Two",
        },
      ],
      libraryState: "loaded",
      lastKnownVersion: 42,
    };

    const saveRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state`,
      TEST_USERNAME,
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "songs",
          updatedAt,
          version: 1,
          data: payload,
        }),
      }
    );
    expect(saveRes.status).toBe(200);

    const stored = await readSongsState(redis, TEST_USERNAME);
    expect(stored?.metadata.updatedAt).toBe(updatedAt);
    expect(stored?.data.libraryState).toBe("loaded");
    expect(stored?.data.lastKnownVersion).toBe(42);
    expect(stored?.data.tracks.map((track) => track.id)).toEqual([
      "song_track_1",
      "song_track_2",
    ]);

    const legacyRaw = await redis.get(stateKey(TEST_USERNAME, "songs"));
    expect(legacyRaw).toBeNull();

    const downloadRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state?domain=songs`,
      TEST_USERNAME,
      authToken
    );
    expect(downloadRes.status).toBe(200);
    const downloadJson = await downloadRes.json();
    expect(downloadJson.data).toEqual(payload);
    expect(downloadJson.metadata.updatedAt).toBe(updatedAt);
  });

  test("migrates legacy songs snapshots on first download", async () => {
    const redis = createRedis();
    const username = `sync_songs_legacy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const authToken = generateAuthToken();
    const updatedAt = "2026-03-13T03:25:00.000Z";

    await storeToken(redis, username, authToken);
    await redis.set(
      stateKey(username, "songs"),
      JSON.stringify({
        data: {
          tracks: [
            {
              id: "legacy_song_1",
              url: "https://www.youtube.com/watch?v=legacy_song_1",
              title: "Legacy Song",
              cover: "https://example.com/legacy.png",
            },
          ],
          libraryState: "loaded",
          lastKnownVersion: 7,
        },
        updatedAt,
        version: 1,
        createdAt: updatedAt,
      })
    );
    await redis.set(
      `sync:state:meta:${username}`,
      JSON.stringify({
        songs: {
          updatedAt,
          version: 1,
          createdAt: updatedAt,
        },
      })
    );

    const downloadRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state?domain=songs`,
      username,
      authToken
    );
    expect(downloadRes.status).toBe(200);
    const downloadJson = await downloadRes.json();
    expect(downloadJson.data.tracks).toHaveLength(1);
    expect(downloadJson.data.tracks[0].id).toBe("legacy_song_1");
    expect(downloadJson.metadata.updatedAt).toBe(updatedAt);

    const migrated = await readSongsState(redis, username);
    expect(migrated?.data.lastKnownVersion).toBe(7);
    expect(migrated?.data.tracks[0]?.title).toBe("Legacy Song");

    const legacyRaw = await redis.get(stateKey(username, "songs"));
    expect(legacyRaw).toBeNull();
  });
});
