/**
 * One-time import of v1 cloud sync state into the v2 key-value model.
 *
 * Runs on a user's first v2 access when `hasLegacyV1SyncData` is true (see
 * `ensureSync2Initialized`). New users with no v1 Redis keys skip import
 * entirely. Reads legacy snapshot domains (`sync:state:*`), per-track songs
 * (`sync:songs:*`), and blob manifests (`sync:auto:meta:*`), decomposing them
 * into per-key v2 entries. Purely additive: v1 keys are left in place and
 * expire via maintenance retirement TTLs.
 */

import type { Redis } from "../../_utils/redis.js";
import { hlcFromTimestamp } from "../../../src/shared/sync2/hlc.js";
import type { SyncKvEntry } from "../../../src/shared/sync2/types.js";

const LEGACY_CLIENT_ID = "legacy";

/** Domains stored as monolithic v1 snapshots at `sync:state:{user}:{domain}`. */
const V1_STATE_DOMAINS = [
  "settings",
  "files-metadata",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
] as const;

/**
 * True when any frozen v1 sync key still exists for this user. Used to skip
 * the import path for brand-new accounts (no legacy data to migrate).
 */
export async function hasLegacyV1SyncData(
  redis: Redis,
  username: string
): Promise<boolean> {
  const probeKeys = [
    `sync:state:meta:${username}`,
    `sync:auto:meta:${username}`,
    `sync:songs:${username}:meta`,
    ...V1_STATE_DOMAINS.map((domain) => `sync:state:${username}:${domain}`),
  ];
  return (await redis.exists(...probeKeys)) > 0;
}

interface V1StateEntry {
  data?: unknown;
  updatedAt?: string;
  createdAt?: string;
}

interface V1BlobManifestItem {
  storageUrl?: string;
  blobUrl?: string;
  signature?: string;
  size?: number;
  updatedAt?: string;
}

interface V1BlobManifestEntry {
  updatedAt?: string;
  items?: Record<string, V1BlobManifestItem>;
  deletedItems?: Record<string, string>;
}

function parseJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getItemTimestamp(item: unknown, fallback: string | undefined): string {
  const record = asRecord(item);
  for (const field of ["updatedAt", "modifiedAt", "createdAt"]) {
    const value = record?.[field];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return new Date(value).toISOString();
    }
  }
  return fallback || new Date(0).toISOString();
}

type EntryMap = Record<string, SyncKvEntry>;

function putDoc(entries: EntryMap, key: string, doc: unknown, at: string): void {
  if (doc === undefined || doc === null) return;
  entries[key] = { v: doc, t: hlcFromTimestamp(at, LEGACY_CLIENT_ID), seq: 0 };
}

function putTombstones(
  entries: EntryMap,
  keyFor: (id: string) => string,
  markers: unknown
): void {
  const map = asRecord(markers);
  if (!map) return;
  for (const [id, deletedAt] of Object.entries(map)) {
    if (typeof deletedAt !== "string" || !id) continue;
    const key = keyFor(id);
    if (entries[key]) continue;
    entries[key] = {
      del: true,
      t: hlcFromTimestamp(deletedAt, LEGACY_CLIENT_ID),
      seq: 0,
    };
  }
}

function putItemCollection(
  entries: EntryMap,
  items: unknown,
  keyFor: (id: string) => string,
  idField: string,
  fallbackAt: string | undefined
): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const record = asRecord(item);
    const id = record?.[idField];
    if (typeof id !== "string" || id.length === 0) continue;
    putDoc(entries, keyFor(id), item, getItemTimestamp(item, fallbackAt));
  }
}

async function readV1StateEntry(
  redis: Redis,
  username: string,
  domain: string
): Promise<V1StateEntry | null> {
  return parseJson<V1StateEntry>(
    await redis.get(`sync:state:${username}:${domain}`)
  );
}

