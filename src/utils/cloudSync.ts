import { abortableFetch } from "@/utils/abortableFetch";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import { getApiUrl } from "@/utils/platform";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { useVideoStore, type Video } from "@/stores/useVideoStore";
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
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { Contact } from "@/utils/contacts";
import { normalizeContacts } from "@/utils/contacts";
import {
  uploadBlobWithStorageInstruction,
  type StorageUploadInstruction,
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
} from "@/utils/cloudSyncClientState";
import type { CloudSyncWriteVersion } from "@/utils/cloudSyncVersion";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  mergeFilesMetadataSnapshots,
  type FilesMetadataSyncSnapshot,
} from "@/utils/cloudSyncFileMerge";
import {
  beginApplyingRemoteSettingsSections,
  endApplyingRemoteSettingsSections,
  getSettingsSectionTimestampMap,
  setSettingsSectionTimestamps,
  type SettingsSyncSection,
} from "@/utils/cloudSyncSettingsState";
import {
  getRemoteSettingsSectionsToApply,
  mergeSettingsSnapshotData,
  normalizeSettingsSnapshotData,
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
type AuthContext = {
  username: string;
  isAuthenticated: boolean;
};

let _syncSessionId: string | null = null;

/** Stable per-tab identifier used to skip self-originated realtime events. */
export function getSyncSessionId(): string {
  if (!_syncSessionId) {
    _syncSessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return _syncSessionId;
}

interface StoreItem {
  [key: string]: unknown;
}

interface StoreItemWithKey {
  key: string;
  value: StoreItem;
}

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

interface VideosSnapshotData {
  videos: Video[];
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

type AnySnapshotData =
  | SettingsSnapshotData
  | FilesMetadataSnapshotData
  | FilesStoreSnapshotData
  | SongsSnapshotData
  | VideosSnapshotData
  | StickiesSnapshotData
  | CalendarSnapshotData
  | ContactsSnapshotData
  | CustomWallpapersSnapshotData;

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

export interface DownloadCloudSyncResult {
  metadata: CloudSyncDomainMetadata;
  applied: boolean;
}

interface DownloadCloudSyncOptions {
  shouldApply?: (metadata: CloudSyncDomainMetadata) => boolean;
}

function assertCompressionSupport(): void {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  ) {
    throw new Error("Cloud sync requires browser compression support.");
  }
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to serialize blob"));
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const array = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([array], { type: mime });
};

async function computeSyncSignature(value: unknown): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function readStoreItems(
  db: IDBDatabase,
  storeName: string
): Promise<StoreItemWithKey[]> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const items: StoreItemWithKey[] = [];
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          items.push({
            key: cursor.key as string,
            value: cursor.value as StoreItem,
          });
          cursor.continue();
          return;
        }

        resolve(items);
      };

      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

async function serializeStoreItem(item: StoreItemWithKey): Promise<StoreItemWithKey> {
  const serializedValue: Record<string, unknown> = {
    ...item.value,
  };

  for (const key of Object.keys(item.value)) {
    if (item.value[key] instanceof Blob) {
      serializedValue[key] = await blobToBase64(item.value[key] as Blob);
      serializedValue[`_isBlob_${key}`] = true;
    }
  }

  return {
    key: item.key,
    value: serializedValue,
  };
}

async function serializeStoreItems(
  items: StoreItemWithKey[]
): Promise<StoreItemWithKey[]> {
  return Promise.all(items.map((item) => serializeStoreItem(item)));
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

function deserializeStoreItem(item: StoreItemWithKey): Record<string, unknown> {
  const restoredValue: Record<string, unknown> = {
    ...item.value,
  };

  for (const key of Object.keys(item.value)) {
    const isBlobKey = `_isBlob_${key}`;
    if (item.value[isBlobKey] === true && typeof item.value[key] === "string") {
      restoredValue[key] = base64ToBlob(item.value[key] as string);
      delete restoredValue[isBlobKey];
    }
  }

  return restoredValue;
}

async function restoreStoreItems(
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

    const clearRequest = store.clear();

    clearRequest.onsuccess = () => {
      try {
        for (const item of items) {
          store.put(deserializeStoreItem(item), item.key);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };

    clearRequest.onerror = () => reject(clearRequest.error);
  });
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
      lyricsTranslationLanguage: ipodState.lyricsTranslationLanguage,
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

async function serializeCustomWallpapersSnapshot(): Promise<CustomWallpapersSnapshotData> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await serializeStoreItems(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    db.close();
  }
}

async function serializeCustomWallpapersRecords(): Promise<SerializedStoreItemRecord[]> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await serializeStoreItemRecords(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    db.close();
  }
}

