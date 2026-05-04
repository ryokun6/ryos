import { abortableFetch } from "@/utils/abortableFetch";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import { getApiUrl } from "@/utils/platform";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  DEFAULT_WALLPAPER_PATH,
  useDisplaySettingsStore,
} from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { sortTracksLikeServerOrder } from "@/stores/ipodTrackOrder";
import { useVideoStore, type Video } from "@/stores/useVideoStore";
import { useTvStore, type CustomChannel } from "@/stores/useTvStore";
import { useDockStore } from "@/stores/useDockStore";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useStickiesStore, type StickyNote } from "@/stores/useStickiesStore";
import {
  useCalendarStore,
  type CalendarEvent,
  type CalendarGroup,
  type TodoItem,
} from "@/stores/useCalendarStore";
import { useContactsStore } from "@/stores/useContactsStore";
import { useMapsStore, type SavedPlace } from "@/stores/useMapsStore";
import {
  useCloudSyncStore,
  type CloudSyncDeletionBucket,
} from "@/stores/useCloudSyncStore";
import type { Contact } from "@/utils/contacts";
import { normalizeContacts } from "@/utils/contacts";
import {
  uploadBlobWithStorageInstruction,
} from "@/utils/storageUpload";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  isRedisSyncDomain,
  isBlobSyncDomain,
  isIndividualBlobSyncDomain,
  REDIS_SYNC_DOMAINS,
  BLOB_SYNC_DOMAINS,
  type CloudSyncDomain,
  type CloudSyncBlobItemDownloadMetadata,
  type CloudSyncDomainMetadata,
  type CloudSyncEnvelope,
  type CloudSyncMetadataMap,
  type RedisSyncDomain,
  type BlobSyncDomain,
  type IndividualBlobSyncDomain,
  createEmptyCloudSyncMetadataMap,
} from "@/utils/cloudSyncShared";
import {
  getNextSyncClientVersion,
  getSyncClientId,
} from "@/sync/state";
import { getSyncSessionId } from "@/utils/syncSession";
import {
  fetchBlobDomainPayload,
  fetchRedisDomainSnapshot,
  requestBlobUploadInstruction as requestBlobUploadInstructionFromTransport,
} from "@/sync/transport";
import type { CloudSyncWriteVersion } from "@/utils/cloudSyncVersion";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  buildFilesMetadataRedisPatch,
  getLocalDocumentKeysRequiredForFilesMetadataMerge,
  mergeFilesMetadataSnapshots,
  type FilesMetadataSyncSnapshot,
} from "@/utils/cloudSyncFileMerge";
import {
  beginApplyingRemoteSettingsSections,
  endApplyingRemoteSettingsSections,
  getSettingsSectionTimestampMap,
  setSettingsSectionTimestamps,
  type SettingsSyncSection,
} from "@/sync/state";
import {
  beginApplyingRemoteDomain,
  endApplyingRemoteDomain,
} from "@/utils/cloudSyncRemoteApplyState";
import {
  applySettingsRedisPatch,
  buildSettingsRedisPatch,
  getSettingsSectionsToPatchUpload,
  getRemoteSettingsSectionsToApply,
  mergeSettingsSnapshotData,
  normalizeSettingsSnapshotData,
  shouldRestoreLegacyCustomWallpapers,
  type SettingsSnapshotData,
} from "@/utils/cloudSyncSettingsMerge";
import {
  getIndividualBlobKnownItems,
  setIndividualBlobKnownItems,
} from "@/utils/cloudSyncIndividualBlobState";
import {
  planIndividualBlobDownload,
  planIndividualBlobUpload,
} from "@/utils/cloudSyncIndividualBlobMerge";
import {
  deserializeStoreItem,
  readAndSerializeStoreItemsByKeys,
  readStoreItems,
  restoreStoreItems,
  serializeStoreItem,
  serializeStoreItems,
  type IndexedDBStoreItemWithKey as StoreItemWithKey,
} from "@/utils/indexedDBBackup";
import type {
  BlobIndividualDomainDownloadPayload,
  BlobMonolithicDomainDownloadPayload,
  CloudSyncDomainDownloadPayload,
  DownloadCloudSyncResult,
  PreparedCloudSyncDomainWrite,
  RedisStateDomainDownloadPayload,
} from "@/sync/types";
type AuthContext = {
  username: string;
  isAuthenticated: boolean;
};

type CustomWallpapersSnapshotData = StoreItemWithKey[];

interface FilesMetadataSnapshotData {
  items: Record<string, FileSystemItem>;
  libraryState: "uninitialized" | "loaded" | "cleared";
  documents?: FilesStoreSnapshotData;
  deletedPaths?: DeletionMarkerMap;
}

type FilesStoreSnapshotData = StoreItemWithKey[];

interface SongsSnapshotData {
  tracks: Track[];
  libraryState: "uninitialized" | "loaded" | "cleared";
  lastKnownVersion: number;
  deletedTrackIds?: DeletionMarkerMap;
}

function normalizeSongsTrackOrder(tracks: Track[]): Track[] {
  return sortTracksLikeServerOrder(tracks);
}

interface VideosSnapshotData {
  videos: Video[];
}

interface TvSnapshotData {
  customChannels: CustomChannel[];
  hiddenDefaultChannelIds?: string[];
  hiddenDefaultChannelIdsUpdatedAt?: string | null;
  hiddenDefaultChannelIdsResetAt?: string | null;
  deletedCustomChannelIds?: DeletionMarkerMap;
  lcdFilterOn: boolean;
  closedCaptionsOn: boolean;
}

interface StickiesSnapshotData {
  notes: StickyNote[];
  deletedNoteIds?: DeletionMarkerMap;
}

interface CalendarSnapshotData {
  events: CalendarEvent[];
  calendars: CalendarGroup[];
  todos: TodoItem[];
  deletedEventIds?: DeletionMarkerMap;
  deletedCalendarIds?: DeletionMarkerMap;
  deletedTodoIds?: DeletionMarkerMap;
}

interface ContactsSnapshotData {
  contacts: Contact[];
  myContactId: string | null;
  deletedContactIds?: DeletionMarkerMap;
}

interface MapsSnapshotData {
  home: SavedPlace | null;
  work: SavedPlace | null;
  favorites: SavedPlace[];
  updatedAt: number;
  deletedFavoriteIds?: DeletionMarkerMap;
}

type AnySnapshotData =
  | SettingsSnapshotData
  | FilesMetadataSnapshotData
  | FilesStoreSnapshotData
  | SongsSnapshotData
  | VideosSnapshotData
  | TvSnapshotData
  | StickiesSnapshotData
  | CalendarSnapshotData
  | ContactsSnapshotData
  | MapsSnapshotData
  | CustomWallpapersSnapshotData;

function parseSyncTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

interface SerializedStoreItemRecord {
  item: StoreItemWithKey;
  signature: string;
}

interface BlobSyncItemEnvelope {
  domain: BlobSyncDomain;
  key: string;
  version: number;
  updatedAt: string;
  data: StoreItemWithKey;
}

interface IndividualBlobDomainResponse {
  mode?: "individual";
  items?: Record<string, CloudSyncBlobItemDownloadMetadata>;
  metadata?: CloudSyncDomainMetadata;
  deletedItems?: DeletionMarkerMap;
}

interface DownloadCloudSyncOptions {
  shouldApply?: (metadata: CloudSyncDomainMetadata) => boolean;
  db?: IDBDatabase;
}

type RedisStateDomainSnapshot = {
  data: AnySnapshotData;
  metadata: CloudSyncDomainMetadata;
};

type BlobDomainInfoResponse = IndividualBlobDomainResponse & {
  downloadUrl?: string;
  blobUrl?: string;
};

interface BurstFetchCacheEntry<T> {
  promise: Promise<T> | null;
  value?: T;
  hasValue: boolean;
  expiresAt: number;
}

const SYNC_DOMAIN_FETCH_BURST_MS = 1500;

function createBurstFetchCache<T>(burstMs: number) {
  const entries = new Map<string, BurstFetchCacheEntry<T>>();

  return {
    get(key: string, loader: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const existing = entries.get(key);

      if (existing?.hasValue && existing.expiresAt > now) {
        return Promise.resolve(existing.value as T);
      }

      if (existing?.promise) {
        return existing.promise;
      }

      const nextEntry: BurstFetchCacheEntry<T> =
        existing ?? {
          promise: null,
          value: undefined,
          hasValue: false,
          expiresAt: 0,
        };

      const promise = loader()
        .then((value) => {
          nextEntry.promise = null;
          nextEntry.value = value;
          nextEntry.hasValue = true;
          nextEntry.expiresAt = Date.now() + burstMs;
          entries.set(key, nextEntry);
          return value;
        })
        .catch((error) => {
          nextEntry.promise = null;
          if (nextEntry.hasValue && nextEntry.expiresAt > Date.now()) {
            entries.set(key, nextEntry);
          } else {
            entries.delete(key);
          }
          throw error;
        });

      nextEntry.promise = promise;
      entries.set(key, nextEntry);
      return promise;
    },
    set(key: string, value: T): void {
      entries.set(key, {
        promise: null,
        value,
        hasValue: true,
        expiresAt: Date.now() + burstMs,
      });
    },
    invalidate(key: string): void {
      entries.delete(key);
    },
  };
}