function importSettings(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data) return;
  const sectionUpdatedAt = asRecord(data.sectionUpdatedAt) || {};
  const at = (section: string): string =>
    typeof sectionUpdatedAt[section] === "string"
      ? (sectionUpdatedAt[section] as string)
      : entry.updatedAt || new Date(0).toISOString();

  if (typeof data.theme === "string") {
    putDoc(
      entries,
      "settings/theme",
      {
        current: data.theme,
        ...(asRecord(data.themeDarkMode) ? { darkMode: data.themeDarkMode } : {}),
        ...(asRecord(data.themeAccent) ? { accent: data.themeAccent } : {}),
        ...(typeof data.themeAquaMaterial === "string"
          ? { aquaMaterial: data.themeAquaMaterial }
          : {}),
        ...(typeof data.themeSystemFont === "string"
          ? { systemFont: data.themeSystemFont }
          : {}),
      },
      at("theme")
    );
  }
  if (typeof data.language === "string") {
    putDoc(
      entries,
      "settings/language",
      { current: data.language, initialized: data.languageInitialized === true },
      at("language")
    );
  }
  if (asRecord(data.display)) {
    putDoc(entries, "settings/display", data.display, at("display"));
  }
  if (asRecord(data.audio)) {
    putDoc(entries, "settings/audio", data.audio, at("audio"));
  }
  if (typeof data.aiModel === "string" || data.aiModel === null) {
    putDoc(entries, "settings/ai", { model: data.aiModel ?? null }, at("aiModel"));
  }
  if (asRecord(data.ipod)) {
    putDoc(entries, "settings/ipod", data.ipod, at("ipod"));
  }
  if (asRecord(data.dock)) {
    putDoc(entries, "settings/dock", data.dock, at("dock"));
  }
  if (asRecord(data.dashboard)) {
    putDoc(entries, "settings/dashboard", data.dashboard, at("dashboard"));
  }
}

function importFilesMetadata(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data) return;
  const fallbackAt = entry.updatedAt;

  const items = asRecord(data.items);
  if (items) {
    for (const [path, item] of Object.entries(items)) {
      if (!path) continue;
      putDoc(
        entries,
        `files/item:${path}`,
        item,
        getItemTimestamp(item, fallbackAt)
      );
    }
  }

  if (Array.isArray(data.documents)) {
    for (const doc of data.documents) {
      const record = asRecord(doc);
      const key = record?.key;
      if (typeof key !== "string" || key.length === 0) continue;
      putDoc(entries, `files/doc:${key}`, doc, getItemTimestamp(doc, fallbackAt));
    }
  }

  if (typeof data.libraryState === "string") {
    putDoc(
      entries,
      "files/lib",
      { libraryState: data.libraryState },
      fallbackAt || new Date(0).toISOString()
    );
  }

  putTombstones(entries, (path) => `files/item:${path}`, data.deletedPaths);
}

async function importSongs(
  redis: Redis,
  username: string,
  entries: EntryMap
): Promise<void> {
  interface SongsMeta {
    trackOrder?: string[];
    libraryState?: string;
    lastKnownVersion?: number;
    deletedTrackIds?: Record<string, string>;
    updatedAt?: string;
  }

  let meta = parseJson<SongsMeta>(await redis.get(`sync:songs:${username}:meta`));
  let tracks: unknown[] = [];

  if (meta) {
    const order = Array.isArray(meta.trackOrder)
      ? meta.trackOrder.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      : [];
    if (order.length > 0) {
      const raw = await redis.mget(
        ...order.map((id) => `sync:songs:${username}:track:${id}`)
      );
      tracks = raw
        .map((value) => parseJson<Record<string, unknown>>(value))
        .filter((track): track is Record<string, unknown> => Boolean(track));
    }
  } else {
    // Legacy single-snapshot songs domain.
    const legacy = await readV1StateEntry(redis, username, "songs");
    const data = asRecord(legacy?.data);
    if (!legacy || !data) return;
    meta = {
      libraryState:
        typeof data.libraryState === "string" ? data.libraryState : undefined,
      lastKnownVersion:
        typeof data.lastKnownVersion === "number" ? data.lastKnownVersion : 0,
      deletedTrackIds: asRecord(data.deletedTrackIds) as
        | Record<string, string>
        | undefined,
      updatedAt: legacy.updatedAt,
    };
    tracks = Array.isArray(data.tracks) ? data.tracks : [];
  }

  putItemCollection(
    entries,
    tracks,
    (id) => `songs/track:${id}`,
    "id",
    meta.updatedAt
  );
  putTombstones(entries, (id) => `songs/track:${id}`, meta.deletedTrackIds);
  putDoc(
    entries,
    "songs/lib",
    {
      libraryState: meta.libraryState || "uninitialized",
      lastKnownVersion: meta.lastKnownVersion || 0,
    },
    meta.updatedAt || new Date(0).toISOString()
  );
}

