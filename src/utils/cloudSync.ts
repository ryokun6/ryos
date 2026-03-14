import { abortableFetch } from "@/utils/abortableFetch";
import { STORES } from "@/utils/indexedDB";
import { getApiUrl } from "@/utils/platform";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore, type LanguageCode } from "@/stores/useLanguageStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { useVideoStore, type Video } from "@/stores/useVideoStore";
import { useDockStore, type DockItem } from "@/stores/useDockStore";
import {
  useDashboardStore,
  type DashboardWidget,
} from "@/stores/useDashboardStore";
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
  deleteStorageItem,
  listStorageItems,
  putStorageItem,
} from "@/utils/opfsStorage";
import {
  deserializeStorageItem,
  readSerializedStorageStoreItems,
  restoreSerializedStorageStoreItems,
  serializeStorageItem,
} from "@/utils/storageSerialization";
import type { AIModel } from "@/types/aiModels";
import type {
  DisplayMode,
  LyricsAlignment,
  LyricsFont,
  RomanizationSettings,
} from "@/types/lyrics";
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
  getIndividualBlobKnownItems,
  setIndividualBlobKnownItems,
} from "@/utils/cloudSyncIndividualBlobState";
import {
  planIndividualBlobDownload,
  planIndividualBlobUpload,
} from "@/utils/cloudSyncIndividualBlobMerge";
import {
  extractStoredWallpaperId,
  isStoredWallpaperReference,
} from "@/utils/wallpaperStorage";
import { getNextSyncRevision } from "@/utils/cloudSyncRevision";
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

interface SettingsSnapshotData {
  theme: string;
  language: LanguageCode;
  languageInitialized: boolean;
  aiModel: AIModel | null;
  display: {
    displayMode: string;
    shaderEffectEnabled: boolean;
    selectedShaderType: string;
    currentWallpaper: string;
    screenSaverEnabled: boolean;
    screenSaverType: string;
    screenSaverIdleTime: number;
    debugMode: boolean;
    htmlPreviewSplit: boolean;
  };
  audio: {
    masterVolume: number;
    uiVolume: number;
    chatSynthVolume: number;
    speechVolume: number;
    ipodVolume: number;
    uiSoundsEnabled: boolean;
    terminalSoundsEnabled: boolean;
    typingSynthEnabled: boolean;
    speechEnabled: boolean;
    keepTalkingEnabled: boolean;
    ttsModel: "openai" | "elevenlabs" | null;
    ttsVoice: string | null;
    synthPreset: string;
  };
  ipod?: {
    displayMode: DisplayMode;
    showLyrics: boolean;
    lyricsAlignment: LyricsAlignment;
    lyricsFont: LyricsFont;
    romanization: RomanizationSettings;
    lyricsTranslationLanguage: string | null;
    theme: "classic" | "black" | "u2";
    lcdFilterOn: boolean;
  };
  dock?: {
    pinnedItems: DockItem[];
    scale: number;
    hiding: boolean;
    magnification: boolean;
  };
  dashboard?: {
    widgets: DashboardWidget[];
  };
  /** @deprecated Wallpapers moved to custom-wallpapers domain. Kept for backward compat on restore. */
  customWallpapers?: StoreItemWithKey[];
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
      const serializedItem = (await serializeStorageItem(item)) as StoreItemWithKey;
      return {
        item: serializedItem,
        signature: await computeSyncSignature(serializedItem),
      };
    })
  );
}

async function upsertStoreItems(
  storeName: string,
  items: StoreItemWithKey[]
): Promise<void> {
  for (const item of items) {
    await putStorageItem(storeName, deserializeStorageItem(item), item.key);
  }
}

async function deleteStoreItemsByKey(
  storeName: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  for (const key of keys) {
    await deleteStorageItem(storeName, key);
  }
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
  };
}

async function serializeCustomWallpapersSnapshot(): Promise<CustomWallpapersSnapshotData> {
  return (await readSerializedStorageStoreItems(
    STORES.CUSTOM_WALLPAPERS
  )) as CustomWallpapersSnapshotData;
}

async function serializeCustomWallpapersRecords(): Promise<SerializedStoreItemRecord[]> {
  return serializeStoreItemRecords(
    (await listStorageItems(STORES.CUSTOM_WALLPAPERS)) as StoreItemWithKey[]
  );
}