const redisStateDomainSnapshotCache = createBurstFetchCache<
  RedisStateDomainSnapshot | null
>(SYNC_DOMAIN_FETCH_BURST_MS);
const blobDomainInfoCache = createBurstFetchCache<BlobDomainInfoResponse | null>(
  SYNC_DOMAIN_FETCH_BURST_MS
);
const individualBlobReconcileCache = createBurstFetchCache<boolean>(
  SYNC_DOMAIN_FETCH_BURST_MS
);

async function getIndexedDbHandle(providedDb?: IDBDatabase): Promise<{
  db: IDBDatabase;
  shouldClose: boolean;
}> {
  if (providedDb) {
    return {
      db: providedDb,
      shouldClose: false,
    };
  }

  return {
    db: await ensureIndexedDBInitialized(),
    shouldClose: true,
  };
}

function assertCompressionSupport(): void {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  ) {
    throw new Error("Cloud sync requires browser compression support.");
  }
}

async function computeSyncSignature(value: unknown): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function serializeStoreItemRecords(
  items: StoreItemWithKey[]
): Promise<SerializedStoreItemRecord[]> {
  return Promise.all(
    items.map(async (item) => {
      const serializedItem = await serializeStoreItem(item);
      return {
        item: serializedItem,
        signature: await computeSyncSignature(serializedItem),
      };
    })
  );
}

async function upsertStoreItems(
  db: IDBDatabase,
  storeName: string,
  items: StoreItemWithKey[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));

    try {
      for (const item of items) {
        store.put(deserializeStoreItem(item), item.key);
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

async function deleteStoreItemsByKey(
  db: IDBDatabase,
  storeName: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));

    try {
      for (const key of keys) {
        store.delete(key);
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

async function gzipJson(value: unknown): Promise<Uint8Array> {
  assertCompressionSupport();
  const encoder = new TextEncoder();
  const inputData = encoder.encode(JSON.stringify(value));
  const readableStream = new ReadableStream({
    start(controller) {
      controller.enqueue(inputData);
      controller.close();
    },
  });
  const compressedStream = readableStream.pipeThrough(
    new CompressionStream("gzip")
  );
  const chunks: Uint8Array[] = [];
  const reader = compressedStream.getReader();

  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) {
      break;
    }
    if (chunk) {
      chunks.push(chunk);
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}


function serializeSettingsSnapshot(): SettingsSnapshotData {
  const displayState = useDisplaySettingsStore.getState();
  const audioState = useAudioSettingsStore.getState();
  const ipodState = useIpodStore.getState();
  const dockState = useDockStore.getState();
  const dashboardState = useDashboardStore.getState();
  const sectionUpdatedAt = getSettingsSectionTimestampMap();

  return {
    theme: useThemeStore.getState().current,
    language: useLanguageStore.getState().current,
    languageInitialized:
      localStorage.getItem("ryos:language-initialized") === "true",
    aiModel: useAppStore.getState().aiModel,
    display: {
      displayMode: displayState.displayMode,
      shaderEffectEnabled: displayState.shaderEffectEnabled,
      selectedShaderType: displayState.selectedShaderType,
      currentWallpaper: displayState.currentWallpaper,
      screenSaverEnabled: displayState.screenSaverEnabled,
      screenSaverType: displayState.screenSaverType,
      screenSaverIdleTime: displayState.screenSaverIdleTime,
      debugMode: displayState.debugMode,
      htmlPreviewSplit: displayState.htmlPreviewSplit,
    },
    audio: {
      masterVolume: audioState.masterVolume,
      uiVolume: audioState.uiVolume,
      chatSynthVolume: audioState.chatSynthVolume,
      speechVolume: audioState.speechVolume,
      ipodVolume: audioState.ipodVolume,
      uiSoundsEnabled: audioState.uiSoundsEnabled,
      terminalSoundsEnabled: audioState.terminalSoundsEnabled,
      typingSynthEnabled: audioState.typingSynthEnabled,
      speechEnabled: audioState.speechEnabled,
      keepTalkingEnabled: audioState.keepTalkingEnabled,
      ttsModel: audioState.ttsModel,
      ttsVoice: audioState.ttsVoice,
      synthPreset: audioState.synthPreset,
    },
    ipod: {
      displayMode: ipodState.displayMode,
      showLyrics: ipodState.showLyrics,
      lyricsAlignment: ipodState.lyricsAlignment,
      lyricsFont: ipodState.lyricsFont,
      romanization: ipodState.romanization,
      lyricsTranslationLanguage: ipodState.lyricsTranslationLanguage ?? null,
      theme: ipodState.theme,
      lcdFilterOn: ipodState.lcdFilterOn,
    },
    dock: {
      pinnedItems: dockState.pinnedItems,
      scale: dockState.scale,
      hiding: dockState.hiding,
      magnification: dockState.magnification,
    },
    dashboard: {
      widgets: dashboardState.widgets,
    },
    sectionUpdatedAt,
  };
}

async function serializeCustomWallpapersSnapshot(
  providedDb?: IDBDatabase
): Promise<CustomWallpapersSnapshotData> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  try {
    return await serializeStoreItems(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

async function serializeCustomWallpapersRecords(
  providedDb?: IDBDatabase
): Promise<SerializedStoreItemRecord[]> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  try {
    return await serializeStoreItemRecords(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

async function serializeIndexedDbStoreSnapshot(
  storeName: string,
  providedDb?: IDBDatabase
): Promise<FilesStoreSnapshotData> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    const items = await readStoreItems(db, storeName);
    return await serializeStoreItems(items);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

async function serializeIndexedDbStoreRecords(
  storeName: string,
  providedDb?: IDBDatabase
): Promise<SerializedStoreItemRecord[]> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    return await serializeStoreItemRecords(await readStoreItems(db, storeName));
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

function getIndividualBlobStoreName(domain: IndividualBlobSyncDomain): string {
  switch (domain) {
    case "files-images":
      return STORES.IMAGES;
    case "files-trash":
      return STORES.TRASH;
    case "files-applets":
      return STORES.APPLETS;
    case "custom-wallpapers":
      return STORES.CUSTOM_WALLPAPERS;
  }
}

function getIndividualBlobDeletionBucket(
  domain: IndividualBlobSyncDomain
): CloudSyncDeletionBucket {
  switch (domain) {
    case "files-images":
      return "fileImageKeys";
    case "files-trash":
      return "fileTrashKeys";
    case "files-applets":
      return "fileAppletKeys";
    case "custom-wallpapers":
      return "customWallpaperKeys";
  }
}

function getIndividualBlobDeletedKeys(
  domain: IndividualBlobSyncDomain
): DeletionMarkerMap {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  switch (domain) {
    case "files-images":
      return deletionMarkers.fileImageKeys;
    case "files-trash":
      return deletionMarkers.fileTrashKeys;
    case "files-applets":
      return deletionMarkers.fileAppletKeys;
    case "custom-wallpapers":
      return deletionMarkers.customWallpaperKeys;
  }
}

function pruneDeletedKeysForExistingRecords(
  domain: IndividualBlobSyncDomain,
  records: SerializedStoreItemRecord[]
): DeletionMarkerMap {
  const deletedKeys = getIndividualBlobDeletedKeys(domain);
  if (Object.keys(deletedKeys).length === 0 || records.length === 0) {
    return deletedKeys;
  }

  const existingKeys = new Set(records.map((record) => record.item.key));
  const staleDeletedKeys = Object.keys(deletedKeys).filter((key) =>
    existingKeys.has(key)
  );

  if (staleDeletedKeys.length > 0) {
    useCloudSyncStore
      .getState()
      .clearDeletedKeys(getIndividualBlobDeletionBucket(domain), staleDeletedKeys);
  }

  return Object.fromEntries(
    Object.entries(deletedKeys).filter(([key]) => !existingKeys.has(key))
  );
}

async function serializeIndividualBlobDomainRecords(
  domain: IndividualBlobSyncDomain,
  providedDb?: IDBDatabase
): Promise<SerializedStoreItemRecord[]> {
  switch (domain) {
    case "files-images":
      return serializeIndexedDbStoreRecords(STORES.IMAGES, providedDb);
    case "files-trash":
      return serializeIndexedDbStoreRecords(STORES.TRASH, providedDb);
    case "files-applets":
      return serializeIndexedDbStoreRecords(STORES.APPLETS, providedDb);
    case "custom-wallpapers":
      return serializeCustomWallpapersRecords(providedDb);
  }
}

async function serializeFilesMetadataSnapshot(
  providedDb?: IDBDatabase
): Promise<FilesMetadataSnapshotData> {
  const filesState = useFilesStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    items: filesState.items,
    libraryState: filesState.libraryState,
    documents: await serializeIndexedDbStoreSnapshot(
      STORES.DOCUMENTS,
      providedDb
    ),
    deletedPaths: deletionMarkers.fileMetadataPaths,
  };
}

function serializeSongsSnapshot(): SongsSnapshotData {
  const ipodState = useIpodStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    // Keep songs newest-first before upload so cloud merges cannot preserve a stale bottom-appended order.
    tracks: normalizeSongsTrackOrder(ipodState.tracks),
    libraryState: ipodState.libraryState,
    lastKnownVersion: ipodState.lastKnownVersion,
    deletedTrackIds: deletionMarkers.songTrackIds,
  };
}

function serializeVideosSnapshot(): VideosSnapshotData {
  return {
    videos: useVideoStore.getState().videos,
  };
}

function serializeTvSnapshot(): TvSnapshotData {
  const tvState = useTvStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    customChannels: tvState.customChannels,
    hiddenDefaultChannelIds: tvState.hiddenDefaultChannelIds,
    hiddenDefaultChannelIdsUpdatedAt: tvState.hiddenDefaultChannelIdsUpdatedAt,
    hiddenDefaultChannelIdsResetAt: tvState.hiddenDefaultChannelIdsResetAt,
    deletedCustomChannelIds: deletionMarkers.tvCustomChannelIds,
    lcdFilterOn: tvState.lcdFilterOn,
    closedCaptionsOn: tvState.closedCaptionsOn,
  };
}

function serializeStickiesSnapshot(): StickiesSnapshotData {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    notes: useStickiesStore.getState().notes,
    deletedNoteIds: deletionMarkers.stickyNoteIds,
  };
}

function serializeCalendarSnapshot(): CalendarSnapshotData {
  const calendarState = useCalendarStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    events: calendarState.events,
    calendars: calendarState.calendars,
    todos: calendarState.todos,
    deletedEventIds: deletionMarkers.calendarEventIds,
    deletedCalendarIds: deletionMarkers.calendarIds,
    deletedTodoIds: deletionMarkers.calendarTodoIds,
  };
}

function serializeContactsSnapshot(): ContactsSnapshotData {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    contacts: useContactsStore.getState().contacts,
    myContactId: useContactsStore.getState().myContactId,
    deletedContactIds: deletionMarkers.contactIds,
  };
}

function normalizeSavedPlace(value: unknown): SavedPlace | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<SavedPlace>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number"
  ) {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    subtitle:
      typeof candidate.subtitle === "string" ? candidate.subtitle : undefined,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    category:
      typeof candidate.category === "string" ? candidate.category : undefined,
  };
}

