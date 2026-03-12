import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { createRedis } from "../api/_utils/redis";
import { generateAuthToken, storeToken } from "../api/_utils/auth";
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
