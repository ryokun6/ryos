/**
 * Cloud Sync v2 namespace codecs.
 *
 * A codec owns one key namespace: it decomposes local store state into
 * `key → document` maps (collect), applies remote ops back onto the stores
 * (apply), and wires store subscriptions that mark the namespace dirty.
 *
 * Documents are plain JSON at the same granularity v1 merged at (settings
 * sections, file paths, track ids, per-item blobs), so per-key
 * last-writer-wins preserves v1's effective conflict behavior without any
 * of the snapshot merge machinery.
 */

import { STORES } from "@/utils/indexedDB";
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
import { useCalendarStore } from "@/stores/useCalendarStore";
import { useContactsStore } from "@/stores/useContactsStore";
import { useMapsStore } from "@/stores/useMapsStore";
import {
  useCloudSyncStore,
  type CloudSyncDeletionBucket,
} from "@/stores/useCloudSyncStore";
import { areRomanizationSettingsEqual } from "@/types/lyrics";
import {
  deserializeStoreItem,
  readStoreItems,
  serializeStoreItems,
  type IndexedDBStoreItemWithKey as StoreItemWithKey,
} from "@/utils/indexedDBBackup";
import type { SyncNamespace } from "@/shared/sync2/namespaces";

export interface AppliedSyncOp {
  k: string;
  v?: unknown;
  del?: boolean;
  t: string;
}

export interface CodecContext {
  db?: IDBDatabase;
}

export interface SyncCodec {
  namespace: SyncNamespace;
  usesIndexedDb?: boolean;
  /** Local state as key → document. */
  collect(ctx: CodecContext): Promise<Map<string, unknown>> | Map<string, unknown>;
  /** Apply remote ops onto local stores. */
  apply(ops: AppliedSyncOp[], ctx: CodecContext): Promise<void> | void;
  /** Subscribe to local changes; invoke onChange to mark the namespace dirty. */
  subscribe(onChange: () => void): () => void;
  /** False while backing stores haven't hydrated; collect is skipped. */
  isReady?(): boolean;
}

/** Blob codecs additionally expose raw item access for content uploads. */
export interface BlobSyncCodec extends SyncCodec {
  storeName: string;
  putItems(items: StoreItemWithKey[], ctx: CodecContext): Promise<void>;
  deleteItems(keys: string[], ctx: CodecContext): Promise<void>;
  afterApply?(ctx: CodecContext): Promise<void>;
}

/** Maps v1 deletion-marker buckets to v2 key prefixes (for corroboration). */
export const DELETION_BUCKET_PREFIXES: Record<CloudSyncDeletionBucket, string> = {
  calendarTodoIds: "calendar/todo:",
  calendarEventIds: "calendar/event:",
  calendarIds: "calendar/cal:",
  stickyNoteIds: "stickies/note:",
  contactIds: "contacts/contact:",
  fileMetadataPaths: "files/item:",
  fileImageKeys: "images/item:",
  fileTrashKeys: "trash/item:",
  fileAppletKeys: "applets/item:",
  customWallpaperKeys: "wallpapers/item:",
  songTrackIds: "songs/track:",
  tvCustomChannelIds: "tv/channel:",
  mapsFavoriteIds: "maps/favorite:",
};

export function getDeletionMarkerForKey(key: string): string | null {
  const markers = useCloudSyncStore.getState().deletionMarkers;
  for (const [bucket, prefix] of Object.entries(DELETION_BUCKET_PREFIXES) as Array<
    [CloudSyncDeletionBucket, string]
  >) {
    if (key.startsWith(prefix)) {
      return markers[bucket][key.slice(prefix.length)] || null;
    }
  }
  return null;
}