function normalizeSavedPlaceList(value: unknown): SavedPlace[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenIds = new Set<string>();
  const normalized: SavedPlace[] = [];
  for (const entry of value) {
    const place = normalizeSavedPlace(entry);
    if (!place || seenIds.has(place.id)) {
      continue;
    }
    seenIds.add(place.id);
    normalized.push(place);
  }
  return normalized;
}

function serializeMapsSnapshot(): MapsSnapshotData {
  const mapsState = useMapsStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    home: mapsState.home,
    work: mapsState.work,
    favorites: mapsState.favorites,
    updatedAt: mapsState.updatedAt || 0,
    deletedFavoriteIds: deletionMarkers.mapsFavoriteIds,
  };
}

function normalizeMapsSnapshot(data: MapsSnapshotData | null | undefined): MapsSnapshotData {
  return {
    home: normalizeSavedPlace(data?.home ?? null),
    work: normalizeSavedPlace(data?.work ?? null),
    favorites: normalizeSavedPlaceList(data?.favorites),
    updatedAt:
      typeof data?.updatedAt === "number" && Number.isFinite(data.updatedAt)
        ? data.updatedAt
        : 0,
    deletedFavoriteIds: data?.deletedFavoriteIds,
  };
}

async function createCloudSyncEnvelope(
  domain: CloudSyncDomain,
  providedDb?: IDBDatabase
): Promise<CloudSyncEnvelope<AnySnapshotData>> {
  const updatedAt = new Date().toISOString();

  switch (domain) {
    case "settings":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeSettingsSnapshot(),
      };
    case "files-metadata":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeFilesMetadataSnapshot(providedDb),
      };
    case "files-images":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.IMAGES, providedDb),
      };
    case "files-trash":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.TRASH, providedDb),
      };
    case "files-applets":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.APPLETS, providedDb),
      };
    case "songs":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeSongsSnapshot(),
      };
    case "videos":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeVideosSnapshot(),
      };
    case "tv":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeTvSnapshot(),
      };
    case "stickies":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeStickiesSnapshot(),
      };
    case "calendar":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeCalendarSnapshot(),
      };
    case "contacts":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeContactsSnapshot(),
      };
    case "maps":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeMapsSnapshot(),
      };
    case "custom-wallpapers":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeCustomWallpapersSnapshot(providedDb),
      };
  }
}

async function applySettingsSnapshot(
  data: SettingsSnapshotData,
  fallbackUpdatedAt: string,
  providedDb?: IDBDatabase
): Promise<void> {
  const normalizedData = normalizeSettingsSnapshotData(data, fallbackUpdatedAt);
  const remoteSectionUpdatedAt = normalizedData.sectionUpdatedAt || {};
  const localSectionUpdatedAt = getSettingsSectionTimestampMap();
  const sectionsToApply = getRemoteSettingsSectionsToApply(
    localSectionUpdatedAt,
    remoteSectionUpdatedAt
  );

  if (sectionsToApply.length > 0) {
    console.log(
      `[CloudSync] Settings apply: sections to apply: [${sectionsToApply.join(", ")}]`
    );
  } else {
    console.log(
      "[CloudSync] Settings apply: no sections to apply (all local timestamps >= remote)"
    );
  }

  const legacyCustomWallpapers = normalizedData.customWallpapers || [];
  const hasDedicatedCustomWallpaperSync = Boolean(
    useCloudSyncStore.getState().remoteMetadata["custom-wallpapers"]?.updatedAt
  );

  // Legacy: restore embedded custom wallpapers only on first migration when
  // there is no dedicated custom-wallpapers sync domain and nothing local yet.
  if (legacyCustomWallpapers.length > 0) {
    const { db, shouldClose } = await getIndexedDbHandle(providedDb);
    try {
      const localWallpaperCount = (
        await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
      ).length;
      if (
        shouldRestoreLegacyCustomWallpapers({
          legacyWallpaperCount: legacyCustomWallpapers.length,
          localWallpaperCount,
          hasDedicatedCustomWallpaperSync,
        })
      ) {
        await upsertStoreItems(
          db,
          STORES.CUSTOM_WALLPAPERS,
          legacyCustomWallpapers
        );
        useDisplaySettingsStore.getState().bumpCustomWallpapersRevision();
      }
    } finally {
      if (shouldClose) {
        db.close();
      }
    }
  }

  const appliedSections: SettingsSyncSection[] = [];

  beginApplyingRemoteSettingsSections(sectionsToApply);
  try {
    if (sectionsToApply.includes("theme")) {
      try {
        useThemeStore.getState().setTheme(normalizedData.theme as never);
        appliedSections.push("theme");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote theme:", e);
      }
    }

    if (sectionsToApply.includes("language")) {
      try {
        localStorage.setItem(
          "ryos:language-initialized",
          normalizedData.languageInitialized ? "true" : "false"
        );
        await useLanguageStore.getState().setLanguage(normalizedData.language);
        appliedSections.push("language");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote language:", e);
      }
    }

    if (sectionsToApply.includes("display")) {
      try {
        useDisplaySettingsStore.setState({
          displayMode: normalizedData.display.displayMode as never,
          shaderEffectEnabled: normalizedData.display.shaderEffectEnabled,
          selectedShaderType: normalizedData.display.selectedShaderType as never,
          screenSaverEnabled: normalizedData.display.screenSaverEnabled,
          screenSaverType: normalizedData.display.screenSaverType,
          screenSaverIdleTime: normalizedData.display.screenSaverIdleTime,
          debugMode: normalizedData.display.debugMode,
          htmlPreviewSplit: normalizedData.display.htmlPreviewSplit,
        });

        await useDisplaySettingsStore
          .getState()
          .setWallpaper(normalizedData.display.currentWallpaper);
        appliedSections.push("display");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote display:", e);
      }
    }

    if (sectionsToApply.includes("audio")) {
      try {
        useAudioSettingsStore.setState({
          masterVolume: normalizedData.audio.masterVolume,
          uiVolume: normalizedData.audio.uiVolume,
          chatSynthVolume: normalizedData.audio.chatSynthVolume,
          speechVolume: normalizedData.audio.speechVolume,
          ipodVolume: normalizedData.audio.ipodVolume,
          uiSoundsEnabled: normalizedData.audio.uiSoundsEnabled,
          terminalSoundsEnabled: normalizedData.audio.terminalSoundsEnabled,
          typingSynthEnabled: normalizedData.audio.typingSynthEnabled,
          speechEnabled: normalizedData.audio.speechEnabled,
          keepTalkingEnabled: normalizedData.audio.keepTalkingEnabled,
          ttsModel: normalizedData.audio.ttsModel,
          ttsVoice: normalizedData.audio.ttsVoice,
          synthPreset: normalizedData.audio.synthPreset,
        });
        appliedSections.push("audio");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote audio:", e);
      }
    }

    if (sectionsToApply.includes("aiModel")) {
      try {
        useAppStore.getState().setAiModel(normalizedData.aiModel);
        appliedSections.push("aiModel");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote aiModel:", e);
      }
    }

    if (normalizedData.ipod && sectionsToApply.includes("ipod")) {
      try {
        const remoteIpod = normalizedData.ipod;
        useIpodStore.setState({
          displayMode: remoteIpod.displayMode,
          showLyrics: remoteIpod.showLyrics,
          lyricsAlignment: remoteIpod.lyricsAlignment,
          lyricsFont: remoteIpod.lyricsFont,
          romanization: remoteIpod.romanization,
          lyricsTranslationLanguage: remoteIpod.lyricsTranslationLanguage ?? null,
          theme: remoteIpod.theme,
          lcdFilterOn: remoteIpod.lcdFilterOn,
        });
        appliedSections.push("ipod");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote ipod:", e);
      }
    }

    if (normalizedData.dock && sectionsToApply.includes("dock")) {
      try {
        useDockStore.setState({
          pinnedItems: normalizedData.dock.pinnedItems,
          scale: normalizedData.dock.scale,
          hiding: normalizedData.dock.hiding,
          magnification: normalizedData.dock.magnification,
        });
        appliedSections.push("dock");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote dock:", e);
      }
    }

    if (
      normalizedData.dashboard?.widgets &&
      Array.isArray(normalizedData.dashboard.widgets) &&
      sectionsToApply.includes("dashboard")
    ) {
      try {
        useDashboardStore.setState({
          widgets: normalizedData.dashboard.widgets,
        });
        appliedSections.push("dashboard");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote dashboard:", e);
      }
    }
  } finally {
    endApplyingRemoteSettingsSections(sectionsToApply);
  }

  if (appliedSections.length < sectionsToApply.length) {
    const failed = sectionsToApply.filter((s) => !appliedSections.includes(s));
    console.warn(
      `[CloudSync] Settings apply: ${appliedSections.length}/${sectionsToApply.length} sections succeeded, failed: ${failed.join(", ")}`
    );
  }

  setSettingsSectionTimestamps(
    Object.fromEntries(
      appliedSections.map((section) => [section, remoteSectionUpdatedAt[section] || fallbackUpdatedAt])
    )
  );
}

