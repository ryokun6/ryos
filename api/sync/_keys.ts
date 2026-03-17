import type { RedisSyncDomain } from "../../src/utils/cloudSyncShared.js";

export function backupMetaKey(username: string): string {
  return `sync:meta:${username}`;
}

// Keep the historical Redis prefix so existing blob sync metadata remains readable.
export function blobSyncMetaKey(username: string): string {
  return `sync:auto:meta:${username}`;
}

export function redisStateKey(username: string, domain: RedisSyncDomain): string {
  return `sync:state:${username}:${domain}`;
}

export function redisStateMetaKey(username: string): string {
  return `sync:state:meta:${username}`;
}

export function autoSyncPreferenceKey(username: string): string {
  return `sync:pref:autoSync:${username.toLowerCase()}`;
}
