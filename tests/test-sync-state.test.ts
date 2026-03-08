import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { createRedis } from "../api/_utils/redis";
import { generateAuthToken, storeToken } from "../api/_utils/auth";
import {
  appendTelegramConversationMessage,
  createTelegramLinkCode,
  linkTelegramAccount,
} from "../api/_utils/telegram-link";
import { stateKey } from "../api/sync/state";
import { BASE_URL, fetchWithAuth } from "./test-utils";

const TEST_USERNAME = `sync_state_tester_${Date.now()}_${Math.floor(
  Math.random() * 1000
)}`;

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

  test("uses linked Telegram history as the chats sync source", async () => {
    const telegramSyncUsername = `${TEST_USERNAME}_telegram`;
    const redis = createRedis();
    const authToken = generateAuthToken();
    await storeToken(redis, telegramSyncUsername, authToken);

    const linkCode = await createTelegramLinkCode(redis, telegramSyncUsername);
    await linkTelegramAccount(redis, {
      code: linkCode.code,
      telegramUserId: "2001",
      chatId: "chat-sync-1",
      telegramUsername: "ryotest",
    });

    await appendTelegramConversationMessage(redis, "chat-sync-1", {
      role: "user",
      content: "hello from telegram",
      createdAt: Date.UTC(2026, 2, 7, 23, 40, 0),
    });
    await appendTelegramConversationMessage(redis, "chat-sync-1", {
      role: "assistant",
      content: "telegram is now the sync source",
      createdAt: Date.UTC(2026, 2, 7, 23, 41, 0),
      imageUrl: "https://example.com/reply.png",
    });

    await redis.set(
      stateKey(telegramSyncUsername, "chats"),
      JSON.stringify({
        data: {
          aiMessages: [
            {
              id: "local-only",
              role: "assistant",
              parts: [{ type: "text", text: "stale local snapshot" }],
              metadata: { createdAt: "2026-03-07T23:39:00.000Z" },
            },
          ],
        },
        updatedAt: "2026-03-07T23:39:00.000Z",
        version: 1,
        createdAt: "2026-03-07T23:39:00.000Z",
      })
    );

    const metadataRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state`,
      telegramSyncUsername,
      authToken
    );
    expect(metadataRes.status).toBe(200);
    const metadataJson = await metadataRes.json();
    expect(metadataJson.metadata.chats?.updatedAt).toBe(
      "2026-03-07T23:41:00.000Z"
    );

    const downloadRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/state?domain=chats`,
      telegramSyncUsername,
      authToken
    );
    expect(downloadRes.status).toBe(200);
    const downloadJson = await downloadRes.json();
    expect(downloadJson.data.aiMessages).toHaveLength(2);
    expect(downloadJson.data.aiMessages[0].parts[0].text).toBe(
      "hello from telegram"
    );
    expect(downloadJson.data.aiMessages[1].parts[0].text).toBe(
      "telegram is now the sync source"
    );
    expect(downloadJson.data.aiMessages[1].parts[1]).toMatchObject({
      type: "file",
      mediaType: "image/png",
      url: "https://example.com/reply.png",
    });
  });
});