async function applyIndexedDbStoreSnapshot(
  storeName: string,
  data: FilesStoreSnapshotData,
  providedDb?: IDBDatabase
): Promise<void> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    await restoreStoreItems(db, storeName, data);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

async function applyFilesMetadataSnapshot(
  data: FilesMetadataSnapshotData,
  providedDb?: IDBDatabase
): Promise<void> {
  const remoteDeletedPaths = normalizeDeletionMarkerMap(data.deletedPaths);
  const cloudSyncState = useCloudSyncStore.getState();
  const localDeletedPaths = cloudSyncState.deletionMarkers.fileMetadataPaths;
  const localSnapshot: FilesMetadataSyncSnapshot = {
    items: useFilesStore.getState().items,
    libraryState: useFilesStore.getState().libraryState,
    documents: await serializeIndexedDbStoreSnapshot(STORES.DOCUMENTS, providedDb),
    deletedPaths: localDeletedPaths,
  };
  const mergedSnapshot = mergeFilesMetadataSnapshots(localSnapshot, {
    ...data,
    deletedPaths: remoteDeletedPaths,
  });
  const effectiveDeletedPaths = mergeDeletionMarkerMaps(
    localDeletedPaths,
    remoteDeletedPaths
  );
  const prunedDeletedPaths = Object.keys(effectiveDeletedPaths).filter(
    (path) => !mergedSnapshot.deletedPaths?.[path]
  );

  cloudSyncState.mergeDeletedKeys("fileMetadataPaths", remoteDeletedPaths);
  cloudSyncState.clearDeletedKeys("fileMetadataPaths", prunedDeletedPaths);

  useFilesStore.setState({
    items: mergedSnapshot.items,
    libraryState: mergedSnapshot.libraryState,
  });

  await applyIndexedDbStoreSnapshot(
    STORES.DOCUMENTS,
    mergedSnapshot.documents || [],
    providedDb
  );
}

function applySongsSnapshot(data: SongsSnapshotData): void {
  const remoteDeletedTrackIds = normalizeDeletionMarkerMap(data.deletedTrackIds);
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedTrackIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.songTrackIds,
    remoteDeletedTrackIds
  );

  cloudSyncState.mergeDeletedKeys("songTrackIds", remoteDeletedTrackIds);

  useIpodStore.setState({
    tracks: normalizeSongsTrackOrder(
      filterDeletedIds(data.tracks, effectiveDeletedTrackIds, (track) => track.id)
    ),
    libraryState: data.libraryState,
    lastKnownVersion: data.lastKnownVersion,
  });
}

function applyVideosSnapshot(data: VideosSnapshotData): void {
  useVideoStore.setState({
    videos: data.videos,
  });
}

function applyTvSnapshot(data: TvSnapshotData): void {
  const remoteDeletedChannelIds = normalizeDeletionMarkerMap(
    data.deletedCustomChannelIds
  );
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedChannelIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.tvCustomChannelIds,
    remoteDeletedChannelIds
  );

  cloudSyncState.mergeDeletedKeys("tvCustomChannelIds", remoteDeletedChannelIds);

  useTvStore.setState({
    customChannels: filterDeletedIds(
      Array.isArray(data.customChannels) ? data.customChannels : [],
      effectiveDeletedChannelIds,
      (channel) => channel.id
    ),
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
    lcdFilterOn: data.lcdFilterOn ?? true,
    closedCaptionsOn: data.closedCaptionsOn ?? true,
  });
}

function applyStickiesSnapshot(data: StickiesSnapshotData): void {
  const remoteDeletedNoteIds = normalizeDeletionMarkerMap(data.deletedNoteIds);
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedNoteIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.stickyNoteIds,
    remoteDeletedNoteIds
  );

  cloudSyncState.mergeDeletedKeys("stickyNoteIds", remoteDeletedNoteIds);

  useStickiesStore.setState({
    notes: filterDeletedIds(data.notes, effectiveDeletedNoteIds, (note) => note.id),
  });
}

function applyCalendarSnapshot(data: CalendarSnapshotData): void {
  const remoteDeletedTodoIds = normalizeDeletionMarkerMap(data.deletedTodoIds);
  const remoteDeletedEventIds = normalizeDeletionMarkerMap(data.deletedEventIds);
  const remoteDeletedCalendarIds = normalizeDeletionMarkerMap(
    data.deletedCalendarIds
  );
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedTodoIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.calendarTodoIds,
    remoteDeletedTodoIds
  );
  const effectiveDeletedEventIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.calendarEventIds,
    remoteDeletedEventIds
  );
  const effectiveDeletedCalendarIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.calendarIds,
    remoteDeletedCalendarIds
  );

  cloudSyncState.mergeDeletedKeys("calendarTodoIds", remoteDeletedTodoIds);
  cloudSyncState.mergeDeletedKeys("calendarEventIds", remoteDeletedEventIds);
  cloudSyncState.mergeDeletedKeys("calendarIds", remoteDeletedCalendarIds);

  useCalendarStore.setState({
    events: filterDeletedIds(
      data.events,
      effectiveDeletedEventIds,
      (event) => event.id
    ),
    calendars: filterDeletedIds(
      data.calendars,
      effectiveDeletedCalendarIds,
      (calendar) => calendar.id
    ),
    todos: filterDeletedIds(
      data.todos,
      effectiveDeletedTodoIds,
      (todo) => todo.id
    ),
  });
}

function applyMapsSnapshot(data: MapsSnapshotData): void {
  const normalized = normalizeMapsSnapshot(data);
  const remoteDeletedFavorites = normalizeDeletionMarkerMap(
    normalized.deletedFavoriteIds
  );
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedFavorites = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.mapsFavoriteIds,
    remoteDeletedFavorites
  );

  cloudSyncState.mergeDeletedKeys("mapsFavoriteIds", remoteDeletedFavorites);

  useMapsStore.getState().replaceFromSync({
    home: normalized.home,
    work: normalized.work,
    favorites: filterDeletedIds(
      normalized.favorites,
      effectiveDeletedFavorites,
      (place) => place.id
    ),
  });
  useMapsStore.setState({
    updatedAt: Math.max(useMapsStore.getState().updatedAt || 0, normalized.updatedAt),
  });
}

function applyContactsSnapshot(data: ContactsSnapshotData): void {
  const remoteDeletedContactIds = normalizeDeletionMarkerMap(
    data.deletedContactIds
  );
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedContactIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.contactIds,
    remoteDeletedContactIds
  );

  cloudSyncState.mergeDeletedKeys("contactIds", remoteDeletedContactIds);

  useContactsStore
    .getState()
    .replaceContactsFromSync(
      filterDeletedIds(
        normalizeContacts(data?.contacts),
        effectiveDeletedContactIds,
        (contact) => contact.id
      ),
      data?.myContactId ?? null
    );
}