export function clearDeletionMarkerForKey(key: string): void {
  const store = useCloudSyncStore.getState();
  for (const [bucket, prefix] of Object.entries(DELETION_BUCKET_PREFIXES) as Array<
    [CloudSyncDeletionBucket, string]
  >) {
    if (key.startsWith(prefix)) {
      store.clearDeletedKeys(bucket, [key.slice(prefix.length)]);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// IndexedDB helpers (shared by files + blob codecs)
// ---------------------------------------------------------------------------

async function upsertStoreItems(
  db: IDBDatabase,
  storeName: string,
  items: StoreItemWithKey[]
): Promise<void> {
  if (items.length === 0) return;
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
  if (keys.length === 0) return;
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

function requireDb(ctx: CodecContext, namespace: string): IDBDatabase {
  if (!ctx.db) {
    throw new Error(`Sync codec ${namespace} requires an IndexedDB handle`);
  }
  return ctx.db;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ---------------------------------------------------------------------------
// Settings codec
// ---------------------------------------------------------------------------

function collectSettings(): Map<string, unknown> {
  const docs = new Map<string, unknown>();
  const themeState = useThemeStore.getState();
  const displayState = useDisplaySettingsStore.getState();
  const audioState = useAudioSettingsStore.getState();
  const ipodState = useIpodStore.getState();
  const dockState = useDockStore.getState();
  const dashboardState = useDashboardStore.getState();

  docs.set("settings/theme", {
    current: themeState.current,
    darkMode: themeState.darkModeByTheme,
    accent: themeState.accentByTheme,
    aquaMaterial: themeState.aquaMaterial,
    systemFont: themeState.systemFont,
  });
  docs.set("settings/language", {
    current: useLanguageStore.getState().current,
    initialized:
      typeof localStorage !== "undefined" &&
      localStorage.getItem("ryos:language-initialized") === "true",
  });
  docs.set("settings/display", {
    displayMode: displayState.displayMode,
    shaderEffectEnabled: displayState.shaderEffectEnabled,
    selectedShaderType: displayState.selectedShaderType,
    currentWallpaper: displayState.currentWallpaper,
    screenSaverEnabled: displayState.screenSaverEnabled,
    screenSaverType: displayState.screenSaverType,
    screenSaverIdleTime: displayState.screenSaverIdleTime,
    debugMode: displayState.debugMode,
    htmlPreviewSplit: displayState.htmlPreviewSplit,
  });
  docs.set("settings/audio", {
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
  });
  docs.set("settings/ai", { model: useAppStore.getState().aiModel ?? null });
  docs.set("settings/ipod", {
    displayMode: ipodState.displayMode,
    showLyrics: ipodState.showLyrics,
    lyricsAlignment: ipodState.lyricsAlignment,
    lyricsFont: ipodState.lyricsFont,
    romanization: ipodState.romanization,
    lyricsTranslationLanguage: ipodState.lyricsTranslationLanguage ?? null,
    theme: ipodState.theme,
    lcdFilterOn: ipodState.lcdFilterOn,
  });
  docs.set("settings/dock", {
    pinnedItems: dockState.pinnedItems,
    scale: dockState.scale,
    hiding: dockState.hiding,
    magnification: dockState.magnification,
  });
  docs.set("settings/dashboard", {
    widgets: dashboardState.widgets,
  });
  return docs;
}

async function applySettingsOp(op: AppliedSyncOp): Promise<void> {
  if (op.del) return; // settings sections are never deleted
  const doc = asRecord(op.v);
  if (!doc) return;

  switch (op.k) {
    case "settings/theme": {
      const themeStore = useThemeStore.getState();
      if (typeof doc.current === "string") {
        themeStore.setTheme(doc.current as never);
      }
      const darkMap = asRecord(doc.darkMode);
      if (darkMap) {
        for (const [themeId, value] of Object.entries(darkMap)) {
          useThemeStore.getState().setDarkMode(value as never, themeId as never);
        }
      }
      const accentMap = asRecord(doc.accent);
      if (accentMap) {
        for (const [themeId, value] of Object.entries(accentMap)) {
          useThemeStore.getState().setAccent(value as never, themeId as never);
        }
      }
      if (doc.aquaMaterial === "classic" || doc.aquaMaterial === "glass") {
        useThemeStore.getState().setAquaMaterial(doc.aquaMaterial);
      }
      if (typeof doc.systemFont === "string" && doc.systemFont) {
        useThemeStore.getState().setSystemFont(doc.systemFont as never);
      }
      return;
    }
    case "settings/language": {
      if (typeof doc.current === "string") {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(
            "ryos:language-initialized",
            doc.initialized === true ? "true" : "false"
          );
        }
        await useLanguageStore.getState().setLanguage(doc.current as never);
      }
      return;
    }
    case "settings/display": {
      useDisplaySettingsStore.setState({
        displayMode: doc.displayMode as never,
        shaderEffectEnabled: Boolean(doc.shaderEffectEnabled),
        selectedShaderType: doc.selectedShaderType as never,
        screenSaverEnabled: Boolean(doc.screenSaverEnabled),
        screenSaverType: doc.screenSaverType as never,
        screenSaverIdleTime: doc.screenSaverIdleTime as never,
        debugMode: Boolean(doc.debugMode),
        htmlPreviewSplit: Boolean(doc.htmlPreviewSplit),
      });
      if (typeof doc.currentWallpaper === "string" && doc.currentWallpaper) {
        await useDisplaySettingsStore
          .getState()
          .setWallpaper(doc.currentWallpaper);
      }
      return;
    }
    case "settings/audio": {
      useAudioSettingsStore.setState({
        masterVolume: doc.masterVolume as never,
        uiVolume: doc.uiVolume as never,
        chatSynthVolume: doc.chatSynthVolume as never,
        speechVolume: doc.speechVolume as never,
        ipodVolume: doc.ipodVolume as never,
        uiSoundsEnabled: Boolean(doc.uiSoundsEnabled),
        terminalSoundsEnabled: Boolean(doc.terminalSoundsEnabled),
        typingSynthEnabled: Boolean(doc.typingSynthEnabled),
        speechEnabled: Boolean(doc.speechEnabled),
        keepTalkingEnabled: Boolean(doc.keepTalkingEnabled),
        ttsModel: doc.ttsModel as never,
        ttsVoice: doc.ttsVoice as never,
        synthPreset: doc.synthPreset as never,
      });
      return;
    }
    case "settings/ai": {
      useAppStore.getState().setAiModel(doc.model as never);
      return;
    }
    case "settings/ipod": {
      useIpodStore.setState({
        displayMode: doc.displayMode as never,
        showLyrics: Boolean(doc.showLyrics),
        lyricsAlignment: doc.lyricsAlignment as never,
        lyricsFont: doc.lyricsFont as never,
        romanization: doc.romanization as never,
        lyricsTranslationLanguage: (doc.lyricsTranslationLanguage ?? null) as never,
        theme: doc.theme as never,
        lcdFilterOn: Boolean(doc.lcdFilterOn),
      });
      return;
    }
    case "settings/dock": {
      useDockStore.setState({
        pinnedItems: doc.pinnedItems as never,
        scale: doc.scale as never,
        hiding: doc.hiding as never,
        magnification: doc.magnification as never,
      });
      return;
    }
    case "settings/dashboard": {
      if (Array.isArray(doc.widgets)) {
        useDashboardStore.setState({ widgets: doc.widgets as never });
      }
      return;
    }
  }
}

const settingsCodec: SyncCodec = {
  namespace: "settings",
  collect: collectSettings,
  async apply(ops) {
    for (const op of ops) {
      try {
        await applySettingsOp(op);
      } catch (error) {
        console.error(`[sync2] Failed to apply ${op.k}:`, error);
      }
    }
  },
  subscribe(onChange) {
    const unsubscribers = [
      useThemeStore.subscribe((state, prev) => {
        if (
          state.current !== prev.current ||
          state.darkModeByTheme !== prev.darkModeByTheme ||
          state.accentByTheme !== prev.accentByTheme ||
          state.aquaMaterial !== prev.aquaMaterial ||
          state.systemFont !== prev.systemFont
        ) {
          onChange();
        }
      }),
      useLanguageStore.subscribe((state, prev) => {
        if (state.current !== prev.current) onChange();
      }),
      useDisplaySettingsStore.subscribe((state, prev) => {
        if (
          state.displayMode !== prev.displayMode ||
          state.shaderEffectEnabled !== prev.shaderEffectEnabled ||
          state.selectedShaderType !== prev.selectedShaderType ||
          state.currentWallpaper !== prev.currentWallpaper ||
          state.screenSaverEnabled !== prev.screenSaverEnabled ||
          state.screenSaverType !== prev.screenSaverType ||
          state.screenSaverIdleTime !== prev.screenSaverIdleTime ||
          state.debugMode !== prev.debugMode ||
          state.htmlPreviewSplit !== prev.htmlPreviewSplit
        ) {
          onChange();
        }
      }),
      useAudioSettingsStore.subscribe((state, prev) => {
        if (
          state.masterVolume !== prev.masterVolume ||
          state.uiVolume !== prev.uiVolume ||
          state.chatSynthVolume !== prev.chatSynthVolume ||
          state.speechVolume !== prev.speechVolume ||
          state.ipodVolume !== prev.ipodVolume ||
          state.uiSoundsEnabled !== prev.uiSoundsEnabled ||
          state.terminalSoundsEnabled !== prev.terminalSoundsEnabled ||
          state.typingSynthEnabled !== prev.typingSynthEnabled ||
          state.speechEnabled !== prev.speechEnabled ||
          state.keepTalkingEnabled !== prev.keepTalkingEnabled ||
          state.ttsModel !== prev.ttsModel ||
          state.ttsVoice !== prev.ttsVoice ||
          state.synthPreset !== prev.synthPreset
        ) {
          onChange();
        }
      }),
      useAppStore.subscribe((state, prev) => {
        if (state.aiModel !== prev.aiModel) onChange();
      }),
      useIpodStore.subscribe((state, prev) => {
        if (
          state.displayMode !== prev.displayMode ||
          state.showLyrics !== prev.showLyrics ||
          state.lyricsAlignment !== prev.lyricsAlignment ||
          state.lyricsFont !== prev.lyricsFont ||
          !areRomanizationSettingsEqual(state.romanization, prev.romanization) ||
          state.lyricsTranslationLanguage !== prev.lyricsTranslationLanguage ||
          state.theme !== prev.theme ||
          state.lcdFilterOn !== prev.lcdFilterOn
        ) {
          onChange();
        }
      }),
      useDockStore.subscribe((state, prev) => {
        if (
          state.pinnedItems !== prev.pinnedItems ||
          state.scale !== prev.scale ||
          state.hiding !== prev.hiding ||
          state.magnification !== prev.magnification
        ) {
          onChange();
        }
      }),
      useDashboardStore.subscribe((state, prev) => {
        if (state.widgets !== prev.widgets) onChange();
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  },
};

// ---------------------------------------------------------------------------
// Files codec (metadata + TextEdit document contents)
// ---------------------------------------------------------------------------

const filesCodec: SyncCodec = {
  namespace: "files",
  usesIndexedDb: true,
  async collect(ctx) {
    const docs = new Map<string, unknown>();
    const filesState = useFilesStore.getState();

    for (const [path, item] of Object.entries(filesState.items)) {
      if (!path) continue;
      docs.set(`files/item:${path}`, item);
    }
    docs.set("files/lib", { libraryState: filesState.libraryState });

    const db = requireDb(ctx, "files");
    const documents = await serializeStoreItems(
      await readStoreItems(db, STORES.DOCUMENTS)
    );
    for (const doc of documents) {
      if (doc.key) {
        docs.set(`files/doc:${doc.key}`, doc);
      }
    }
    return docs;
  },
  async apply(ops, ctx) {
    const itemUpserts: Record<string, FileSystemItem> = {};
    const itemDeletes: string[] = [];
    const docUpserts: StoreItemWithKey[] = [];
    const docDeletes: string[] = [];
    let libraryState: "uninitialized" | "loaded" | "cleared" | null = null;

    for (const op of ops) {
      if (op.k.startsWith("files/item:")) {
        const path = op.k.slice("files/item:".length);
        if (op.del) {
          itemDeletes.push(path);
        } else if (asRecord(op.v)) {
          itemUpserts[path] = op.v as FileSystemItem;
        }
      } else if (op.k.startsWith("files/doc:")) {
        const key = op.k.slice("files/doc:".length);
        if (op.del) {
          docDeletes.push(key);
        } else {
          const doc = asRecord(op.v);
          if (doc && typeof doc.key === "string" && asRecord(doc.value)) {
            docUpserts.push(doc as unknown as StoreItemWithKey);
          }
        }
      } else if (op.k === "files/lib" && !op.del) {
        const doc = asRecord(op.v);
        if (
          doc?.libraryState === "loaded" ||
          doc?.libraryState === "cleared" ||
          doc?.libraryState === "uninitialized"
        ) {
          libraryState = doc.libraryState;
        }
      }
    }

    if (
      Object.keys(itemUpserts).length > 0 ||
      itemDeletes.length > 0 ||
      libraryState
    ) {
      useFilesStore.setState((state) => {
        const items = { ...state.items };
        for (const path of itemDeletes) {
          delete items[path];
        }
        for (const [path, item] of Object.entries(itemUpserts)) {
          items[path] = item;
        }
        return {
          items,
          libraryState: libraryState || state.libraryState,
        };
      });
    }

    if (docUpserts.length > 0 || docDeletes.length > 0) {
      const db = requireDb(ctx, "files");
      await deleteStoreItemsByKey(db, STORES.DOCUMENTS, docDeletes);
      await upsertStoreItems(db, STORES.DOCUMENTS, docUpserts);
    }
  },
  subscribe(onChange) {
    return useFilesStore.subscribe((state, prev) => {
      if (state.items !== prev.items || state.libraryState !== prev.libraryState) {
        onChange();
      }
    });
  },
  isReady() {
    return useFilesStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Songs codec
// ---------------------------------------------------------------------------

const songsCodec: SyncCodec = {
  namespace: "songs",
  collect() {
    const docs = new Map<string, unknown>();
    const ipodState = useIpodStore.getState();
    for (const track of ipodState.tracks) {
      if (track?.id) {
        docs.set(`songs/track:${track.id}`, track);
      }
    }
    docs.set("songs/lib", {
      libraryState: ipodState.libraryState,
      lastKnownVersion: ipodState.lastKnownVersion,
      order: ipodState.tracks.map((track) => track.id).filter(Boolean),
    });
    return docs;
  },
  apply(ops) {
    const upserts = new Map<string, Track>();
    const deletes = new Set<string>();
    let lib: {
      libraryState?: unknown;
      lastKnownVersion?: unknown;
      order?: unknown;
    } | null = null;

    for (const op of ops) {
      if (op.k.startsWith("songs/track:")) {
        const id = op.k.slice("songs/track:".length);
        if (op.del) {
          deletes.add(id);
        } else if (asRecord(op.v)) {
          upserts.set(id, op.v as Track);
        }
      } else if (op.k === "songs/lib" && !op.del) {
        lib = asRecord(op.v);
      }
    }

    useIpodStore.setState((state) => {
      const byId = new Map(state.tracks.map((track) => [track.id, track]));
      for (const id of deletes) {
        byId.delete(id);
      }
      for (const [id, track] of upserts) {
        byId.set(id, track);
      }
      const order = Array.isArray(lib?.order)
        ? (lib!.order as unknown[]).filter(
            (id): id is string => typeof id === "string"
          )
        : null;
      const merged = Array.from(byId.values());
      const tracks = order
        ? [
            ...merged
              .filter((track) => order.includes(track.id))
              .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
            ...sortTracksLikeServerOrder(
              merged.filter((track) => !order.includes(track.id))
            ),
          ]
        : sortTracksLikeServerOrder(merged);
      return {
        tracks,
        libraryState:
          lib?.libraryState === "loaded" ||
          lib?.libraryState === "cleared" ||
          lib?.libraryState === "uninitialized"
            ? lib.libraryState
            : state.libraryState,
        lastKnownVersion:
          typeof lib?.lastKnownVersion === "number" &&
          Number.isFinite(lib.lastKnownVersion)
            ? Math.max(state.lastKnownVersion, lib.lastKnownVersion)
            : state.lastKnownVersion,
      };
    });
  },
  subscribe(onChange) {
    return useIpodStore.subscribe((state, prev) => {
      if (
        state.tracks !== prev.tracks ||
        state.libraryState !== prev.libraryState ||
        state.lastKnownVersion !== prev.lastKnownVersion
      ) {
        // Track removals are corroborated by deletion markers so mass
        // local wipes (e.g. storage eviction) can't silently propagate.
        if (state.tracks !== prev.tracks) {
          const currentIds = new Set(state.tracks.map((track) => track.id));
          const removedIds = prev.tracks
            .filter((track) => !currentIds.has(track.id))
            .map((track) => track.id);
          const prevIds = new Set(prev.tracks.map((track) => track.id));
          const addedIds = state.tracks
            .filter((track) => !prevIds.has(track.id))
            .map((track) => track.id);
          const syncStore = useCloudSyncStore.getState();
          if (removedIds.length > 0) syncStore.markDeletedKeys("songTrackIds", removedIds);
          if (addedIds.length > 0) syncStore.clearDeletedKeys("songTrackIds", addedIds);
        }
        onChange();
      }
    });
  },
};

// ---------------------------------------------------------------------------
// Videos codec
// ---------------------------------------------------------------------------

const videosCodec: SyncCodec = {
  namespace: "videos",
  collect() {
    const docs = new Map<string, unknown>();
    const videos = useVideoStore.getState().videos;
    for (const video of videos) {
      if (video?.id) {
        docs.set(`videos/video:${video.id}`, video);
      }
    }
    docs.set("videos/lib", {
      order: videos.map((video) => video.id).filter(Boolean),
    });
    return docs;
  },
  apply(ops) {
    const upserts = new Map<string, Video>();
    const deletes = new Set<string>();
    let order: string[] | null = null;

    for (const op of ops) {
      if (op.k.startsWith("videos/video:")) {
        const id = op.k.slice("videos/video:".length);
        if (op.del) {
          deletes.add(id);
        } else if (asRecord(op.v)) {
          upserts.set(id, op.v as Video);
        }
      } else if (op.k === "videos/lib" && !op.del) {
        const doc = asRecord(op.v);
        if (Array.isArray(doc?.order)) {
          order = (doc!.order as unknown[]).filter(
            (id): id is string => typeof id === "string"
          );
        }
      }
    }

    useVideoStore.setState((state) => {
      const byId = new Map(state.videos.map((video) => [video.id, video]));
      for (const id of deletes) {
        byId.delete(id);
      }
      for (const [id, video] of upserts) {
        byId.set(id, video);
      }
      let videos = Array.from(byId.values());
      if (order) {
        const position = new Map(order.map((id, index) => [id, index]));
        videos = videos.sort(
          (a, b) =>
            (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (position.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return { videos };
    });
  },
  subscribe(onChange) {
    return useVideoStore.subscribe((state, prev) => {
      if (state.videos !== prev.videos) onChange();
    });
  },
};

// ---------------------------------------------------------------------------
// TV codec
// ---------------------------------------------------------------------------

const tvCodec: SyncCodec = {
  namespace: "tv",
  collect() {
    const docs = new Map<string, unknown>();
    const tvState = useTvStore.getState();
    for (const channel of tvState.customChannels) {
      if (channel?.id) {
        docs.set(`tv/channel:${channel.id}`, channel);
      }
    }
    docs.set("tv/prefs", {
      hiddenDefaultChannelIds: tvState.hiddenDefaultChannelIds,
      hiddenDefaultChannelIdsUpdatedAt: tvState.hiddenDefaultChannelIdsUpdatedAt,
      hiddenDefaultChannelIdsResetAt: tvState.hiddenDefaultChannelIdsResetAt,
      lcdFilterOn: tvState.lcdFilterOn,
      closedCaptionsOn: tvState.closedCaptionsOn,
    });
    return docs;
  },
  apply(ops) {
    const upserts = new Map<string, CustomChannel>();
    const deletes = new Set<string>();
    let prefs: Record<string, unknown> | null = null;

    for (const op of ops) {
      if (op.k.startsWith("tv/channel:")) {
        const id = op.k.slice("tv/channel:".length);
        if (op.del) {
          deletes.add(id);
        } else if (asRecord(op.v)) {
          upserts.set(id, op.v as CustomChannel);
        }
      } else if (op.k === "tv/prefs" && !op.del) {
        prefs = asRecord(op.v);
      }
    }

    useTvStore.setState((state) => {
      const byId = new Map(state.customChannels.map((channel) => [channel.id, channel]));
      for (const id of deletes) {
        byId.delete(id);
      }
      for (const [id, channel] of upserts) {
        byId.set(id, channel);
      }
      return {
        customChannels: Array.from(byId.values()),
        ...(prefs
          ? {
              hiddenDefaultChannelIds: Array.isArray(prefs.hiddenDefaultChannelIds)
                ? (prefs.hiddenDefaultChannelIds as string[])
                : state.hiddenDefaultChannelIds,
              hiddenDefaultChannelIdsUpdatedAt:
                typeof prefs.hiddenDefaultChannelIdsUpdatedAt === "string"
                  ? prefs.hiddenDefaultChannelIdsUpdatedAt
                  : null,
              hiddenDefaultChannelIdsResetAt:
                typeof prefs.hiddenDefaultChannelIdsResetAt === "string"
                  ? prefs.hiddenDefaultChannelIdsResetAt
                  : null,
              lcdFilterOn: prefs.lcdFilterOn !== false,
              closedCaptionsOn: prefs.closedCaptionsOn !== false,
            }
          : {}),
      };
    });
  },
  subscribe(onChange) {
    return useTvStore.subscribe((state, prev) => {
      if (
        state.customChannels !== prev.customChannels ||
        state.hiddenDefaultChannelIds !== prev.hiddenDefaultChannelIds ||
        state.hiddenDefaultChannelIdsUpdatedAt !==
          prev.hiddenDefaultChannelIdsUpdatedAt ||
        state.hiddenDefaultChannelIdsResetAt !== prev.hiddenDefaultChannelIdsResetAt ||
        state.lcdFilterOn !== prev.lcdFilterOn ||
        state.closedCaptionsOn !== prev.closedCaptionsOn
      ) {
        if (!useTvStore.persist.hasHydrated()) return;
        onChange();
      }
    });
  },
  isReady() {
    return useTvStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Stickies codec
// ---------------------------------------------------------------------------

const stickiesCodec: SyncCodec = {
  namespace: "stickies",
  collect() {
    const docs = new Map<string, unknown>();
    for (const note of useStickiesStore.getState().notes) {
      if (note?.id) {
        docs.set(`stickies/note:${note.id}`, note);
      }
    }
    return docs;
  },
  apply(ops) {
    const upserts = new Map<string, StickyNote>();
    const deletes = new Set<string>();
    for (const op of ops) {
      if (!op.k.startsWith("stickies/note:")) continue;
      const id = op.k.slice("stickies/note:".length);
      if (op.del) {
        deletes.add(id);
      } else if (asRecord(op.v)) {
        upserts.set(id, op.v as StickyNote);
      }
    }

    useStickiesStore.setState((state) => {
      const byId = new Map(state.notes.map((note) => [note.id, note]));
      for (const id of deletes) {
        byId.delete(id);
      }
      for (const [id, note] of upserts) {
        byId.set(id, note);
      }
      return { notes: Array.from(byId.values()) };
    });
  },
  subscribe(onChange) {
    return useStickiesStore.subscribe((state, prev) => {
      if (state.notes !== prev.notes) {
        if (!useStickiesStore.persist.hasHydrated()) return;
        onChange();
      }
    });
  },
  isReady() {
    return useStickiesStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Calendar codec
// ---------------------------------------------------------------------------

const calendarCodec: SyncCodec = {
  namespace: "calendar",
  collect() {
    const docs = new Map<string, unknown>();
    const state = useCalendarStore.getState();
    for (const event of state.events) {
      if (event?.id) docs.set(`calendar/event:${event.id}`, event);
    }
    for (const calendar of state.calendars) {
      if (calendar?.id) docs.set(`calendar/cal:${calendar.id}`, calendar);
    }
    for (const todo of state.todos) {
      if (todo?.id) docs.set(`calendar/todo:${todo.id}`, todo);
    }
    return docs;
  },
  apply(ops) {
    type Item = { id: string };
    const collections: Record<
      string,
      { upserts: Map<string, Item>; deletes: Set<string> }
    > = {
      "calendar/event:": { upserts: new Map(), deletes: new Set() },
      "calendar/cal:": { upserts: new Map(), deletes: new Set() },
      "calendar/todo:": { upserts: new Map(), deletes: new Set() },
    };

    for (const op of ops) {
      for (const prefix of Object.keys(collections)) {
        if (!op.k.startsWith(prefix)) continue;
        const id = op.k.slice(prefix.length);
        if (op.del) {
          collections[prefix].deletes.add(id);
        } else if (asRecord(op.v)) {
          collections[prefix].upserts.set(id, op.v as Item);
        }
        break;
      }
    }

    useCalendarStore.setState((state) => {
      const mergeCollection = <T extends Item>(
        items: T[],
        prefix: string
      ): T[] => {
        const { upserts, deletes } = collections[prefix];
        if (upserts.size === 0 && deletes.size === 0) return items;
        const byId = new Map(items.map((item) => [item.id, item]));
        for (const id of deletes) byId.delete(id);
        for (const [id, item] of upserts) byId.set(id, item as T);
        return Array.from(byId.values());
      };

      return {
        events: mergeCollection(state.events, "calendar/event:"),
        calendars: mergeCollection(state.calendars, "calendar/cal:"),
        todos: mergeCollection(state.todos, "calendar/todo:"),
      };
    });
  },
  subscribe(onChange) {
    return useCalendarStore.subscribe((state, prev) => {
      if (
        state.events !== prev.events ||
        state.calendars !== prev.calendars ||
        state.todos !== prev.todos
      ) {
        if (!useCalendarStore.persist.hasHydrated()) return;
        onChange();
      }
    });
  },
  isReady() {
    return useCalendarStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Contacts codec
// ---------------------------------------------------------------------------

const contactsCodec: SyncCodec = {
  namespace: "contacts",
  collect() {
    const docs = new Map<string, unknown>();
    const state = useContactsStore.getState();
    for (const contact of state.contacts) {
      if (contact?.id) docs.set(`contacts/contact:${contact.id}`, contact);
    }
    docs.set("contacts/me", { myContactId: state.myContactId ?? null });
    return docs;
  },
  apply(ops) {
    type Contact = { id: string };
    const upserts = new Map<string, Contact>();
    const deletes = new Set<string>();
    let myContactId: string | null | undefined;

    for (const op of ops) {
      if (op.k.startsWith("contacts/contact:")) {
        const id = op.k.slice("contacts/contact:".length);
        if (op.del) {
          deletes.add(id);
        } else if (asRecord(op.v)) {
          upserts.set(id, op.v as Contact);
        }
      } else if (op.k === "contacts/me" && !op.del) {
        const doc = asRecord(op.v);
        if (doc && "myContactId" in doc) {
          myContactId =
            typeof doc.myContactId === "string" ? doc.myContactId : null;
        }
      }
    }

    const state = useContactsStore.getState();
    const byId = new Map(state.contacts.map((contact) => [contact.id, contact]));
    for (const id of deletes) byId.delete(id);
    for (const [id, contact] of upserts) byId.set(id, contact as never);
    state.replaceContactsFromSync(
      Array.from(byId.values()),
      myContactId !== undefined ? myContactId : state.myContactId
    );
  },
  subscribe(onChange) {
    return useContactsStore.subscribe((state, prev) => {
      if (state.contacts !== prev.contacts || state.myContactId !== prev.myContactId) {
        if (!useContactsStore.persist.hasHydrated()) return;
        onChange();
      }
    });
  },
  isReady() {
    return useContactsStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Maps codec
// ---------------------------------------------------------------------------

const mapsCodec: SyncCodec = {
  namespace: "maps",
  collect() {
    const docs = new Map<string, unknown>();
    const state = useMapsStore.getState();
    if (state.home) docs.set("maps/home", state.home);
    if (state.work) docs.set("maps/work", state.work);
    for (const favorite of state.favorites) {
      if (favorite?.id) docs.set(`maps/favorite:${favorite.id}`, favorite);
    }
    return docs;
  },
  apply(ops) {
    type Place = { id: string };
    const state = useMapsStore.getState();
    let home = state.home;
    let work = state.work;
    const byId = new Map(state.favorites.map((favorite) => [favorite.id, favorite]));

    for (const op of ops) {
      if (op.k === "maps/home") {
        home = op.del ? null : ((op.v as never) ?? home);
      } else if (op.k === "maps/work") {
        work = op.del ? null : ((op.v as never) ?? work);
      } else if (op.k.startsWith("maps/favorite:")) {
        const id = op.k.slice("maps/favorite:".length);
        if (op.del) {
          byId.delete(id);
        } else if (asRecord(op.v)) {
          byId.set(id, op.v as never);
        }
      }
    }

    state.replaceFromSync({
      home,
      work,
      favorites: Array.from(byId.values()) as Place[] as never,
    });
  },
  subscribe(onChange) {
    return useMapsStore.subscribe((state, prev) => {
      // recents are intentionally device-local; only home/work/favorites sync.
      if (
        state.home !== prev.home ||
        state.work !== prev.work ||
        state.favorites !== prev.favorites
      ) {
        if (!useMapsStore.persist.hasHydrated()) return;
        onChange();
      }
    });
  },
  isReady() {
    return useMapsStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Blob codecs (images / trash / applets / wallpapers)
// ---------------------------------------------------------------------------

async function finalizeCustomWallpaperSync(ctx: CodecContext): Promise<void> {
  const db = requireDb(ctx, "wallpapers");
  const remoteKeys = new Set(
    (await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)).map((item) => item.key)
  );
  const displayStore = useDisplaySettingsStore.getState();
  const current = displayStore.currentWallpaper;

  if (current?.startsWith("indexeddb://")) {
    const id = current.substring("indexeddb://".length);
    if (remoteKeys.has(id)) {
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

function createBlobCodec(
  namespace: "images" | "trash" | "applets" | "wallpapers",
  storeName: string,
  options?: { afterApply?: (ctx: CodecContext) => Promise<void> }
): BlobSyncCodec {
  return {
    namespace,
    usesIndexedDb: true,
    storeName,
    async collect(ctx) {
      // Blob codec collect returns serialized items keyed by sync key; the
      // engine converts them to `{ blob: ref }` docs after content upload.
      const db = requireDb(ctx, namespace);
      const items = await serializeStoreItems(await readStoreItems(db, storeName));
      const docs = new Map<string, unknown>();
      for (const item of items) {
        if (item.key) {
          docs.set(`${namespace}/item:${item.key}`, item);
        }
      }
      return docs;
    },
    async putItems(items, ctx) {
      const db = requireDb(ctx, namespace);
      await upsertStoreItems(db, storeName, items);
    },
    async deleteItems(keys, ctx) {
      const db = requireDb(ctx, namespace);
      await deleteStoreItemsByKey(db, storeName, keys);
    },
    ...(options?.afterApply ? { afterApply: options.afterApply } : {}),
    // The engine routes blob ops through putItems/deleteItems after
    // downloading content; apply only handles the store-level side effects.
    async apply() {
      // handled by the engine via putItems/deleteItems
    },
    subscribe() {
      // Blob namespaces have no zustand store; dirtiness is signaled via
      // explicit cloud sync events from useFileSystem / display settings.
      return () => {};
    },
  };
}

const imagesCodec = createBlobCodec("images", STORES.IMAGES);
const trashCodec = createBlobCodec("trash", STORES.TRASH);
const appletsCodec = createBlobCodec("applets", STORES.APPLETS);
const wallpapersCodec = createBlobCodec("wallpapers", STORES.CUSTOM_WALLPAPERS, {
  afterApply: finalizeCustomWallpaperSync,
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SYNC_CODECS: Record<SyncNamespace, SyncCodec> = {
  settings: settingsCodec,
  files: filesCodec,
  songs: songsCodec,
  videos: videosCodec,
  tv: tvCodec,
  stickies: stickiesCodec,
  calendar: calendarCodec,
  contacts: contactsCodec,
  maps: mapsCodec,
  images: imagesCodec,
  trash: trashCodec,
  applets: appletsCodec,
  wallpapers: wallpapersCodec,
};

export function isBlobCodec(codec: SyncCodec): codec is BlobSyncCodec {
  return "putItems" in codec;
}

/**
 * Namespace apply order within a batch: wallpapers before settings so
 * indexeddb:// wallpaper references resolve during the same sync pass.
 */
export const NAMESPACE_APPLY_ORDER: SyncNamespace[] = [
  "wallpapers",
  "images",
  "trash",
  "applets",
  "settings",
  "files",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
];
