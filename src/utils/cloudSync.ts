import { abortableFetch } from "@/utils/abortableFetch";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
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
import { useStickiesStore, type StickyNote } from "@/stores/useStickiesStore";
import {
  useCalendarStore,
  type CalendarEvent,
  type CalendarGroup,
  type TodoItem,
} from "@/stores/useCalendarStore";
import { useContactsStore } from "@/stores/useContactsStore";
import type { Contact } from "@/utils/contacts";
import { normalizeContacts } from "@/utils/contacts";
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
  REDIS_SYNC_DOMAINS,
  BLOB_SYNC_DOMAINS,
  type CloudSyncDomain,
  type CloudSyncDomainMetadata,
  type CloudSyncEnvelope,
  type CloudSyncMetadataMap,
  type RedisSyncDomain,
  type BlobSyncDomain,
  createEmptyCloudSyncMetadataMap,
} from "@/utils/cloudSyncShared";
type AuthContext = {
  username: string;
  authToken: string;
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
  /** @deprecated Wallpapers moved to custom-wallpapers domain. Kept for backward compat on restore. */
  customWallpapers?: StoreItemWithKey[];
}

type CustomWallpapersSnapshotData = StoreItemWithKey[];

interface FilesMetadataSnapshotData {
  items: Record<string, FileSystemItem>;
  libraryState: "uninitialized" | "loaded" | "cleared";
  documents?: FilesStoreSnapshotData;
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
}

interface CalendarSnapshotData {
  events: CalendarEvent[];
  calendars: CalendarGroup[];
  todos: TodoItem[];
}

interface ContactsSnapshotData {
  contacts: Contact[];
  myContactId: string | null;
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

async function serializeStoreItems(
  items: StoreItemWithKey[]
): Promise<StoreItemWithKey[]> {
  return Promise.all(
    items.map(async (item) => {
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
    })
  );
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

          store.put(restoredValue, item.key);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };

    clearRequest.onerror = () => reject(clearRequest.error);
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

async function serializeFilesMetadataSnapshot(): Promise<FilesMetadataSnapshotData> {
  const filesState = useFilesStore.getState();

  return {
    items: filesState.items,
    libraryState: filesState.libraryState,
    documents: await serializeIndexedDbStoreSnapshot(STORES.DOCUMENTS),
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
  return {
    notes: useStickiesStore.getState().notes,
  };
}

function serializeCalendarSnapshot(): CalendarSnapshotData {
  const calendarState = useCalendarStore.getState();

  return {
    events: calendarState.events,
    calendars: calendarState.calendars,
    todos: calendarState.todos,
  };
}

function serializeContactsSnapshot(): ContactsSnapshotData {
  return {
    contacts: useContactsStore.getState().contacts,
    myContactId: useContactsStore.getState().myContactId,
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
    const db = await ensureIndexedDBInitialized();
    try {
      await restoreStoreItems(db, STORES.CUSTOM_WALLPAPERS, data.customWallpapers);
    } finally {
      db.close();
    }
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
  useFilesStore.setState({
    items: data.items,
    libraryState: data.libraryState,
  });

  if (data.documents) {
    await applyIndexedDbStoreSnapshot(STORES.DOCUMENTS, data.documents);
  }
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
  useStickiesStore.setState({
    notes: data.notes,
  });
}

function applyCalendarSnapshot(data: CalendarSnapshotData): void {
  useCalendarStore.setState({
    events: data.events,
    calendars: data.calendars,
    todos: data.todos,
  });
}

function applyContactsSnapshot(data: ContactsSnapshotData): void {
  useContactsStore
    .getState()
    .replaceContactsFromSync(
      normalizeContacts(data?.contacts),
      data?.myContactId ?? null
    );
}

async function applyCustomWallpapersSnapshot(
  data: CustomWallpapersSnapshotData
): Promise<void> {
  console.log(`[CloudSync] applyCustomWallpapersSnapshot: replacing with ${data.length} items`);
  const db = await ensureIndexedDBInitialized();
  try {
    await restoreStoreItems(db, STORES.CUSTOM_WALLPAPERS, data);

    const remoteKeys = new Set(data.map((item) => item.key));
    const displayStore = useDisplaySettingsStore.getState();
    const current = displayStore.currentWallpaper;
    if (current?.startsWith("indexeddb://")) {
      const id = current.substring("indexeddb://".length);
      if (remoteKeys.has(id)) {
        // Re-resolve: settings may have been applied before the blob data
        // was available in IndexedDB, leaving wallpaperSource as the raw
        // indexeddb:// reference. Now that the data is restored, re-resolve
        // it to a fresh object URL.
        await displayStore.setWallpaper(current);
      } else {
        useDisplaySettingsStore.setState({
          currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
          wallpaperSource: "/wallpapers/photos/aqua/water.jpg",
        });
      }
    }
    displayStore.bumpCustomWallpapersRevision();
  } finally {
    db.close();
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

function authHeaders(auth: AuthContext): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.authToken}`,
    "X-Username": auth.username,
    "X-Sync-Session-Id": getSyncSessionId(),
  };
}

export async function fetchCloudSyncMetadata(
  auth: AuthContext
): Promise<CloudSyncMetadataMap> {
  const [blobRes, redisRes] = await Promise.all([
    abortableFetch(getApiUrl("/api/sync/auto"), {
      method: "GET",
      headers: authHeaders(auth),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }),
    abortableFetch(getApiUrl("/api/sync/state"), {
      method: "GET",
      headers: authHeaders(auth),
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
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const envelope = await createCloudSyncEnvelope(domain);

  const response = await abortableFetch(getApiUrl("/api/sync/state"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth),
    },
    body: JSON.stringify({
      domain,
      data: envelope.data,
      updatedAt: envelope.updatedAt,
      version: envelope.version,
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

async function uploadBlobDomain(
  domain: BlobSyncDomain,
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const envelope = await createCloudSyncEnvelope(domain);
  const dataItems = Array.isArray(envelope.data) ? envelope.data.length : 'N/A';
  console.log(`[CloudSync:blob] ${domain}: serialized ${dataItems} items`);
  const compressed = await gzipJson(envelope);
  console.log(`[CloudSync:blob] ${domain}: compressed to ${compressed.length} bytes`);

  const tokenResponse = await abortableFetch(getApiUrl("/api/sync/auto-token"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth),
    },
    body: JSON.stringify({ domain }),
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

  const tokenData = (await tokenResponse.json()) as { clientToken: string };

  const { put } = await import("@vercel/blob/client");
  const blobResult = await put(
    `sync/${auth.username}/${domain}.gz`,
    new Blob([compressed], { type: "application/gzip" }),
    {
      access: "public",
      token: tokenData.clientToken,
      contentType: "application/gzip",
      multipart: compressed.length > 4 * 1024 * 1024,
    }
  );

  const metadataResponse = await abortableFetch(getApiUrl("/api/sync/auto"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth),
    },
    body: JSON.stringify({
      domain,
      blobUrl: blobResult.url,
      updatedAt: envelope.updatedAt,
      version: envelope.version,
      totalSize: compressed.length,
    }),
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

export async function uploadCloudSyncDomain(
  domain: CloudSyncDomain,
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  if (isRedisSyncDomain(domain)) {
    return uploadRedisStateDomain(domain, auth);
  }
  if (isBlobSyncDomain(domain)) {
    return uploadBlobDomain(domain, auth);
  }
  throw new Error(`Unknown sync domain: ${domain}`);
}

async function downloadRedisStateDomain(
  domain: RedisSyncDomain,
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const response = await abortableFetch(
    getApiUrl(`/api/sync/state?domain=${encodeURIComponent(domain)}`),
    {
      method: "GET",
      headers: authHeaders(auth),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );

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
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const response = await abortableFetch(
    getApiUrl(`/api/sync/auto?domain=${encodeURIComponent(domain)}`),
    {
      method: "GET",
      headers: authHeaders(auth),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        `Failed to download ${domain} sync data`
    );
  }

  const data = (await response.json()) as {
    blobUrl?: string;
    metadata?: CloudSyncDomainMetadata;
  };

  if (!data.blobUrl || !data.metadata) {
    throw new Error("Sync download response was invalid.");
  }

  const blobResponse = await fetch(data.blobUrl);
  if (!blobResponse.ok) {
    throw new Error(`Failed to fetch ${domain} blob from CDN`);
  }

  const compressedBuf = await blobResponse.arrayBuffer();
  const compressedBlob = new Blob([compressedBuf], { type: "application/gzip" });
  const decompressedStream = compressedBlob
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const jsonString = await new Response(decompressedStream).text();
  const envelope = JSON.parse(jsonString) as CloudSyncEnvelope<AnySnapshotData>;

  await applyCloudSyncEnvelope(envelope);
  return data.metadata;
}

export async function downloadAndApplyCloudSyncDomain(
  domain: CloudSyncDomain,
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  if (isRedisSyncDomain(domain)) {
    return downloadRedisStateDomain(domain, auth);
  }
  if (isBlobSyncDomain(domain)) {
    return downloadBlobDomain(domain, auth);
  }
  throw new Error(`Unknown sync domain: ${domain}`);
}
