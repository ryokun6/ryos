import { redisKeys } from "../../src/shared/redisKeys.js";

export function backupMetaKey(username: string): string {
  return redisKeys.sync.backupMeta(username);
}

export function legacyBackupMetaKey(username: string): string {
  return `sync:meta:${username}`;
}

export function autoSyncPreferenceKey(username: string): string {
  return redisKeys.sync.autoSyncPreference(username);
}

export function legacyAutoSyncPreferenceKey(username: string): string {
  return `sync:pref:autoSync:${username.toLowerCase()}`;
}
