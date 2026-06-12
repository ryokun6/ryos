export function backupMetaKey(username: string): string {
  return `sync:meta:${username}`;
}

export function autoSyncPreferenceKey(username: string): string {
  return `sync:pref:autoSync:${username.toLowerCase()}`;
}