async function serializeIndexedDbStoreSnapshot(
  storeName: string
): Promise<FilesStoreSnapshotData> {
  const db = await ensureIndexedDBInitialized();

  try {
    const items = await readStoreItems(db, storeName);
    return await serializeStoreItems(items);
  } finally {
    db.close();
  }
}

async function serializeIndexedDbStoreRecords(
  storeName: string
): Promise<SerializedStoreItemRecord[]> {
  const db = await ensureIndexedDBInitialized();

  try {
    return await serializeStoreItemRecords(await readStoreItems(db, storeName));
  } finally {
    db.close();
  }
}

function getIndividualBlobStoreName(domain: IndividualBlobSyncDomain): string {
  switch (domain) {
    case "files-images":
      return STORES.IMAGES;
    case "custom-wallpapers":
      return STORES.CUSTOM_WALLPAPERS;
  }
}

function getIndividualBlobDeletedKeys(
  domain: IndividualBlobSyncDomain
): DeletionMarkerMap {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  switch (domain) {
    case "custom-wallpapers":
      return deletionMarkers.customWallpaperKeys;
    case "files-images":
      return {};
  }
}

async function serializeIndividualBlobDomainRecords(
  domain: IndividualBlobSyncDomain
): Promise<SerializedStoreItemRecord[]> {
  switch (domain) {
    case "custom-wallpapers":
      return serializeCustomWallpapersRecords();
    case "files-images":
      return serializeIndexedDbStoreRecords(STORES.IMAGES);
  }
}

async function serializeFilesMetadataSnapshot(): Promise<FilesMetadataSnapshotData> {
  const filesState = useFilesStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    items: filesState.items,
    libraryState: filesState.libraryState,
    documents: await serializeIndexedDbStoreSnapshot(STORES.DOCUMENTS),
    deletedPaths: deletionMarkers.fileMetadataPaths,
  };
}

function serializeSongsSnapshot(): SongsSnapshotData {
  const ipodState = useIpodStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    tracks: ipodState.tracks,
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

export async function createCloudSyncEnvelope(
  domain: CloudSyncDomain
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
        data: await serializeFilesMetadataSnapshot(),
      };
    case "files-images":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.IMAGES),
      };
    case "files-trash":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.TRASH),
      };
    case "files-applets":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.APPLETS),
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
    case "custom-wallpapers":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeCustomWallpapersSnapshot(),
      };
  }
}