async function applyMonolithicBlobSnapshotToIndividualDomain(
  domain: IndividualBlobSyncDomain,
  data: FilesStoreSnapshotData,
  providedDb?: IDBDatabase
): Promise<void> {
  const changedItems = Object.fromEntries(
    data.map((item) => [item.key, item])
  ) as Record<string, StoreItemWithKey>;

  await applyIndividualBlobDomain(
    domain,
    [],
    changedItems,
    getIndividualBlobDeletedKeys(domain),
    providedDb
  );
}

async function finalizeCustomWallpaperSync(remoteKeys: Iterable<string>): Promise<void> {
  const remoteKeySet = new Set(remoteKeys);
  const displayStore = useDisplaySettingsStore.getState();
  const current = displayStore.currentWallpaper;

  if (current?.startsWith("indexeddb://")) {
    const id = current.substring("indexeddb://".length);
    if (remoteKeySet.has(id)) {
      await displayStore.setWallpaper(current);
    } else {
      useDisplaySettingsStore.setState({
        currentWallpaper: DEFAULT_WALLPAPER_PATH,
        wallpaperSource: DEFAULT_WALLPAPER_PATH,
      });
    }
  }

  displayStore.bumpCustomWallpapersRevision();
}

async function applyIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  keysToDelete: string[],
  changedItems: Record<string, StoreItemWithKey>,
  deletedKeys: DeletionMarkerMap = {},
  providedDb?: IDBDatabase
): Promise<void> {
  const storeName = getIndividualBlobStoreName(domain);
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  let existingKeys = new Set<string>();

  try {
    const existingItems = await readStoreItems(db, storeName);
    existingKeys = new Set(existingItems.map((item) => item.key));

    await deleteStoreItemsByKey(db, storeName, keysToDelete);
    await upsertStoreItems(
      db,
      storeName,
      Object.values(changedItems).filter((item) => !deletedKeys[item.key])
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }

  if (domain === "custom-wallpapers") {
    const finalKeySet = new Set(
      Array.from(existingKeys).filter((key) => !keysToDelete.includes(key))
    );
    for (const item of Object.values(changedItems)) {
      if (!deletedKeys[item.key]) {
        finalKeySet.add(item.key);
      }
    }
    await finalizeCustomWallpaperSync(finalKeySet);
  }
}

async function applyCloudSyncEnvelope(
  envelope: CloudSyncEnvelope<AnySnapshotData>,
  providedDb?: IDBDatabase
): Promise<void> {
  beginApplyingRemoteDomain(envelope.domain);
  try {
    switch (envelope.domain) {
      case "settings":
        await applySettingsSnapshot(
          envelope.data as SettingsSnapshotData,
          envelope.updatedAt,
          providedDb
        );
        return;
      case "files-metadata":
        await applyFilesMetadataSnapshot(
          envelope.data as FilesMetadataSnapshotData,
          providedDb
        );
        return;
      case "files-images":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "files-images",
          envelope.data as FilesStoreSnapshotData,
          providedDb
        );
        return;
      case "files-trash":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "files-trash",
          envelope.data as FilesStoreSnapshotData,
          providedDb
        );
        return;
      case "files-applets":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "files-applets",
          envelope.data as FilesStoreSnapshotData,
          providedDb
        );
        return;
      case "songs":
        applySongsSnapshot(envelope.data as SongsSnapshotData);
        return;
      case "videos":
        applyVideosSnapshot(envelope.data as VideosSnapshotData);
        return;
      case "tv":
        applyTvSnapshot(envelope.data as TvSnapshotData);
        return;
      case "stickies":
        applyStickiesSnapshot(envelope.data as StickiesSnapshotData);
        return;
      case "calendar":
        applyCalendarSnapshot(envelope.data as CalendarSnapshotData);
        return;
      case "contacts":
        applyContactsSnapshot(envelope.data as ContactsSnapshotData);
        return;
      case "maps":
        applyMapsSnapshot(envelope.data as MapsSnapshotData);
        return;
      case "custom-wallpapers":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "custom-wallpapers",
          envelope.data as CustomWallpapersSnapshotData,
          providedDb
        );
        return;
    }
  } finally {
    endApplyingRemoteDomain(envelope.domain);
  }
}

function authHeaders(): Record<string, string> {
  return {
    "X-Sync-Session-Id": getSyncSessionId(),
  };
}

function getDomainFetchCacheKey(auth: AuthContext, domain: string): string {
  return `${auth.username.toLowerCase()}:${domain}`;
}

function cacheRedisStateDomainSnapshot(
  domain: RedisSyncDomain,
  auth: AuthContext,
  value: RedisStateDomainSnapshot | null
): void {
  redisStateDomainSnapshotCache.set(getDomainFetchCacheKey(auth, domain), value);
}

/** After a 409 on incremental files-metadata upload, drop cached remote snapshot so the next prepare refetches. */
export function invalidateRedisStateSnapshotForUpload(
  username: string,
  domain: RedisSyncDomain
): void {
  redisStateDomainSnapshotCache.invalidate(
    `${username.toLowerCase()}:${domain}`
  );
}

function createWriteSyncVersion(
  domain: CloudSyncDomain,
  baseMetadata: CloudSyncDomainMetadata | null | undefined
): CloudSyncWriteVersion {
  return {
    clientId: getSyncClientId(),
    clientVersion: getNextSyncClientVersion(domain),
    baseServerVersion: baseMetadata?.syncVersion?.serverVersion ?? null,
    knownClientVersions: baseMetadata?.syncVersion?.clientVersions || {},
  };
}

export async function fetchPhysicalCloudSyncMetadata(): Promise<CloudSyncMetadataMap> {
  const consolidatedRes = await abortableFetch(getApiUrl("/api/sync/domains"), {
    method: "GET",
    headers: authHeaders(),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (consolidatedRes.ok) {
    const consolidatedData = (await consolidatedRes.json()) as {
      physicalMetadata?: Partial<CloudSyncMetadataMap>;
    };
    if (consolidatedData.physicalMetadata) {
      const merged = createEmptyCloudSyncMetadataMap();
      for (const domain of [...BLOB_SYNC_DOMAINS, ...REDIS_SYNC_DOMAINS]) {
        const entry =
          consolidatedData.physicalMetadata[
            domain as keyof typeof consolidatedData.physicalMetadata
          ];
        if (entry) {
          merged[domain] = entry as CloudSyncDomainMetadata;
        }
      }
      return merged;
    }
  }
  throw new Error("Failed to fetch consolidated sync metadata");
}

function mergeItemsByIdPreferNewer<T extends { id: string; updatedAt?: number }>(
  localItems: T[],
  remoteItems: T[],
  deletedIds: DeletionMarkerMap
): T[] {
  const merged = new Map<string, T>();
  for (const item of remoteItems) {
    if (!deletedIds[item.id]) merged.set(item.id, item);
  }
  for (const item of localItems) {
    if (deletedIds[item.id]) continue;
    const existing = merged.get(item.id);
    if (
      !existing ||
      (item.updatedAt ?? 0) >= (existing.updatedAt ?? 0)
    ) {
      merged.set(item.id, item);
    }
  }
  return Array.from(merged.values());
}

function mergeItemsById<T extends { id: string }>(
  localItems: T[],
  remoteItems: T[]
): T[] {
  const merged = new Map<string, T>();
  for (const item of remoteItems) {
    merged.set(item.id, item);
  }
  for (const item of localItems) {
    merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

function mergeStickiesSnapshots(
  local: StickiesSnapshotData,
  remote: StickiesSnapshotData
): StickiesSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedNoteIds),
    normalizeDeletionMarkerMap(remote.deletedNoteIds)
  );
  return {
    notes: mergeItemsByIdPreferNewer(local.notes, remote.notes, mergedDeleted),
    deletedNoteIds: mergedDeleted,
  };
}

function mergeCalendarSnapshots(
  local: CalendarSnapshotData,
  remote: CalendarSnapshotData
): CalendarSnapshotData {
  const mergedDeletedEvents = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedEventIds),
    normalizeDeletionMarkerMap(remote.deletedEventIds)
  );
  const mergedDeletedCalendars = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedCalendarIds),
    normalizeDeletionMarkerMap(remote.deletedCalendarIds)
  );
  const mergedDeletedTodos = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedTodoIds),
    normalizeDeletionMarkerMap(remote.deletedTodoIds)
  );
  return {
    events: mergeItemsByIdPreferNewer(local.events, remote.events, mergedDeletedEvents),
    calendars: mergeItemsByIdPreferNewer(
      local.calendars as (CalendarGroup & { updatedAt?: number })[],
      remote.calendars as (CalendarGroup & { updatedAt?: number })[],
      mergedDeletedCalendars
    ) as CalendarGroup[],
    todos: mergeItemsById(
      filterDeletedIds(local.todos, mergedDeletedTodos, (t) => t.id),
      filterDeletedIds(remote.todos, mergedDeletedTodos, (t) => t.id)
    ),
    deletedEventIds: mergedDeletedEvents,
    deletedCalendarIds: mergedDeletedCalendars,
    deletedTodoIds: mergedDeletedTodos,
  };
}