function importVideos(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data || !Array.isArray(data.videos)) return;
  putItemCollection(
    entries,
    data.videos,
    (id) => `videos/video:${id}`,
    "id",
    entry.updatedAt
  );
  const order = data.videos
    .map((video) => asRecord(video)?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  putDoc(entries, "videos/lib", { order }, entry.updatedAt || new Date(0).toISOString());
}

function importTv(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data) return;
  putItemCollection(
    entries,
    data.customChannels,
    (id) => `tv/channel:${id}`,
    "id",
    entry.updatedAt
  );
  putTombstones(entries, (id) => `tv/channel:${id}`, data.deletedCustomChannelIds);
  putDoc(
    entries,
    "tv/prefs",
    {
      hiddenDefaultChannelIds: Array.isArray(data.hiddenDefaultChannelIds)
        ? data.hiddenDefaultChannelIds
        : [],
      hiddenDefaultChannelIdsUpdatedAt:
        typeof data.hiddenDefaultChannelIdsUpdatedAt === "string"
          ? data.hiddenDefaultChannelIdsUpdatedAt
          : null,
      hiddenDefaultChannelIdsResetAt:
        typeof data.hiddenDefaultChannelIdsResetAt === "string"
          ? data.hiddenDefaultChannelIdsResetAt
          : null,
      lcdFilterOn: data.lcdFilterOn !== false,
      closedCaptionsOn: data.closedCaptionsOn !== false,
    },
    entry.updatedAt || new Date(0).toISOString()
  );
}

function importStickies(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data) return;
  putItemCollection(
    entries,
    data.notes,
    (id) => `stickies/note:${id}`,
    "id",
    entry.updatedAt
  );
  putTombstones(entries, (id) => `stickies/note:${id}`, data.deletedNoteIds);
}

function importCalendar(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data) return;
  putItemCollection(
    entries,
    data.events,
    (id) => `calendar/event:${id}`,
    "id",
    entry.updatedAt
  );
  putItemCollection(
    entries,
    data.calendars,
    (id) => `calendar/cal:${id}`,
    "id",
    entry.updatedAt
  );
  putItemCollection(
    entries,
    data.todos,
    (id) => `calendar/todo:${id}`,
    "id",
    entry.updatedAt
  );
  putTombstones(entries, (id) => `calendar/event:${id}`, data.deletedEventIds);
  putTombstones(entries, (id) => `calendar/cal:${id}`, data.deletedCalendarIds);
  putTombstones(entries, (id) => `calendar/todo:${id}`, data.deletedTodoIds);
}

function importContacts(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data) return;
  putItemCollection(
    entries,
    data.contacts,
    (id) => `contacts/contact:${id}`,
    "id",
    entry.updatedAt
  );
  putTombstones(entries, (id) => `contacts/contact:${id}`, data.deletedContactIds);
  if (typeof data.myContactId === "string" || data.myContactId === null) {
    putDoc(
      entries,
      "contacts/me",
      { myContactId: data.myContactId ?? null },
      entry.updatedAt || new Date(0).toISOString()
    );
  }
}