async function applySettingsSnapshot(
  data: SettingsSnapshotData,
  fallbackUpdatedAt: string
): Promise<void> {
  const normalizedData = normalizeSettingsSnapshotData(data, fallbackUpdatedAt);
  const remoteSectionUpdatedAt = normalizedData.sectionUpdatedAt || {};
  const localSectionUpdatedAt = getSettingsSectionTimestampMap();
  const sectionsToApply = getRemoteSettingsSectionsToApply(
    localSectionUpdatedAt,
    remoteSectionUpdatedAt
  );

  // Legacy: if the old settings envelope contained customWallpapers, restore them
  if (normalizedData.customWallpapers && normalizedData.customWallpapers.length > 0) {
    const db = await ensureIndexedDBInitialized();
    try {
      await restoreStoreItems(db, STORES.CUSTOM_WALLPAPERS, normalizedData.customWallpapers);
    } finally {
      db.close();
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
        useIpodStore.setState({
          displayMode: normalizedData.ipod.displayMode,
          showLyrics: normalizedData.ipod.showLyrics,
          lyricsAlignment: normalizedData.ipod.lyricsAlignment,
          lyricsFont: normalizedData.ipod.lyricsFont,
          romanization: normalizedData.ipod.romanization,
          lyricsTranslationLanguage: normalizedData.ipod.lyricsTranslationLanguage,
          theme: normalizedData.ipod.theme,
          lcdFilterOn: normalizedData.ipod.lcdFilterOn,
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
  data: FilesStoreSnapshotData
): Promise<void> {
  const db = await ensureIndexedDBInitialized();

  try {
    await restoreStoreItems(db, storeName, data);
  } finally {
    db.close();
  }
}

async function applyFilesMetadataSnapshot(
  data: FilesMetadataSnapshotData
): Promise<void> {
  const remoteDeletedPaths = normalizeDeletionMarkerMap(data.deletedPaths);
  const cloudSyncState = useCloudSyncStore.getState();
  const localDeletedPaths = cloudSyncState.deletionMarkers.fileMetadataPaths;
  const localSnapshot: FilesMetadataSyncSnapshot = {
    items: useFilesStore.getState().items,
    libraryState: useFilesStore.getState().libraryState,
    documents: await serializeIndexedDbStoreSnapshot(STORES.DOCUMENTS),
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
    mergedSnapshot.documents || []
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
    tracks: filterDeletedIds(data.tracks, effectiveDeletedTrackIds, (track) => track.id),
    libraryState: data.libraryState,
    lastKnownVersion: data.lastKnownVersion,
  });
}

function applyVideosSnapshot(data: VideosSnapshotData): void {
  useVideoStore.setState({
    videos: data.videos,
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

async function applyCustomWallpapersSnapshot(
  data: CustomWallpapersSnapshotData
): Promise<void> {
  const deletedKeys = useCloudSyncStore.getState().deletionMarkers.customWallpaperKeys;
  const filteredData = data.filter((item) => !deletedKeys[item.key]);
  console.log(
    `[CloudSync] applyCustomWallpapersSnapshot: replacing with ${filteredData.length} items`
  );
  const db = await ensureIndexedDBInitialized();
  try {
    await restoreStoreItems(db, STORES.CUSTOM_WALLPAPERS, filteredData);
  } finally {
    db.close();
  }

  await finalizeCustomWallpaperSync(filteredData.map((item) => item.key));
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
        currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
        wallpaperSource: "/wallpapers/photos/aqua/water.jpg",
      });
    }
  }

  displayStore.bumpCustomWallpapersRevision();
}

async function applyIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  keysToDelete: string[],
  changedItems: Record<string, StoreItemWithKey>,
  deletedKeys: DeletionMarkerMap = {}
): Promise<void> {
  const storeName = getIndividualBlobStoreName(domain);
  const db = await ensureIndexedDBInitialized();
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
    db.close();
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

export async function applyCloudSyncEnvelope(
  envelope: CloudSyncEnvelope<AnySnapshotData>
): Promise<void> {
  switch (envelope.domain) {
    case "settings":
      await applySettingsSnapshot(
        envelope.data as SettingsSnapshotData,
        envelope.updatedAt
      );
      return;
    case "files-metadata":
      await applyFilesMetadataSnapshot(
        envelope.data as FilesMetadataSnapshotData
      );
      return;
    case "files-images":
      await applyIndexedDbStoreSnapshot(
        STORES.IMAGES,
        envelope.data as FilesStoreSnapshotData
      );
      return;
    case "files-trash":
      await applyIndexedDbStoreSnapshot(
        STORES.TRASH,
        envelope.data as FilesStoreSnapshotData
      );
      return;
    case "files-applets":
      await applyIndexedDbStoreSnapshot(
        STORES.APPLETS,
        envelope.data as FilesStoreSnapshotData
      );
      return;
    case "songs":
      applySongsSnapshot(envelope.data as SongsSnapshotData);
      return;
    case "videos":
      applyVideosSnapshot(envelope.data as VideosSnapshotData);
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
    case "custom-wallpapers":
      await applyCustomWallpapersSnapshot(
        envelope.data as CustomWallpapersSnapshotData
      );
      return;
  }
}

function authHeaders(): Record<string, string> {
  return {
    "X-Sync-Session-Id": getSyncSessionId(),
  };
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

export async function fetchCloudSyncMetadata(
  _auth: AuthContext
): Promise<CloudSyncMetadataMap> {
  const [blobRes, redisRes] = await Promise.all([
    abortableFetch(getApiUrl("/api/sync/auto"), {
      method: "GET",
      headers: authHeaders(),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }),
    abortableFetch(getApiUrl("/api/sync/state"), {
      method: "GET",
      headers: authHeaders(),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }),
  ]);

  const merged = createEmptyCloudSyncMetadataMap();

  if (blobRes.ok) {
    const blobData = (await blobRes.json()) as { metadata?: Partial<CloudSyncMetadataMap> };
    if (blobData.metadata) {
      for (const domain of BLOB_SYNC_DOMAINS) {
        const entry = blobData.metadata[domain as keyof typeof blobData.metadata];
        if (entry) merged[domain] = entry as CloudSyncDomainMetadata;
      }
    }
  }

  if (redisRes.ok) {
    const redisData = (await redisRes.json()) as { metadata?: Partial<CloudSyncMetadataMap> };
    if (redisData.metadata) {
      for (const domain of REDIS_SYNC_DOMAINS) {
        const entry = redisData.metadata[domain as keyof typeof redisData.metadata];
        if (entry) merged[domain] = entry as CloudSyncDomainMetadata;
      }
    }
  }

  if (!blobRes.ok && !redisRes.ok) {
    throw new Error("Failed to fetch sync metadata from both endpoints");
  }

  return merged;
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
    tracks: mergeItemsById(
      filterDeletedIds(local.tracks, mergedDeleted, (t) => t.id),
      filterDeletedIds(remote.tracks, mergedDeleted, (t) => t.id)
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

function mergeRedisStateConflict(
  domain: RedisSyncDomain,
  localData: AnySnapshotData,
  remoteData: AnySnapshotData,
  localUpdatedAt: string,
  remoteUpdatedAt: string
): AnySnapshotData | null {
  switch (domain) {
    case "settings":
      return mergeSettingsSnapshotData(
        localData as SettingsSnapshotData,
        remoteData as SettingsSnapshotData,
        localUpdatedAt,
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
    default:
      return null;
  }
}

async function uploadRedisStateDomain(
  domain: RedisSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const envelope = await createCloudSyncEnvelope(domain);
  let data = envelope.data;
  let baseMetadata = useCloudSyncStore.getState().remoteMetadata[domain];

  const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, _auth);
  if (remoteSnapshot?.data) {
    const merged = mergeRedisStateConflict(
      domain,
      envelope.data,
      remoteSnapshot.data,
      envelope.updatedAt,
      remoteSnapshot.metadata.updatedAt
    );
    if (merged) {
      data = merged;
      baseMetadata = remoteSnapshot.metadata;
    }
  }

  const sendStateUpload = async (
    nextData: AnySnapshotData,
    nextUpdatedAt: string,
    nextBaseMetadata: CloudSyncDomainMetadata | null | undefined
  ) =>
    abortableFetch(getApiUrl("/api/sync/state"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        domain,
        data: nextData,
        updatedAt: nextUpdatedAt,
        version: envelope.version,
        syncVersion: createWriteSyncVersion(domain, nextBaseMetadata),
      }),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    });

  let response = await sendStateUpload(data, envelope.updatedAt, baseMetadata);

  if (response.status === 409) {
    const latestRemote = await fetchRedisStateDomainSnapshot(domain, _auth);
    if (latestRemote?.data) {
      const merged = mergeRedisStateConflict(
        domain,
        envelope.data,
        latestRemote.data,
        envelope.updatedAt,
        latestRemote.metadata.updatedAt
      );
      if (merged) {
        response = await sendStateUpload(
          merged,
          new Date().toISOString(),
          latestRemote.metadata
        );
      }
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || `Failed to sync ${domain} state`
    );
  }

  const result = (await response.json()) as { metadata?: CloudSyncDomainMetadata };
  if (!result.metadata) {
    throw new Error("State sync response was invalid.");
  }

  return result.metadata;
}

async function fetchRedisStateDomainSnapshot(
  domain: RedisSyncDomain,
  _auth: AuthContext
): Promise<
  | {
      data: AnySnapshotData;
      metadata: CloudSyncDomainMetadata;
    }
  | null
> {
  const response = await abortableFetch(
    getApiUrl(`/api/sync/state?domain=${encodeURIComponent(domain)}`),
    {
      method: "GET",
      headers: authHeaders(),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        `Failed to download ${domain} state`
    );
  }

  const result = (await response.json()) as {
    data?: unknown;
    metadata?: CloudSyncDomainMetadata;
  };

  if (result.data === undefined || !result.metadata) {
    throw new Error("State download response was invalid.");
  }

  return {
    data: result.data as AnySnapshotData,
    metadata: result.metadata,
  };
}

async function fetchBlobDomainInfo(
  domain: BlobSyncDomain,
  _auth: AuthContext
): Promise<
  | (IndividualBlobDomainResponse & {
      downloadUrl?: string;
      blobUrl?: string;
    })
  | null
> {
  const response = await abortableFetch(
    getApiUrl(`/api/sync/auto?domain=${encodeURIComponent(domain)}`),
    {
      method: "GET",
      headers: authHeaders(),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        `Failed to fetch ${domain} sync data`
    );
  }

  return (await response.json()) as IndividualBlobDomainResponse & {
    downloadUrl?: string;
    blobUrl?: string;
  };
}

async function requestBlobUploadInstruction(
  domain: BlobSyncDomain,
  _auth: AuthContext,
  itemKey?: string
): Promise<StorageUploadInstruction> {
  const tokenResponse = await abortableFetch(getApiUrl("/api/sync/auto-token"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      domain,
      ...(itemKey ? { itemKey } : {}),
    }),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || "Failed to get sync upload token"
    );
  }

  return (await tokenResponse.json()) as StorageUploadInstruction;
}

async function saveBlobDomainMetadata(
  payload: Record<string, unknown>,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const metadataResponse = await abortableFetch(getApiUrl("/api/sync/auto"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (!metadataResponse.ok) {
    const errorData = await metadataResponse.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || "Failed to save sync metadata"
    );
  }

  const metadataData = (await metadataResponse.json()) as {
    metadata?: CloudSyncDomainMetadata;
  };

  if (!metadataData.metadata) {
    throw new Error("Sync metadata save response was invalid.");
  }

  return metadataData.metadata;
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

async function uploadLegacyBlobDomain(
  domain: BlobSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const envelope = await createCloudSyncEnvelope(domain);
  const remoteInfo = await fetchBlobDomainInfo(domain, _auth).catch(() => null);
  const dataItems = Array.isArray(envelope.data) ? envelope.data.length : "N/A";
  console.log(`[CloudSync:blob] ${domain}: serialized ${dataItems} items`);
  const compressed = await gzipJson(envelope);
  console.log(`[CloudSync:blob] ${domain}: compressed to ${compressed.length} bytes`);

  const uploadInstruction = await requestBlobUploadInstruction(domain, _auth);
  const uploadResult = await uploadBlobWithStorageInstruction(
    new Blob([compressed], { type: "application/gzip" }),
    uploadInstruction
  );

  return saveBlobDomainMetadata(
    {
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
    _auth
  );
}

async function uploadIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const updatedAt = new Date().toISOString();
  const localRecords = await serializeIndividualBlobDomainRecords(domain);
  const deletedItems = getIndividualBlobDeletedKeys(domain);
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
    const uploadInstruction = await requestBlobUploadInstruction(
      domain,
      _auth,
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
  const metadata = await saveBlobDomainMetadata(
    {
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
    _auth
  );
  setIndividualBlobKnownItems(domain, nextKnownItems);
  return metadata;
}

async function uploadBlobDomain(
  domain: BlobSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  if (isIndividualBlobSyncDomain(domain)) {
    return uploadIndividualBlobDomain(domain, _auth);
  }

  return uploadLegacyBlobDomain(domain, _auth);
}

export async function uploadCloudSyncDomain(
  domain: CloudSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  if (isRedisSyncDomain(domain)) {
    return uploadRedisStateDomain(domain, _auth);
  }
  if (isBlobSyncDomain(domain)) {
    return uploadBlobDomain(domain, _auth);
  }
  throw new Error(`Unknown sync domain: ${domain}`);
}

async function downloadRedisStateDomain(
  domain: RedisSyncDomain,
  _auth: AuthContext,
  options?: DownloadCloudSyncOptions
): Promise<DownloadCloudSyncResult> {
  const result = await fetchRedisStateDomainSnapshot(domain, _auth);
  if (!result) {
    throw new Error(`No ${domain} state found`);
  }

  if (options?.shouldApply && !options.shouldApply(result.metadata)) {
    return {
      metadata: result.metadata,
      applied: false,
    };
  }

  const envelope: CloudSyncEnvelope<AnySnapshotData> = {
    domain,
    version: result.metadata.version,
    updatedAt: result.metadata.updatedAt,
    data: result.data as AnySnapshotData,
  };

  await applyCloudSyncEnvelope(envelope);
  return {
    metadata: result.metadata,
    applied: true,
  };
}

async function downloadBlobDomain(
  domain: BlobSyncDomain,
  _auth: AuthContext,
  options?: DownloadCloudSyncOptions
): Promise<DownloadCloudSyncResult> {
  const data = await fetchBlobDomainInfo(domain, _auth);
  if (!data?.metadata) {
    throw new Error("Sync download response was invalid.");
  }

  if (options?.shouldApply && !options.shouldApply(data.metadata)) {
    return {
      metadata: data.metadata,
      applied: false,
    };
  }

  if (isIndividualBlobSyncDomain(domain) && data.mode === "individual") {
    const remoteItems = data.items || {};
    const remoteDeletedItems = normalizeDeletionMarkerMap(data.deletedItems);
    const localDeletedItems = getIndividualBlobDeletedKeys(domain);
    const effectiveDeletedItems = mergeDeletionMarkerMaps(
      localDeletedItems,
      remoteDeletedItems
    );
    const localRecords = await serializeIndividualBlobDomainRecords(domain);
    const knownItems = getIndividualBlobKnownItems(domain);
    const changedItems: Record<string, StoreItemWithKey> = {};
    const downloadPlan = planIndividualBlobDownload(
      localRecords,
      remoteItems,
      knownItems,
      effectiveDeletedItems
    );

    if (domain === "custom-wallpapers") {
      useCloudSyncStore
        .getState()
        .mergeDeletedKeys("customWallpaperKeys", remoteDeletedItems);
    }

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

    await applyIndividualBlobDomain(
      domain,
      downloadPlan.keysToDelete,
      changedItems,
      effectiveDeletedItems
    );
    setIndividualBlobKnownItems(domain, nextKnownItems);
    return {
      metadata: data.metadata,
      applied: true,
    };
  }

  const downloadUrl = data.downloadUrl || data.blobUrl;
  if (!downloadUrl) {
    throw new Error("Sync download response was invalid.");
  }

  const envelope = await downloadGzipJson<CloudSyncEnvelope<AnySnapshotData>>(downloadUrl);
  await applyCloudSyncEnvelope(envelope);
  return {
    metadata: data.metadata,
    applied: true,
  };
}

export async function downloadAndApplyCloudSyncDomain(
  domain: CloudSyncDomain,
  _auth: AuthContext,
  options?: DownloadCloudSyncOptions
): Promise<DownloadCloudSyncResult> {
  if (isRedisSyncDomain(domain)) {
    return downloadRedisStateDomain(domain, _auth, options);
  }
  if (isBlobSyncDomain(domain)) {
    return downloadBlobDomain(domain, _auth, options);
  }
  throw new Error(`Unknown sync domain: ${domain}`);
}