async function serializeIndexedDbStoreSnapshot(
  storeName: string
): Promise<FilesStoreSnapshotData> {
  return (await readSerializedStorageStoreItems(
    storeName
  )) as FilesStoreSnapshotData;
}

async function serializeIndexedDbStoreRecords(
  storeName: string
): Promise<SerializedStoreItemRecord[]> {
  return serializeStoreItemRecords(
    (await listStorageItems(storeName)) as StoreItemWithKey[]
  );
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

  return {
    tracks: ipodState.tracks,
    libraryState: ipodState.libraryState,
    lastKnownVersion: ipodState.lastKnownVersion,
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

async function applySettingsSnapshot(data: SettingsSnapshotData): Promise<void> {
  useThemeStore.getState().setTheme(data.theme as never);
  localStorage.setItem("ryos:language-initialized", data.languageInitialized ? "true" : "false");
  await useLanguageStore.getState().setLanguage(data.language);

  // Legacy: if the old settings envelope contained customWallpapers, restore them
  if (data.customWallpapers && data.customWallpapers.length > 0) {
    await restoreSerializedStorageStoreItems(
      STORES.CUSTOM_WALLPAPERS,
      data.customWallpapers
    );
  }

  useDisplaySettingsStore.setState({
    displayMode: data.display.displayMode as never,
    shaderEffectEnabled: data.display.shaderEffectEnabled,
    selectedShaderType: data.display.selectedShaderType as never,
    screenSaverEnabled: data.display.screenSaverEnabled,
    screenSaverType: data.display.screenSaverType,
    screenSaverIdleTime: data.display.screenSaverIdleTime,
    debugMode: data.display.debugMode,
    htmlPreviewSplit: data.display.htmlPreviewSplit,
  });

  await useDisplaySettingsStore
    .getState()
    .setWallpaper(data.display.currentWallpaper);

  useAudioSettingsStore.setState({
    masterVolume: data.audio.masterVolume,
    uiVolume: data.audio.uiVolume,
    chatSynthVolume: data.audio.chatSynthVolume,
    speechVolume: data.audio.speechVolume,
    ipodVolume: data.audio.ipodVolume,
    uiSoundsEnabled: data.audio.uiSoundsEnabled,
    terminalSoundsEnabled: data.audio.terminalSoundsEnabled,
    typingSynthEnabled: data.audio.typingSynthEnabled,
    speechEnabled: data.audio.speechEnabled,
    keepTalkingEnabled: data.audio.keepTalkingEnabled,
    ttsModel: data.audio.ttsModel,
    ttsVoice: data.audio.ttsVoice,
    synthPreset: data.audio.synthPreset,
  });

  useAppStore.getState().setAiModel(data.aiModel);

  if (data.ipod) {
    useIpodStore.setState({
      displayMode: data.ipod.displayMode,
      showLyrics: data.ipod.showLyrics,
      lyricsAlignment: data.ipod.lyricsAlignment,
      lyricsFont: data.ipod.lyricsFont,
      romanization: data.ipod.romanization,
      lyricsTranslationLanguage: data.ipod.lyricsTranslationLanguage,
      theme: data.ipod.theme,
      lcdFilterOn: data.ipod.lcdFilterOn,
    });
  }

  if (data.dock) {
    useDockStore.setState({
      pinnedItems: data.dock.pinnedItems,
      scale: data.dock.scale,
      hiding: data.dock.hiding,
      magnification: data.dock.magnification,
    });
  }

  if (data.dashboard?.widgets && Array.isArray(data.dashboard.widgets)) {
    useDashboardStore.setState({
      widgets: data.dashboard.widgets,
    });
  }
}

async function applyIndexedDbStoreSnapshot(
  storeName: string,
  data: FilesStoreSnapshotData
): Promise<void> {
  await restoreSerializedStorageStoreItems(storeName, data);
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
  useIpodStore.setState({
    tracks: data.tracks,
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
  await restoreSerializedStorageStoreItems(
    STORES.CUSTOM_WALLPAPERS,
    filteredData
  );

  await finalizeCustomWallpaperSync(filteredData.map((item) => item.key));
}

async function finalizeCustomWallpaperSync(remoteKeys: Iterable<string>): Promise<void> {
  const remoteKeySet = new Set(remoteKeys);
  const displayStore = useDisplaySettingsStore.getState();
  const current = displayStore.currentWallpaper;

  if (isStoredWallpaperReference(current)) {
    const id = extractStoredWallpaperId(current);
    if (id && remoteKeySet.has(id)) {
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
  const existingItems = (await listStorageItems(storeName)) as StoreItemWithKey[];
  const existingKeys = new Set(existingItems.map((item) => item.key));

  await deleteStoreItemsByKey(storeName, keysToDelete);
  await upsertStoreItems(
    storeName,
    Object.values(changedItems).filter((item) => !deletedKeys[item.key])
  );

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
      await applySettingsSnapshot(envelope.data as SettingsSnapshotData);
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

async function uploadRedisStateDomain(
  domain: RedisSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const envelope = await createCloudSyncEnvelope(domain);
  const baseVersion =
    useCloudSyncStore.getState().remoteMetadata[domain]?.version ?? 0;
  let data = envelope.data;

  if (domain === "files-metadata") {
    const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, _auth);
    if (remoteSnapshot?.data) {
      data = mergeFilesMetadataSnapshots(
        envelope.data as FilesMetadataSnapshotData,
        remoteSnapshot.data as FilesMetadataSnapshotData
      );
    }
  }

  const response = await abortableFetch(getApiUrl("/api/sync/state"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      domain,
      data,
      updatedAt: envelope.updatedAt,
      version: envelope.version,
      baseVersion,
    }),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

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
  const baseVersion =
    useCloudSyncStore.getState().remoteMetadata[domain]?.version ?? 0;
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
      baseVersion,
      totalSize: compressed.length,
    },
    _auth
  );
}

async function uploadIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const updatedAt = new Date().toISOString();
  const baseVersion =
    useCloudSyncStore.getState().remoteMetadata[domain]?.version ?? 0;
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
      revision?: import("@/utils/cloudSyncRevision").CloudSyncRevision;
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
      ...(item.revision ? { revision: item.revision } : {}),
      storageUrl: item.storageUrl,
    };
  }

  for (const record of uploadPlan.itemsToUpload) {
    const revision = getNextSyncRevision(domain);
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
      revision,
      storageUrl: uploadResult.storageUrl,
    };
    nextKnownItems[record.item.key] = {
      signature: record.signature,
      updatedAt,
      revision,
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
      baseVersion,
      totalSize: Object.values(nextItems).reduce((sum, item) => sum + item.size, 0),
      items: nextItems,
      deletedItems,
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
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const result = await fetchRedisStateDomainSnapshot(domain, _auth);
  if (!result) {
    throw new Error(`No ${domain} state found`);
  }

  const envelope: CloudSyncEnvelope<AnySnapshotData> = {
    domain,
    version: result.metadata.version,
    updatedAt: result.metadata.updatedAt,
    data: result.data as AnySnapshotData,
  };

  await applyCloudSyncEnvelope(envelope);
  return result.metadata;
}

async function downloadBlobDomain(
  domain: BlobSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const data = await fetchBlobDomainInfo(domain, _auth);
  if (!data?.metadata) {
    throw new Error("Sync download response was invalid.");
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
        ...(remoteItems[itemKey].revision
          ? { revision: remoteItems[itemKey].revision }
          : {}),
      };
    }

    await applyIndividualBlobDomain(
      domain,
      downloadPlan.keysToDelete,
      changedItems,
      effectiveDeletedItems
    );
    setIndividualBlobKnownItems(domain, nextKnownItems);
    return data.metadata;
  }

  const downloadUrl = data.downloadUrl || data.blobUrl;
  if (!downloadUrl) {
    throw new Error("Sync download response was invalid.");
  }

  const envelope = await downloadGzipJson<CloudSyncEnvelope<AnySnapshotData>>(downloadUrl);
  await applyCloudSyncEnvelope(envelope);
  return data.metadata;
}

export async function downloadAndApplyCloudSyncDomain(
  domain: CloudSyncDomain,
  _auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  if (isRedisSyncDomain(domain)) {
    return downloadRedisStateDomain(domain, _auth);
  }
  if (isBlobSyncDomain(domain)) {
    return downloadBlobDomain(domain, _auth);
  }
  throw new Error(`Unknown sync domain: ${domain}`);
}