function importMaps(entries: EntryMap, entry: V1StateEntry): void {
  const data = asRecord(entry.data);
  if (!data) return;
  const at =
    typeof data.updatedAt === "number" && data.updatedAt > 0
      ? new Date(data.updatedAt).toISOString()
      : entry.updatedAt || new Date(0).toISOString();
  if (asRecord(data.home)) {
    putDoc(entries, "maps/home", data.home, at);
  }
  if (asRecord(data.work)) {
    putDoc(entries, "maps/work", data.work, at);
  }
  putItemCollection(entries, data.favorites, (id) => `maps/favorite:${id}`, "id", at);
  putTombstones(entries, (id) => `maps/favorite:${id}`, data.deletedFavoriteIds);
}

const V1_BLOB_DOMAIN_TO_NAMESPACE: Record<string, string> = {
  "files-images": "images",
  "files-trash": "trash",
  "files-applets": "applets",
  "custom-wallpapers": "wallpapers",
};

async function importBlobManifests(
  redis: Redis,
  username: string,
  entries: EntryMap
): Promise<void> {
  const manifests = parseJson<Record<string, V1BlobManifestEntry | null>>(
    await redis.get(`sync:auto:meta:${username}`)
  );
  if (!manifests) return;

  for (const [domain, namespace] of Object.entries(V1_BLOB_DOMAIN_TO_NAMESPACE)) {
    const manifest = manifests[domain];
    if (!manifest || typeof manifest !== "object") continue;

    const items = asRecord(manifest.items) as Record<
      string,
      V1BlobManifestItem
    > | null;
    if (items) {
      for (const [itemKey, item] of Object.entries(items)) {
        const url = item?.storageUrl || item?.blobUrl;
        if (!itemKey || typeof url !== "string" || url.length === 0) continue;
        putDoc(
          entries,
          `${namespace}/item:${itemKey}`,
          {
            blob: {
              url,
              size:
                typeof item.size === "number" && Number.isFinite(item.size)
                  ? item.size
                  : 0,
              ...(typeof item.signature === "string" && item.signature.length > 0
                ? { sig: item.signature }
                : {}),
            },
          },
          typeof item.updatedAt === "string"
            ? item.updatedAt
            : manifest.updatedAt || new Date(0).toISOString()
        );
      }
    }

    putTombstones(
      entries,
      (itemKey) => `${namespace}/item:${itemKey}`,
      manifest.deletedItems
    );
  }
}

export async function importV1SyncState(
  redis: Redis,
  username: string
): Promise<Record<string, SyncKvEntry>> {
  const entries: EntryMap = {};

  try {
    const [settings, filesMetadata, videos, tv, stickies, calendar, contacts, maps] =
      await Promise.all([
        readV1StateEntry(redis, username, "settings"),
        readV1StateEntry(redis, username, "files-metadata"),
        readV1StateEntry(redis, username, "videos"),
        readV1StateEntry(redis, username, "tv"),
        readV1StateEntry(redis, username, "stickies"),
        readV1StateEntry(redis, username, "calendar"),
        readV1StateEntry(redis, username, "contacts"),
        readV1StateEntry(redis, username, "maps"),
      ]);

    if (settings) importSettings(entries, settings);
    if (filesMetadata) importFilesMetadata(entries, filesMetadata);
    if (videos) importVideos(entries, videos);
    if (tv) importTv(entries, tv);
    if (stickies) importStickies(entries, stickies);
    if (calendar) importCalendar(entries, calendar);
    if (contacts) importContacts(entries, contacts);
    if (maps) importMaps(entries, maps);

    await importSongs(redis, username, entries);
    await importBlobManifests(redis, username, entries);
  } catch (error) {
    console.error(`[sync2] v1 import failed for ${username}:`, error);
    throw error;
  }

  return entries;
}