function mergeMapsSnapshots(
  local: MapsSnapshotData,
  remote: MapsSnapshotData
): MapsSnapshotData {
  const localNorm = normalizeMapsSnapshot(local);
  const remoteNorm = normalizeMapsSnapshot(remote);
  const mergedDeletedFavorites = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(localNorm.deletedFavoriteIds),
    normalizeDeletionMarkerMap(remoteNorm.deletedFavoriteIds)
  );

  // Local wins for home/work when local is strictly newer; otherwise remote
  // wins. Favorites are the union (minus deletions) so simultaneous edits on
  // different devices don't drop pins. Recents are intentionally device-local.
  const preferLocal = localNorm.updatedAt >= remoteNorm.updatedAt;
  const home = preferLocal ? localNorm.home : remoteNorm.home;
  const work = preferLocal ? localNorm.work : remoteNorm.work;

  const favoritesById = new Map<string, SavedPlace>();
  // Iterate in display order (newest first). Local first when preferred so
  // local order wins on ties; otherwise remote first.
  const favoritePass = preferLocal
    ? [localNorm.favorites, remoteNorm.favorites]
    : [remoteNorm.favorites, localNorm.favorites];
  for (const list of favoritePass) {
    for (const place of list) {
      if (mergedDeletedFavorites[place.id]) continue;
      if (!favoritesById.has(place.id)) {
        favoritesById.set(place.id, place);
      }
    }
  }

  return {
    home,
    work,
    favorites: Array.from(favoritesById.values()),
    updatedAt: Math.max(localNorm.updatedAt, remoteNorm.updatedAt),
    deletedFavoriteIds: mergedDeletedFavorites,
  };
}

function mergeContactsSnapshots(
  local: ContactsSnapshotData,
  remote: ContactsSnapshotData
): ContactsSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedContactIds),
    normalizeDeletionMarkerMap(remote.deletedContactIds)
  );
  return {
    contacts: mergeItemsByIdPreferNewer(
      local.contacts,
      normalizeContacts(remote.contacts),
      mergedDeleted
    ),
    myContactId: local.myContactId ?? remote.myContactId,
    deletedContactIds: mergedDeleted,
  };
}

function mergeSongsSnapshots(
  local: SongsSnapshotData,
  remote: SongsSnapshotData
): SongsSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedTrackIds),
    normalizeDeletionMarkerMap(remote.deletedTrackIds)
  );
  return {
    tracks: normalizeSongsTrackOrder(
      mergeItemsById(
        filterDeletedIds(local.tracks, mergedDeleted, (t) => t.id),
        filterDeletedIds(remote.tracks, mergedDeleted, (t) => t.id)
      )
    ),
    libraryState: local.libraryState === "loaded" || remote.libraryState === "loaded"
      ? "loaded"
      : local.libraryState,
    lastKnownVersion: Math.max(local.lastKnownVersion, remote.lastKnownVersion),
    deletedTrackIds: mergedDeleted,
  };
}

function mergeVideosSnapshots(
  local: VideosSnapshotData,
  remote: VideosSnapshotData
): VideosSnapshotData {
  return {
    videos: mergeItemsById(local.videos, remote.videos),
  };
}

function mergeTvSnapshots(
  local: TvSnapshotData,
  remote: TvSnapshotData
): TvSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedCustomChannelIds),
    normalizeDeletionMarkerMap(remote.deletedCustomChannelIds)
  );
  const localHiddenUpdatedAt = parseSyncTimestamp(
    local.hiddenDefaultChannelIdsUpdatedAt
  );
  const remoteHiddenUpdatedAt = parseSyncTimestamp(
    remote.hiddenDefaultChannelIdsUpdatedAt
  );
  const localResetAt = parseSyncTimestamp(local.hiddenDefaultChannelIdsResetAt);
  const remoteResetAt = parseSyncTimestamp(remote.hiddenDefaultChannelIdsResetAt);
  const hiddenDefaultChannelIds =
    localResetAt > remoteHiddenUpdatedAt && localResetAt >= remoteResetAt
      ? local.hiddenDefaultChannelIds || []
      : remoteResetAt > localHiddenUpdatedAt && remoteResetAt > localResetAt
        ? remote.hiddenDefaultChannelIds || []
        : Array.from(
            new Set([
              ...(local.hiddenDefaultChannelIds || []),
              ...(remote.hiddenDefaultChannelIds || []),
            ])
          );
  const hiddenDefaultChannelIdsUpdatedAt =
    localHiddenUpdatedAt >= remoteHiddenUpdatedAt
      ? local.hiddenDefaultChannelIdsUpdatedAt ?? null
      : remote.hiddenDefaultChannelIdsUpdatedAt ?? null;
  const hiddenDefaultChannelIdsResetAt =
    localResetAt >= remoteResetAt
      ? local.hiddenDefaultChannelIdsResetAt ?? null
      : remote.hiddenDefaultChannelIdsResetAt ?? null;
  return {
    customChannels: mergeItemsById(
      filterDeletedIds(local.customChannels || [], mergedDeleted, (channel) => channel.id),
      filterDeletedIds(remote.customChannels || [], mergedDeleted, (channel) => channel.id)
    ),
    hiddenDefaultChannelIds,
    hiddenDefaultChannelIdsUpdatedAt,
    hiddenDefaultChannelIdsResetAt,
    deletedCustomChannelIds: mergedDeleted,
    lcdFilterOn: local.lcdFilterOn,
    closedCaptionsOn: local.closedCaptionsOn,
  };
}

function mergeRedisStateConflict(
  domain: RedisSyncDomain,
  localData: AnySnapshotData,
  remoteData: AnySnapshotData,
  remoteUpdatedAt: string
): AnySnapshotData | null {
  switch (domain) {
    case "settings":
      return mergeSettingsSnapshotData(
        localData as SettingsSnapshotData,
        remoteData as SettingsSnapshotData,
        null,
        remoteUpdatedAt
      );
    case "files-metadata":
      return mergeFilesMetadataSnapshots(
        localData as FilesMetadataSnapshotData,
        remoteData as FilesMetadataSnapshotData
      );
    case "stickies":
      return mergeStickiesSnapshots(
        localData as StickiesSnapshotData,
        remoteData as StickiesSnapshotData
      );
    case "calendar":
      return mergeCalendarSnapshots(
        localData as CalendarSnapshotData,
        remoteData as CalendarSnapshotData
      );
    case "contacts":
      return mergeContactsSnapshots(
        localData as ContactsSnapshotData,
        remoteData as ContactsSnapshotData
      );
    case "maps":
      return mergeMapsSnapshots(
        localData as MapsSnapshotData,
        remoteData as MapsSnapshotData
      );
    case "songs":
      return mergeSongsSnapshots(
        localData as SongsSnapshotData,
        remoteData as SongsSnapshotData
      );
    case "videos":
      return mergeVideosSnapshots(
        localData as VideosSnapshotData,
        remoteData as VideosSnapshotData
      );
    case "tv":
      return mergeTvSnapshots(
        localData as TvSnapshotData,
        remoteData as TvSnapshotData
      );
    default:
      return null;
  }
}

function normalizeRemoteFilesMetadataSnapshot(
  data: unknown
): FilesMetadataSyncSnapshot {
  if (!data || typeof data !== "object") {
    return {
      items: {},
      libraryState: "uninitialized",
      documents: [],
      deletedPaths: {},
    };
  }
  const d = data as Record<string, unknown>;
  return {
    items: (d.items as Record<string, FileSystemItem>) || {},
    libraryState:
      (d.libraryState as FilesMetadataSyncSnapshot["libraryState"]) ||
      "uninitialized",
    documents: Array.isArray(d.documents)
      ? (d.documents as FilesMetadataSyncSnapshot["documents"])
      : [],
    deletedPaths: (d.deletedPaths as FilesMetadataSyncSnapshot["deletedPaths"]) || {},
  };
}

