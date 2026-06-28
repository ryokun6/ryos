import { redisKeys } from "../../src/shared/redisKeys.js";

export function autoSyncPreferenceKey(username: string): string {
  return redisKeys.sync.autoSyncPreference(username);
}
