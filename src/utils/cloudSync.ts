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
import {
  useCalendarStore,
  type CalendarEvent,
  type CalendarGroup,
  type TodoItem,
} from "@/stores/useCalendarStore";
import type { AIModel } from "@/types/aiModels";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  type CloudSyncDomain,
  type CloudSyncDomainMetadata,
  type CloudSyncEnvelope,
  type CloudSyncMetadataMap,
} from "@/utils/cloudSyncShared";

type AuthContext = {
  username: string;
  authToken: string;
};

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
  customWallpapers: StoreItemWithKey[];
}

interface FilesMetadataSnapshotData {
  items: Record<string, FileSystemItem>;
  libraryState: "uninitialized" | "loaded" | "cleared";
}

type FilesStoreSnapshotData = StoreItemWithKey[];

interface SongsSnapshotData {
  tracks: Track[];
  libraryState: "uninitialized" | "loaded" | "cleared";
  lastKnownVersion: number;
}

interface CalendarSnapshotData {
  events: CalendarEvent[];
  calendars: CalendarGroup[];
  todos: TodoItem[];
}

type AnySnapshotData =
  | SettingsSnapshotData
  | FilesMetadataSnapshotData
  | FilesStoreSnapshotData
  | SongsSnapshotData
  | CalendarSnapshotData;

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

async function gunzipBase64Json<T>(base64Data: string): Promise<T> {
  assertCompressionSupport();
  const compressed = Uint8Array.from(atob(base64Data), (char) =>
    char.charCodeAt(0)
  );
  const compressedBlob = new Blob([compressed], { type: "application/gzip" });
  const compressedStream = compressedBlob.stream();
  const decompressedStream = compressedStream.pipeThrough(
    new DecompressionStream("gzip")
  );
  const jsonString = await new Response(decompressedStream).text();

  return JSON.parse(jsonString) as T;
}

async function serializeSettingsSnapshot(): Promise<SettingsSnapshotData> {
  const displayState = useDisplaySettingsStore.getState();
  const audioState = useAudioSettingsStore.getState();
  const db = await ensureIndexedDBInitialized();

  try {
    const customWallpapers = await serializeStoreItems(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );

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
      customWallpapers,
    };
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

function serializeFilesMetadataSnapshot(): FilesMetadataSnapshotData {
  const filesState = useFilesStore.getState();

  return {
    items: filesState.items,
    libraryState: filesState.libraryState,
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

function serializeCalendarSnapshot(): CalendarSnapshotData {
  const calendarState = useCalendarStore.getState();

  return {
    events: calendarState.events,
    calendars: calendarState.calendars,
    todos: calendarState.todos,
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
        data: await serializeSettingsSnapshot(),
      };
    case "files-metadata":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeFilesMetadataSnapshot(),
      };
    case "files-documents":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.DOCUMENTS),
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
    case "calendar":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeCalendarSnapshot(),
      };
  }
}

async function applySettingsSnapshot(data: SettingsSnapshotData): Promise<void> {
  useThemeStore.getState().setTheme(data.theme as never);
  localStorage.setItem("ryos:language-initialized", data.languageInitialized ? "true" : "false");
  await useLanguageStore.getState().setLanguage(data.language);

  const db = await ensureIndexedDBInitialized();
  try {
    await restoreStoreItems(db, STORES.CUSTOM_WALLPAPERS, data.customWallpapers);
  } finally {
    db.close();
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

function applyFilesMetadataSnapshot(data: FilesMetadataSnapshotData): void {
  useFilesStore.setState({
    items: data.items,
    libraryState: data.libraryState,
  });
}

function applySongsSnapshot(data: SongsSnapshotData): void {
  useIpodStore.setState({
    tracks: data.tracks,
    libraryState: data.libraryState,
    lastKnownVersion: data.lastKnownVersion,
  });
}

function applyCalendarSnapshot(data: CalendarSnapshotData): void {
  useCalendarStore.setState({
    events: data.events,
    calendars: data.calendars,
    todos: data.todos,
  });
}

export async function applyCloudSyncEnvelope(
  envelope: CloudSyncEnvelope<AnySnapshotData>
): Promise<void> {
  switch (envelope.domain) {
    case "settings":
      await applySettingsSnapshot(envelope.data as SettingsSnapshotData);
      return;
    case "files-metadata":
      applyFilesMetadataSnapshot(envelope.data as FilesMetadataSnapshotData);
      return;
    case "files-documents":
      await applyIndexedDbStoreSnapshot(
        STORES.DOCUMENTS,
        envelope.data as FilesStoreSnapshotData
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
    case "calendar":
      applyCalendarSnapshot(envelope.data as CalendarSnapshotData);
      return;
  }
}

export async function fetchCloudSyncMetadata(
  auth: AuthContext
): Promise<CloudSyncMetadataMap> {
  const response = await abortableFetch(getApiUrl("/api/sync/auto"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${auth.authToken}`,
      "X-Username": auth.username,
    },
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || "Failed to fetch sync metadata"
    );
  }

  const data = (await response.json()) as {
    metadata?: CloudSyncMetadataMap;
  };

  if (!data.metadata) {
    throw new Error("Sync metadata response was invalid.");
  }

  return data.metadata;
}

export async function uploadCloudSyncDomain(
  domain: CloudSyncDomain,
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const envelope = await createCloudSyncEnvelope(domain);
  const compressed = await gzipJson(envelope);

  const tokenResponse = await abortableFetch(getApiUrl("/api/sync/auto-token"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.authToken}`,
      "X-Username": auth.username,
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
      Authorization: `Bearer ${auth.authToken}`,
      "X-Username": auth.username,
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

export async function downloadAndApplyCloudSyncDomain(
  domain: CloudSyncDomain,
  auth: AuthContext
): Promise<CloudSyncDomainMetadata> {
  const response = await abortableFetch(
    getApiUrl(`/api/sync/auto?domain=${encodeURIComponent(domain)}`),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth.authToken}`,
        "X-Username": auth.username,
      },
      timeout: 30000,
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
    data?: string;
    metadata?: CloudSyncDomainMetadata;
  };

  if (!data.data || !data.metadata) {
    throw new Error("Sync download response was invalid.");
  }

  const envelope = await gunzipBase64Json<CloudSyncEnvelope<AnySnapshotData>>(
    data.data
  );

  await applyCloudSyncEnvelope(envelope);

  return data.metadata;
}
