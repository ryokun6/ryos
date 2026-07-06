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
import { unlinkTelegramAccountByUsername } from "../telegram-link.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import { deleteAIConversationKeys } from "../../ai/conversations/_helpers/store.js";
import { deleteAllAIAttachments } from "../../ai/attachments/_helpers/store.js";
import { deleteAllUserMemories } from "../_memory.js";

export interface PurgeAccountResult {
  /** Approximate number of Redis keys removed. */
  deletedCount: number;
}

/**
 * Remove all data associated with a user account. Best-effort: individual
 * sub-deletes are guarded so one failing backend (e.g. Telegram unlink) does
 * not abort the rest of the wipe.
 */
export async function purgeUserAccount(
  redis: Redis,
  username: string
): Promise<PurgeAccountResult> {
  const normalized = username.toLowerCase();
  let deletedCount = 0;

  // Read the profile first so we can clean up the email reverse-index.
  const record = await getStoredUserRecord(redis, normalized).catch(() => null);

  // Block in-flight AI writers before removing auth. This deletion is not
  // best-effort: returning success while private transcripts remain would
  // violate the account-deletion contract.
  deletedCount += await deleteAIConversationKeys(redis, normalized);
  deletedCount += await deleteAllAIAttachments(redis, normalized);
  deletedCount += await deleteAllUserMemories(redis, normalized);

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

  // Telegram link (both directions).
  await unlinkTelegramAccountByUsername(redis, normalized).catch(() => {});

  // Sync data.
  deletedCount += await redis
    .del(
      redisKeys.sync.v2Seq(normalized),
      redisKeys.sync.v2Kv(normalized),
      redisKeys.sync.v2Journal(normalized),
      redisKeys.sync.v2Blobs(normalized),
      redisKeys.sync.v2Lock(normalized),
      redisKeys.sync.v2TtlTouched(normalized),
      redisKeys.sync.autoSyncPreference(normalized)
    )
    .catch(() => 0);

  return { deletedCount };
}