async function prepareFilesMetadataDomainWrite(
  _auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const domain = "files-metadata" as const;
  const filesState = useFilesStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, _auth);

  if (!remoteSnapshot?.data) {
    const envelope = await createCloudSyncEnvelope(domain, providedDb);
    const data = envelope.data;
    const baseMetadata = useCloudSyncStore.getState().remoteMetadata[domain];
    return {
      domain,
      payload: {
        domain,
        data,
        updatedAt: envelope.updatedAt,
        version: envelope.version,
        syncVersion: createWriteSyncVersion(domain, baseMetadata),
      },
      onCommitted: async (metadata) => {
        cacheRedisStateDomainSnapshot(domain, _auth, {
          data,
          metadata,
        });
      },
    };
  }

  const remoteData = normalizeRemoteFilesMetadataSnapshot(remoteSnapshot.data);
  const localSnapshotMinimal: FilesMetadataSyncSnapshot = {
    items: filesState.items,
    libraryState: filesState.libraryState,
    documents: [],
    deletedPaths: deletionMarkers.fileMetadataPaths,
  };

  const docKeys = getLocalDocumentKeysRequiredForFilesMetadataMerge(
    localSnapshotMinimal,
    remoteData
  );

  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  let merged: FilesMetadataSnapshotData;
  try {
    const localDocs = await readAndSerializeStoreItemsByKeys(
      db,
      STORES.DOCUMENTS,
      docKeys
    );
    const localSnapshot: FilesMetadataSyncSnapshot = {
      ...localSnapshotMinimal,
      documents: localDocs,
    };
    merged = mergeFilesMetadataSnapshots(localSnapshot, remoteData);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }

  const patch = buildFilesMetadataRedisPatch(
    merged,
    remoteData,
    remoteSnapshot.metadata.updatedAt
  );

  if (!patch) {
    return {
      domain,
      skipRemoteWrite: true,
      committedMetadataFallback: remoteSnapshot.metadata,
      payload: {},
      onCommitted: async (metadata) => {
        cacheRedisStateDomainSnapshot(domain, _auth, {
          data: merged,
          metadata,
        });
      },
    };
  }

  const updatedAt = new Date().toISOString();
  return {
    domain,
    payload: {
      domain,
      data: patch,
      updatedAt,
      version: AUTO_SYNC_SNAPSHOT_VERSION,
      syncVersion: createWriteSyncVersion(domain, remoteSnapshot.metadata),
    },
    onCommitted: async (metadata) => {
      cacheRedisStateDomainSnapshot(domain, _auth, {
        data: merged,
        metadata,
      });
    },
  };
}

export type CloudSyncRedisUploadOptions = {
  forceFullSettingsUpload?: boolean;
};

async function prepareSettingsDomainWrite(
  _auth: AuthContext,
  uploadOptions?: CloudSyncRedisUploadOptions
): Promise<PreparedCloudSyncDomainWrite> {
  const domain = "settings" as const;
  const L = serializeSettingsSnapshot();
  const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, _auth);
  const baseMetadata = useCloudSyncStore.getState().remoteMetadata[domain];

  if (!remoteSnapshot?.data || uploadOptions?.forceFullSettingsUpload) {
    let data: SettingsSnapshotData = L;
    if (remoteSnapshot?.data) {
      data = mergeSettingsSnapshotData(
        L,
        remoteSnapshot.data as SettingsSnapshotData,
        null,
        remoteSnapshot.metadata.updatedAt
      );
    }
    const updatedAt = new Date().toISOString();
    return {
      domain,
      payload: {
        domain,
        data,
        updatedAt,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        syncVersion: createWriteSyncVersion(domain, baseMetadata),
      },
      onCommitted: async (metadata) => {
        cacheRedisStateDomainSnapshot(domain, _auth, { data, metadata });
        await applyResolvedRedisUploadLocally(domain, data, metadata.updatedAt);
      },
    };
  }

  const R = remoteSnapshot.data as SettingsSnapshotData;
  const dirtySections = getSettingsSectionsToPatchUpload(L, R);
  if (dirtySections.length === 0) {
    const merged = mergeSettingsSnapshotData(
      L,
      R,
      null,
      remoteSnapshot.metadata.updatedAt
    );
    return {
      domain,
      skipRemoteWrite: true,
      committedMetadataFallback: remoteSnapshot.metadata,
      payload: {},
      onCommitted: async (metadata) => {
        cacheRedisStateDomainSnapshot(domain, _auth, {
          data: merged,
          metadata,
        });
      },
    };
  }

  const patch = buildSettingsRedisPatch(
    L,
    dirtySections,
    remoteSnapshot.metadata.updatedAt
  );
  if (!patch) {
    const merged = mergeSettingsSnapshotData(
      L,
      R,
      null,
      remoteSnapshot.metadata.updatedAt
    );
    return {
      domain,
      skipRemoteWrite: true,
      committedMetadataFallback: remoteSnapshot.metadata,
      payload: {},
      onCommitted: async (metadata) => {
        cacheRedisStateDomainSnapshot(domain, _auth, {
          data: merged,
          metadata,
        });
      },
    };
  }

  const mergedAfter = applySettingsRedisPatch(
    normalizeSettingsSnapshotData(R, remoteSnapshot.metadata.updatedAt),
    patch
  );
  const updatedAt = new Date().toISOString();

  return {
    domain,
    payload: {
      domain,
      data: patch,
      updatedAt,
      version: AUTO_SYNC_SNAPSHOT_VERSION,
      syncVersion: createWriteSyncVersion(domain, remoteSnapshot.metadata),
    },
    onCommitted: async (metadata) => {
      cacheRedisStateDomainSnapshot(domain, _auth, {
        data: mergedAfter,
        metadata,
      });
      await applyResolvedRedisUploadLocally(
        domain,
        mergedAfter,
        metadata.updatedAt
      );
    },
  };
}

async function prepareRedisStateDomainWrite(
  domain: RedisSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase,
  uploadOptions?: CloudSyncRedisUploadOptions
): Promise<PreparedCloudSyncDomainWrite> {
  if (domain === "files-metadata") {
    return prepareFilesMetadataDomainWrite(_auth, providedDb);
  }
  if (domain === "settings") {
    return prepareSettingsDomainWrite(_auth, uploadOptions);
  }

  const envelope = await createCloudSyncEnvelope(domain, providedDb);
  let data = envelope.data;
  let baseMetadata = useCloudSyncStore.getState().remoteMetadata[domain];

  const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, _auth);
  if (remoteSnapshot?.data) {
    const merged = mergeRedisStateConflict(
      domain,
      envelope.data,
      remoteSnapshot.data,
      remoteSnapshot.metadata.updatedAt
    );
    if (merged) {
      data = merged;
      baseMetadata = remoteSnapshot.metadata;
    }
  }

  return {
    domain,
    payload: {
      domain,
      data,
      updatedAt: envelope.updatedAt,
      version: envelope.version,
      syncVersion: createWriteSyncVersion(domain, baseMetadata),
    },
    onCommitted: async (metadata) => {
      cacheRedisStateDomainSnapshot(domain, _auth, {
        data,
        metadata,
      });
      await applyResolvedRedisUploadLocally(domain, data, metadata.updatedAt);
    },
  };
}

export async function applyResolvedRedisUploadLocally(
  domain: RedisSyncDomain,
  data: AnySnapshotData,
  updatedAt: string
): Promise<void> {
  if (domain === "settings") {
    await applySettingsSnapshot(data as SettingsSnapshotData, updatedAt);
  } else if (domain === "tv") {
    beginApplyingRemoteDomain(domain);
    try {
      applyTvSnapshot(data as TvSnapshotData);
    } finally {
      endApplyingRemoteDomain(domain);
    }
  }
}

async function fetchRedisStateDomainSnapshot(
  domain: RedisSyncDomain,
  _auth: AuthContext
): Promise<RedisStateDomainSnapshot | null> {
  return redisStateDomainSnapshotCache.get(
    getDomainFetchCacheKey(_auth, domain),
    async () => {
      const result = await fetchRedisDomainSnapshot(domain);
      if (!result) {
        return null;
      }

      return {
        data: result.data as AnySnapshotData,
        metadata: result.metadata,
      };
    }
  );
}

async function fetchBlobDomainInfo(
  domain: BlobSyncDomain,
  _auth: AuthContext
): Promise<BlobDomainInfoResponse | null> {
  return blobDomainInfoCache.get(
    getDomainFetchCacheKey(_auth, domain),
    async () => (await fetchBlobDomainPayload(domain)) as BlobDomainInfoResponse | null
  );
}

async function downloadGzipJson<T>(downloadUrl: string): Promise<T> {
  const blobResponse = await fetch(downloadUrl);
  if (!blobResponse.ok) {
    throw new Error(`Failed to fetch sync blob from CDN: ${blobResponse.status}`);
  }

  const compressedBuf = await blobResponse.arrayBuffer();
  const compressedBlob = new Blob([compressedBuf], { type: "application/gzip" });
  const decompressedStream = compressedBlob
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const jsonString = await new Response(decompressedStream).text();
  return JSON.parse(jsonString) as T;
}

async function uploadMonolithicBlobDomain(
  domain: BlobSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const envelope = await createCloudSyncEnvelope(domain, providedDb);
  const remoteInfo = await fetchBlobDomainInfo(domain, _auth).catch(() => null);
  const dataItems = Array.isArray(envelope.data) ? envelope.data.length : "N/A";
  console.log(`[CloudSync:blob] ${domain}: serialized ${dataItems} items`);
  const compressed = await gzipJson(envelope);
  console.log(`[CloudSync:blob] ${domain}: compressed to ${compressed.length} bytes`);

  const uploadInstruction = await requestBlobUploadInstructionFromTransport(domain);
  const uploadResult = await uploadBlobWithStorageInstruction(
    new Blob([compressed], { type: "application/gzip" }),
    uploadInstruction
  );

  return {
    domain,
    payload: {
      domain,
      storageUrl: uploadResult.storageUrl,
      updatedAt: envelope.updatedAt,
      version: envelope.version,
      totalSize: compressed.length,
      syncVersion: createWriteSyncVersion(
        domain,
        remoteInfo?.metadata || useCloudSyncStore.getState().remoteMetadata[domain]
      ),
    },
  };
}

