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

/**
 * Cross-device storage for the Apple Music **Music User Token** so the
 * iPod can restore an authorized session on browsers that wipe site
 * storage between visits (notably Tesla's in-car browser). Bound to the
 * ryOS account — survives ryOS sign-out + sign-in on a new device.
 *
 * @see api/sync/musickit-user-token.ts
 */
export function musickitUserTokenKey(username: string): string {
  return `sync:musickit-user-token:${username.toLowerCase()}`;
}
