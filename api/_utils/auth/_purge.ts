/**
 * Shared, exhaustive account-deletion routine used by both self-service
 * deletion (`/api/auth/account/delete`) and admin deletion (`/api/admin`).
 *
 * Keeping a single implementation ensures the two paths can never drift and
 * leave orphaned data (sessions, recovery email index, Telegram link, sync
 * blobs, etc.).
 */

import type { Redis } from "../redis.js";
import { deleteAllUserTokens } from "./_tokens.js";
import {
  getStoredUserRecord,
  deleteUserEmailIndex,
} from "./_user-record.js";
import {
  getLinkedTelegramAccountByUsername,
  getTelegramPendingLinkSession,
  unlinkTelegramAccountByUsername,
} from "../telegram-link.js";
import {
  deleteStoredObject,
  resolveOwnedStorageObjectUrl,
} from "../storage.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";

export interface PurgeAccountResult {
  /** Approximate number of Redis keys removed. */
  deletedCount: number;
  /** Object-storage entries that could not be removed and remain registered. */
  objectStorageFailures: number;
}

interface PurgeAccountOptions {
  deleteObject?: (storageUrl: string) => Promise<void>;
  resolveObjectUrl?: (
    storageUrl: string,
    expectedPathname: string
  ) => string | null;
}

function parseBlobStorageUrl(raw: unknown): string | null {
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as unknown)
        : raw;
    if (
      parsed &&
      typeof parsed === "object" &&
      "url" in parsed &&
      typeof parsed.url === "string"
    ) {
      return parsed.url;
    }
  } catch {
    // Ignore malformed registry entries. Deleting the registry still removes
    // the only server-side reference to them.
  }
  return null;
}

async function deleteKeysMatching(
  redis: Redis,
  patterns: string[]
): Promise<number> {
  let deletedCount = 0;
  for (const pattern of patterns) {
    let cursor: string | number = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = nextCursor;
      if (keys.length > 0) {
        deletedCount += await redis.del(...keys);
      }
    } while (String(cursor) !== "0");
  }
  return deletedCount;
}

/**
 * Remove all data associated with a user account. Best-effort: individual
 * sub-deletes are guarded so one failing backend (e.g. Telegram unlink) does
 * not abort the rest of the wipe.
 */
export async function purgeUserAccount(
  redis: Redis,
  username: string,
  options: PurgeAccountOptions = {}
): Promise<PurgeAccountResult> {
  const normalized = username.toLowerCase();
  let deletedCount = 0;
  let objectStorageFailures = 0;
  const deleteObject = options.deleteObject ?? deleteStoredObject;
  const resolveObjectUrl =
    options.resolveObjectUrl ?? resolveOwnedStorageObjectUrl;

  // Read related records before deleting their reverse indexes.
  const record = await getStoredUserRecord(redis, normalized).catch(() => null);
  const telegramAccount = await getLinkedTelegramAccountByUsername(
    redis,
    normalized
  ).catch(() => null);
  const pendingTelegramLink = await getTelegramPendingLinkSession(
    redis,
    normalized
  ).catch(() => null);

  // Delete known object-storage blobs before removing their Redis registry.
  // Keep the registry if any deletion fails so operators retain the URLs
  // needed to retry cleanup.
  const blobRegistryKey = redisKeys.sync.v2Blobs(normalized);
  const blobRegistry = await redis
    .hgetall<Record<string, unknown>>(blobRegistryKey)
    .catch(() => null);
  const storageUrls = new Set<string>();
  for (const [digest, rawEntry] of Object.entries(blobRegistry ?? {})) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      continue;
    }
    const registeredUrl = parseBlobStorageUrl(rawEntry);
    if (!registeredUrl) {
      continue;
    }
    let ownedUrl: string | null;
    try {
      ownedUrl = resolveObjectUrl(
        registeredUrl,
        `sync/${normalized}/blobs/${digest}.gz`
      );
    } catch {
      objectStorageFailures += 1;
      continue;
    }
    if (ownedUrl) {
      storageUrls.add(ownedUrl);
    }
  }
  for (const storageUrl of storageUrls) {
    try {
      await deleteObject(storageUrl);
    } catch {
      objectStorageFailures += 1;
    }
  }

  // Recovery email reverse index.
  if (record?.email) {
    await deleteUserEmailIndex(redis, record.email).catch(() => {});
  }

  // Core auth records.
  deletedCount += await redis
    .del(
      redisKeys.auth.userProfile(normalized),
      redisKeys.auth.userPassword(normalized),
      redisKeys.auth.emailVerify(normalized),
      redisKeys.auth.passwordReset(normalized)
    )
    .catch(() => 0);

  // Sessions (canonical session set + grace token).
  deletedCount += await deleteAllUserTokens(redis, normalized).catch(() => 0);

  // Telegram link, pending link, settings, history, and scheduled heartbeat
  // records. Processed update IDs are global webhook idempotency records and
  // contain no account content.
  await unlinkTelegramAccountByUsername(redis, normalized).catch(() => {});
  deletedCount += await redis
    .del(
      redisKeys.integration.telegramPendingLink(normalized),
      redisKeys.integration.telegramHeartbeatSettings(normalized),
      ...(pendingTelegramLink
        ? [redisKeys.integration.telegramLinkCode(pendingTelegramLink.code)]
        : []),
      ...(telegramAccount
        ? [redisKeys.integration.telegramHistory(telegramAccount.chatId)]
        : [])
    )
    .catch(() => 0);
  deletedCount += await deleteKeysMatching(redis, [
    `${redisKeys.integration.telegramHeartbeat(normalized, "")}:*`,
  ]).catch(() => 0);

  // AI memories, daily notes, processing state, and heartbeat history.
  const memoryBase = redisKeys.memory.index(normalized).replace(/:index$/, "");
  deletedCount += await redis
    .del(
      redisKeys.memory.index(normalized),
      redisKeys.memory.processingLock(normalized)
    )
    .catch(() => 0);
  deletedCount += await deleteKeysMatching(redis, [
    `${memoryBase}:detail:*`,
    `${memoryBase}:daily:*`,
    `${redisKeys.system.userHeartbeats(normalized, "")}:*`,
  ]).catch(() => 0);

  // Remove the deleted account from global online presence.
  deletedCount += await redis
    .zrem(redisKeys.presence.globalOnline(), normalized)
    .catch(() => 0);

  // Sync data.
  const syncKeys = [
    redisKeys.sync.v2Seq(normalized),
    redisKeys.sync.v2Kv(normalized),
    redisKeys.sync.v2Journal(normalized),
    redisKeys.sync.v2Lock(normalized),
    redisKeys.sync.v2TtlTouched(normalized),
    redisKeys.sync.autoSyncPreference(normalized),
  ];
  if (objectStorageFailures === 0) {
    syncKeys.push(blobRegistryKey);
  }
  deletedCount += await redis.del(...syncKeys).catch(() => 0);

  return { deletedCount, objectStorageFailures };
}