async function uploadIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const updatedAt = new Date().toISOString();
  const localRecords = await serializeIndividualBlobDomainRecords(domain, providedDb);
  const deletedItems = pruneDeletedKeysForExistingRecords(domain, localRecords);
  const knownItems = getIndividualBlobKnownItems(domain);
  const remoteInfo = await fetchBlobDomainInfo(domain, _auth);
  const remoteItems =
    remoteInfo?.mode === "individual" ? remoteInfo.items || {} : {};
  const uploadPlan = planIndividualBlobUpload(
    localRecords,
    remoteItems,
    knownItems,
    deletedItems
  );
  const nextItems: Record<
    string,
    {
      updatedAt: string;
      signature: string;
      size: number;
      storageUrl: string;
    }
  > = {};
  let uploadedCount = 0;
  const nextKnownItems = {
    ...uploadPlan.nextKnownItems,
  };

  for (const [key, item] of Object.entries(uploadPlan.preservedRemoteItems)) {
    nextItems[key] = {
      updatedAt: item.updatedAt,
      signature: item.signature,
      size: item.size,
      storageUrl: item.storageUrl,
    };
  }

  for (const record of uploadPlan.itemsToUpload) {
    const uploadInstruction = await requestBlobUploadInstructionFromTransport(
      domain,
      record.item.key
    );
    const itemEnvelope: BlobSyncItemEnvelope = {
      domain,
      key: record.item.key,
      version: AUTO_SYNC_SNAPSHOT_VERSION,
      updatedAt,
      data: record.item,
    };
    const compressed = await gzipJson(itemEnvelope);
    const uploadResult = await uploadBlobWithStorageInstruction(
      new Blob([compressed], { type: "application/gzip" }),
      uploadInstruction
    );

    nextItems[record.item.key] = {
      updatedAt,
      signature: record.signature,
      size: compressed.length,
      storageUrl: uploadResult.storageUrl,
    };
    nextKnownItems[record.item.key] = {
      signature: record.signature,
      updatedAt,
    };
    uploadedCount += 1;
  }

  console.log(
    `[CloudSync:blob] ${domain}: uploaded ${uploadedCount}/${uploadPlan.itemsToUpload.length} individual items`
  );
  return {
    domain,
    payload: {
      domain,
      updatedAt,
      version: AUTO_SYNC_SNAPSHOT_VERSION,
      totalSize: Object.values(nextItems).reduce((sum, item) => sum + item.size, 0),
      items: nextItems,
      deletedItems,
      syncVersion: createWriteSyncVersion(
        domain,
        remoteInfo?.metadata || useCloudSyncStore.getState().remoteMetadata[domain]
      ),
    },
    onCommitted: async () => {
      setIndividualBlobKnownItems(domain, nextKnownItems);
    },
  };
}

export async function prepareCloudSyncDomainWrite(
  domain: CloudSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase,
  uploadOptions?: CloudSyncRedisUploadOptions
): Promise<PreparedCloudSyncDomainWrite> {
  if (isRedisSyncDomain(domain)) {
    return prepareRedisStateDomainWrite(domain, _auth, providedDb, uploadOptions);
  }
  if (isBlobSyncDomain(domain)) {
    return isIndividualBlobSyncDomain(domain)
      ? uploadIndividualBlobDomain(domain, _auth, providedDb)
      : uploadMonolithicBlobDomain(domain, _auth, providedDb);
  }
  throw new Error(`Unknown sync domain: ${domain}`);
}

export async function applyDownloadedCloudSyncDomainPayload(
  domain: CloudSyncDomain,
  payload: CloudSyncDomainDownloadPayload,
  options?: DownloadCloudSyncOptions
): Promise<DownloadCloudSyncResult> {
  if (options?.shouldApply && !options.shouldApply(payload.metadata)) {
    return {
      metadata: payload.metadata,
      applied: false,
    };
  }

  if (isRedisSyncDomain(domain)) {
    const redisPayload = payload as RedisStateDomainDownloadPayload;
    const envelope: CloudSyncEnvelope<AnySnapshotData> = {
      domain,
      version: redisPayload.metadata.version,
      updatedAt: redisPayload.metadata.updatedAt,
      data: redisPayload.data as AnySnapshotData,
    };

    await applyCloudSyncEnvelope(envelope, options?.db);
    return {
      metadata: redisPayload.metadata,
      applied: true,
    };
  }

  if (!isBlobSyncDomain(domain)) {
    throw new Error(`Unknown sync domain: ${domain}`);
  }

  const data =
    payload as BlobMonolithicDomainDownloadPayload | BlobIndividualDomainDownloadPayload;

  if (isIndividualBlobSyncDomain(domain) && "mode" in data && data.mode === "individual") {
    const remoteItems = data.items || {};
    const remoteDeletedItems = normalizeDeletionMarkerMap(data.deletedItems);
    const localDeletedItems = getIndividualBlobDeletedKeys(domain);
    const effectiveDeletedItems = mergeDeletionMarkerMaps(
      localDeletedItems,
      remoteDeletedItems
    );
    const localRecords = await serializeIndividualBlobDomainRecords(
      domain,
      options?.db
    );
    const knownItems = getIndividualBlobKnownItems(domain);
    const changedItems: Record<string, StoreItemWithKey> = {};
    const downloadPlan = planIndividualBlobDownload(
      localRecords,
      remoteItems,
      knownItems,
      effectiveDeletedItems
    );

    useCloudSyncStore
      .getState()
      .mergeDeletedKeys(getIndividualBlobDeletionBucket(domain), remoteDeletedItems);

    for (const itemKey of downloadPlan.itemKeysToDownload) {
      const itemMetadata = remoteItems[itemKey];
      const itemEnvelope = await downloadGzipJson<BlobSyncItemEnvelope>(
        itemMetadata.downloadUrl
      );
      changedItems[itemKey] = itemEnvelope.data;
    }

    const nextKnownItems = {
      ...downloadPlan.nextKnownItems,
    };
    for (const itemKey of downloadPlan.itemKeysToDownload) {
      nextKnownItems[itemKey] = {
        signature: remoteItems[itemKey].signature,
        updatedAt: remoteItems[itemKey].updatedAt,
      };
    }

    beginApplyingRemoteDomain(domain);
    try {
      await applyIndividualBlobDomain(
        domain,
        downloadPlan.keysToDelete,
        changedItems,
        effectiveDeletedItems,
        options?.db
      );
      setIndividualBlobKnownItems(domain, nextKnownItems);
    } finally {
      endApplyingRemoteDomain(domain);
    }
    return {
      metadata: data.metadata,
      applied: true,
    };
  }

  const monolithicData = data as BlobMonolithicDomainDownloadPayload;
  const downloadUrl = monolithicData.downloadUrl || monolithicData.blobUrl;
  if (!downloadUrl) {
    throw new Error("Sync download response was invalid.");
  }

  const envelope = await downloadGzipJson<CloudSyncEnvelope<AnySnapshotData>>(downloadUrl);
  await applyCloudSyncEnvelope(envelope, options?.db);
  return {
    metadata: data.metadata,
    applied: true,
  };
}

/**
 * True when local IndexedDB is out of sync with the remote per-item manifest:
 * missing blob downloads or local orphans to remove, even if domain
 * `updatedAt` / server version already match (so {@link shouldApplyRemoteUpdate}
 * would be false). Covers partial storage clears and settings applied before
 * wallpaper blobs finished downloading.
 */
export async function individualBlobDomainNeedsLocalReconcile(
  domain: IndividualBlobSyncDomain,
  auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<boolean> {
  const data = await fetchBlobDomainInfo(domain, auth);
  if (!data?.metadata || data.mode !== "individual") {
    return false;
  }
  const reconcileCacheKey = `${getDomainFetchCacheKey(
    auth,
    domain
  )}:${data.metadata.updatedAt}:${data.metadata.syncVersion?.serverVersion || 0}`;

  return individualBlobReconcileCache.get(reconcileCacheKey, async () => {
    const remoteItems = data.items || {};
    const remoteDeletedItems = normalizeDeletionMarkerMap(data.deletedItems);
    const localDeletedItems = getIndividualBlobDeletedKeys(domain);
    const effectiveDeletedItems = mergeDeletionMarkerMaps(
      localDeletedItems,
      remoteDeletedItems
    );
    const localRecords = await serializeIndividualBlobDomainRecords(
      domain,
      providedDb
    );
    const knownItems = getIndividualBlobKnownItems(domain);
    const plan = planIndividualBlobDownload(
      localRecords,
      remoteItems,
      knownItems,
      effectiveDeletedItems
    );
    return plan.itemKeysToDownload.length > 0 || plan.keysToDelete.length > 0;
  });
}

