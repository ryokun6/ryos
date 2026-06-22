/**
 * Cloud Sync v2 key namespaces.
 *
 * A key is `namespace/rest`, where the namespace selects the codec that
 * owns serialization and application of its documents. The namespace is the
 * unit of dirty-tracking and per-category enable toggles; the key is the
 * unit of conflict resolution.
 */

export const SYNC_NAMESPACES = [
  "settings",
  "files",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
  "images",
  // `books` owns the EPUB *files* (blob namespace, lives under the "files"
  // category). `bookshelf` owns the Books app's per-book reading state
  // (progress, shelf ordering, last-opened) and lives under its own "books"
  // category so it syncs independently of the (large) file blobs.
  "books",
  "bookshelf",
  "trash",
  "applets",
  "wallpapers",
] as const;

export type SyncNamespace = (typeof SYNC_NAMESPACES)[number];

/** Namespaces whose documents reference object-storage blobs. */
export const SYNC_BLOB_NAMESPACES = [
  "images",
  "books",
  "trash",
  "applets",
  "wallpapers",
] as const;

export type SyncBlobNamespace = (typeof SYNC_BLOB_NAMESPACES)[number];

/** User-facing sync categories (Control Panels toggles, menu indicator). */
export const SYNC_CATEGORIES = [
  "files",
  "settings",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
  "books",
] as const;

export type SyncCategory = (typeof SYNC_CATEGORIES)[number];

const NAMESPACE_TO_CATEGORY: Record<SyncNamespace, SyncCategory> = {
  settings: "settings",
  files: "files",
  songs: "songs",
  videos: "videos",
  tv: "tv",
  stickies: "stickies",
  calendar: "calendar",
  contacts: "contacts",
  maps: "maps",
  images: "files",
  // EPUB file blobs sync under "files"; the Books reading state syncs under
  // its own "books" category (note: the `books` namespace label intentionally
  // differs from the `books` category — the former is the blob namespace).
  books: "files",
  bookshelf: "books",
  trash: "files",
  applets: "files",
  wallpapers: "files",
};

export function isSyncNamespace(value: unknown): value is SyncNamespace {
  return (
    typeof value === "string" &&
    (SYNC_NAMESPACES as readonly string[]).includes(value)
  );
}

export function isSyncBlobNamespace(
  value: SyncNamespace
): value is SyncBlobNamespace {
  return (SYNC_BLOB_NAMESPACES as readonly string[]).includes(value);
}

export function getSyncNamespaceCategory(namespace: SyncNamespace): SyncCategory {
  return NAMESPACE_TO_CATEGORY[namespace];
}

export function getSyncNamespacesForCategory(
  category: SyncCategory
): SyncNamespace[] {
  return SYNC_NAMESPACES.filter(
    (namespace) => NAMESPACE_TO_CATEGORY[namespace] === category
  );
}

export function getSyncKeyNamespace(key: string): SyncNamespace | null {
  const slash = key.indexOf("/");
  if (slash <= 0) return null;
  const namespace = key.slice(0, slash);
  return isSyncNamespace(namespace) ? namespace : null;
}

const MAX_KEY_LENGTH = 512;

export function isValidSyncKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_KEY_LENGTH) return false;
  return getSyncKeyNamespace(value) !== null;
}
