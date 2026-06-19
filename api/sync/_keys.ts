import { redisKeys } from "../../src/shared/redisKeys.js";

export function backupMetaKey(username: string): string {
  return redisKeys.sync.backupMeta(username);
}

export function autoSyncPreferenceKey(username: string): string {
  return redisKeys.sync.autoSyncPreference(username);
}
