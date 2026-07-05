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
import { useTimezoneStore } from "@/stores/useTimezoneStore";
import {
  DEFAULT_WALLPAPER_PATH,
  useDisplaySettingsStore,
} from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import {
  sanitizeRomanizationSettings,
  useIpodStore,
} from "@/stores/useIpodStore";
import type { Track } from "@/shared/media/library";
import { sortTracksLikeServerOrder } from "@/stores/ipodTrackOrder";
import { useVideoStore, type Video } from "@/stores/useVideoStore";
import { useTvStore, type CustomChannel } from "@/stores/useTvStore";
import { useDockStore } from "@/stores/useDockStore";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useStickiesStore, type StickyNote } from "@/stores/useStickiesStore";
import { useAssistantStore } from "@/stores/useAssistantStore";
import { useCalendarStore } from "@/stores/useCalendarStore";
import { useContactsStore } from "@/stores/useContactsStore";
import { useMapsStore } from "@/stores/useMapsStore";
import {
  BOOKS_FONT_SIZE_MAX,
  BOOKS_FONT_SIZE_MIN,
  BOOKS_GUTTER_MAX,
  BOOKS_GUTTER_MIN,
  BOOKS_SPEECH_RATE_MAX,
  BOOKS_SPEECH_RATE_MIN,
  clampBooksLineHeight,
  isBooksCustomHexColor,
  isBooksThemeOverride,
  normalizeBooksCustomColor,
  useBooksStore,
  type BookProgress,
  type BooksReaderSettings,
} from "@/stores/useBooksStore";
import {
  useCloudSyncStore,
  type CloudSyncDeletionBucket,
} from "@/stores/useCloudSyncStore";
import { areRomanizationSettingsEqual } from "@/types/lyrics";
import {
  deserializeStoreItem,
  readAndSerializeStoreItemsByKeys,
  readStoreItems,
  readStoreItemsByKeys,
  serializeStoreItems,
  type IndexedDBStoreItemWithKey as StoreItemWithKey,
} from "@/utils/indexedDBBackup";
import type { SyncNamespace } from "@/shared/sync2/namespaces";
import { emitDocumentContentSynced } from "@/utils/appEventBus";

export interface AppliedSyncOp {
  k: string;
  v?: unknown;
  del?: boolean;
  t: string;
}

export interface CodecContext {
  db?: IDBDatabase;
}

export interface SyncApplyResult {
  /**
   * Keys whose remote op the codec declined to apply because a newer local
   * value won an app-level merge (e.g. bookshelf progress `updatedAt` LWW).
   * The engine re-marks the namespace dirty for these keys so the local
   * winner is re-uploaded and peers re-converge — otherwise the shadow would
   * silently record the stale remote value and the divergence would persist
   * until some unrelated mutation in the namespace happened to flush.
   */
  rejectedKeys?: string[];
}

export interface SyncCodec {
  namespace: SyncNamespace;
  usesIndexedDb?: boolean;
  /** Local state as key → document. */
  collect(
    ctx: CodecContext,
    keys?: ReadonlySet<string>
  ): Promise<Map<string, unknown>> | Map<string, unknown>;
  /**
   * Apply remote ops onto local stores. May return a {@link SyncApplyResult}
   * to tell the engine which ops were rejected by an app-level merge.
   */
  apply(
    ops: AppliedSyncOp[],
    ctx: CodecContext
  ): Promise<void | SyncApplyResult> | void | SyncApplyResult;
  /** Subscribe to local changes; invoke onChange to mark the namespace dirty. */
  subscribe(onChange: (keys?: Iterable<string>) => void): () => void;
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
  fileBookKeys: "books/item:",
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
      return markers[bucket]?.[key.slice(prefix.length)] ?? null;
    }
  }
  return null;
}

export function clearDeletionMarkersForKeys(keys: Iterable<string>): number {
  const idsByBucket = new Map<CloudSyncDeletionBucket, Set<string>>();
  let clearedCount = 0;
  for (const key of keys) {
    for (const [bucket, prefix] of Object.entries(
      DELETION_BUCKET_PREFIXES
    ) as Array<[CloudSyncDeletionBucket, string]>) {
      if (!key.startsWith(prefix)) continue;
      const ids = idsByBucket.get(bucket) ?? new Set<string>();
      ids.add(key.slice(prefix.length));
      idsByBucket.set(bucket, ids);
      break;
    }
  }

  const store = useCloudSyncStore.getState();
  for (const [bucket, ids] of idsByBucket) {
    const markers = store.deletionMarkers[bucket] ?? {};
    const presentIds = [...ids].filter((id) => id in markers);
    if (presentIds.length === 0) continue;
    store.clearDeletedKeys(bucket, presentIds);
    clearedCount += presentIds.length;
  }
  return clearedCount;
}

export function pruneDeletionMarkersWithoutShadow(
  shadowKeys: ReadonlySet<string>
): number {
  const store = useCloudSyncStore.getState();
  let prunedCount = 0;
  for (const [bucket, prefix] of Object.entries(DELETION_BUCKET_PREFIXES) as Array<
    [CloudSyncDeletionBucket, string]
  >) {
    const staleIds = Object.keys(store.deletionMarkers[bucket] ?? {}).filter(
      (id) => !shadowKeys.has(`${prefix}${id}`)
    );
    if (staleIds.length === 0) continue;
    store.clearDeletedKeys(bucket, staleIds);
    prunedCount += staleIds.length;
  }
  return prunedCount;
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
  const restoredItems = await Promise.all(
    items.map(async (item) => ({
      key: item.key,
      value: await prepareStoreValueForWrite(storeName, deserializeStoreItem(item)),
    }))
  );
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));
    try {
      for (const item of restoredItems) {
        store.put(item.value, item.key);
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

function prepareStoreItemForSync(
  storeName: string,
  item: StoreItemWithKey
): StoreItemWithKey {
  if (storeName === STORES.BOOKS && item.value.content instanceof ArrayBuffer) {
    return {
      key: item.key,
      value: {
        ...item.value,
        content: new Blob([item.value.content], {
          type: "application/epub+zip",
        }),
      },
    };
  }
  return item;
}

async function prepareStoreValueForWrite(
  storeName: string,
  value: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (storeName === STORES.BOOKS && value.content instanceof Blob) {
    return {
      ...value,
      content: await value.content.arrayBuffer(),
    };
  }
  return value;
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
//
// Each settings field is its own sync key (`settings/<section>/<field>`) so
// concurrent edits to different fields of the same section merge under
// per-key LWW instead of one section-level write clobbering the other.
//
// ---------------------------------------------------------------------------

interface SettingsField {
  /** Field name. */
  field: string;
  /** Current value from the store (always defined; absent → null). */
  read(): unknown;
  /**
   * Apply a remote value onto the backing store. The return value is always
   * discarded (callers `await` it), so it is typed loosely to accommodate the
   * varied `setState`/setter return types across stores.
   */
  write(value: unknown): unknown;
}

interface SettingsSection {
  section: string;
  fields: SettingsField[];
}

const SETTINGS_KEY_PREFIX = "settings/";

const SETTINGS_SCHEMA: SettingsSection[] = [
  {
    section: "theme",
    fields: [
      {
        field: "current",
        read: () => useThemeStore.getState().current,
        write: (v) => {
          if (typeof v === "string") useThemeStore.getState().setTheme(v as never);
        },
      },
      {
        field: "darkMode",
        read: () => useThemeStore.getState().darkModeByTheme,
        write: (v) => {
          const map = asRecord(v);
          if (!map) return;
          for (const [themeId, value] of Object.entries(map)) {
            useThemeStore.getState().setDarkMode(value as never, themeId as never);
          }
        },
      },
      {
        field: "accent",
        read: () => useThemeStore.getState().accentByTheme,
        write: (v) => {
          const map = asRecord(v);
          if (!map) return;
          for (const [themeId, value] of Object.entries(map)) {
            useThemeStore.getState().setAccent(value as never, themeId as never);
          }
        },
      },
      {
        field: "aquaMaterial",
        read: () => useThemeStore.getState().aquaMaterial,
        write: (v) => {
          if (v === "classic" || v === "glass") {
            useThemeStore.getState().setAquaMaterial(v);
          }
        },
      },
      {
        field: "systemFont",
        read: () => useThemeStore.getState().systemFont,
        write: (v) => {
          if (typeof v === "string" && v) {
            useThemeStore.getState().setSystemFont(v as never);
          }
        },
      },
    ],
  },
  {
    section: "language",
    fields: [
      {
        field: "current",
        read: () => useLanguageStore.getState().current,
        write: async (v) => {
          if (typeof v === "string") {
            await useLanguageStore.getState().setLanguage(v as never);
          }
        },
      },
      {
        field: "initialized",
        read: () =>
          typeof localStorage !== "undefined" &&
          localStorage.getItem("ryos:language-initialized") === "true",
        write: (v) => {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(
              "ryos:language-initialized",
              v === true ? "true" : "false"
            );
          }
        },
      },
      {
        field: "timezone",
        read: () => useTimezoneStore.getState().timezone,
        write: (v) => {
          if (typeof v === "string" && v) {
            useTimezoneStore.getState().setTimezone(v);
          }
        },
      },
    ],
  },
  {
    section: "display",
    fields: [
      {
        field: "displayMode",
        read: () => useDisplaySettingsStore.getState().displayMode,
        write: (v) => useDisplaySettingsStore.setState({ displayMode: v as never }),
      },
      {
        field: "shaderEffectEnabled",
        read: () => useDisplaySettingsStore.getState().shaderEffectEnabled,
        write: (v) =>
          useDisplaySettingsStore.setState({ shaderEffectEnabled: Boolean(v) }),
      },
      {
        field: "selectedShaderType",
        read: () => useDisplaySettingsStore.getState().selectedShaderType,
        write: (v) =>
          useDisplaySettingsStore.setState({ selectedShaderType: v as never }),
      },
      {
        field: "currentWallpaper",
        read: () => useDisplaySettingsStore.getState().currentWallpaper,
        write: async (v) => {
          if (typeof v === "string" && v) {
            await useDisplaySettingsStore.getState().setWallpaper(v);
          }
        },
      },
      {
        field: "screenSaverEnabled",
        read: () => useDisplaySettingsStore.getState().screenSaverEnabled,
        write: (v) =>
          useDisplaySettingsStore.setState({ screenSaverEnabled: Boolean(v) }),
      },
      {
        field: "screenSaverType",
        read: () => useDisplaySettingsStore.getState().screenSaverType,
        write: (v) =>
          useDisplaySettingsStore.setState({ screenSaverType: v as never }),
      },
      {
        field: "screenSaverIdleTime",
        read: () => useDisplaySettingsStore.getState().screenSaverIdleTime,
        write: (v) =>
          useDisplaySettingsStore.setState({ screenSaverIdleTime: v as never }),
      },
      {
        field: "debugMode",
        read: () => useDisplaySettingsStore.getState().debugMode,
        write: (v) => useDisplaySettingsStore.setState({ debugMode: Boolean(v) }),
      },
      {
        field: "showResizers",
        read: () => useDisplaySettingsStore.getState().showResizers,
        write: (v) =>
          useDisplaySettingsStore.setState({ showResizers: Boolean(v) }),
      },
      {
        field: "htmlPreviewSplit",
        read: () => useDisplaySettingsStore.getState().htmlPreviewSplit,
        write: (v) =>
          useDisplaySettingsStore.setState({ htmlPreviewSplit: Boolean(v) }),
      },
    ],
  },
  {
    section: "audio",
    fields: [
      ...(
        [
          "masterVolume",
          "uiVolume",
          "chatSynthVolume",
          "speechVolume",
          "ipodVolume",
          "ttsModel",
          "ttsVoice",
          "synthPreset",
        ] as const
      ).map((field) => ({
        field,
        read: () => useAudioSettingsStore.getState()[field],
        write: (v: unknown) =>
          useAudioSettingsStore.setState({ [field]: v } as never),
      })),
      ...(
        [
          "uiSoundsEnabled",
          "terminalSoundsEnabled",
          "typingSynthEnabled",
          "speechEnabled",
          "keepTalkingEnabled",
        ] as const
      ).map((field) => ({
        field,
        read: () => useAudioSettingsStore.getState()[field],
        write: (v: unknown) =>
          useAudioSettingsStore.setState({ [field]: Boolean(v) } as never),
      })),
    ],
  },
  {
    section: "ai",
    fields: [
      {
        field: "model",
        read: () => useAppStore.getState().aiModel ?? null,
        write: (v) => useAppStore.getState().setAiModel(v as never),
      },
    ],
  },
  {
    section: "ipod",
    fields: [
      {
        field: "displayMode",
        read: () => useIpodStore.getState().displayMode,
        write: (v) => useIpodStore.setState({ displayMode: v as never }),
      },
      {
        field: "showLyrics",
        read: () => useIpodStore.getState().showLyrics,
        write: (v) => useIpodStore.setState({ showLyrics: Boolean(v) }),
      },
      {
        field: "lyricsAlignment",
        read: () => useIpodStore.getState().lyricsAlignment,
        write: (v) => useIpodStore.setState({ lyricsAlignment: v as never }),
      },
      {
        field: "lyricsFont",
        read: () => useIpodStore.getState().lyricsFont,
        write: (v) => useIpodStore.setState({ lyricsFont: v as never }),
      },
      {
        field: "romanization",
        read: () => useIpodStore.getState().romanization,
        write: (v) =>
          useIpodStore.setState({
            romanization: sanitizeRomanizationSettings(v),
          }),
      },
      {
        field: "lyricsTranslationLanguage",
        read: () => useIpodStore.getState().lyricsTranslationLanguage ?? null,
        write: (v) =>
          useIpodStore.setState({
            lyricsTranslationLanguage: (v ?? null) as never,
          }),
      },
      {
        field: "theme",
        read: () => useIpodStore.getState().theme,
        write: (v) => useIpodStore.setState({ theme: v as never }),
      },
      {
        field: "lcdFilterOn",
        read: () => useIpodStore.getState().lcdFilterOn,
        write: (v) => useIpodStore.setState({ lcdFilterOn: Boolean(v) }),
      },
    ],
  },
  {
    section: "dock",
    fields: (["pinnedItems", "scale", "hiding", "magnification"] as const).map(
      (field) => ({
        field,
        read: () => useDockStore.getState()[field],
        write: (v: unknown) => useDockStore.setState({ [field]: v } as never),
      })
    ),
  },
  {
    section: "dashboard",
    fields: [
      {
        field: "widgets",
        read: () => useDashboardStore.getState().widgets,
        write: (v) => {
          if (Array.isArray(v)) useDashboardStore.setState({ widgets: v as never });
        },
      },
    ],
  },
  {
    // Desktop assistant preferences. Device-local state (dragged position,
    // conversation messages, bubble/interaction timestamps) intentionally
    // does not sync.
    section: "assistant",
    fields: [
      {
        field: "enabled",
        read: () => useAssistantStore.getState().enabled,
        write: (v) => useAssistantStore.getState().setEnabled(Boolean(v)),
      },
      {
        field: "characterId",
        read: () => useAssistantStore.getState().characterId,
        write: (v) => {
          // Accept any non-empty string: a newer app version may sync a
          // character this build doesn't ship; rendering falls back to the
          // default via getAssistantCharacter.
          if (typeof v === "string" && v) {
            useAssistantStore.getState().setCharacterId(v as never);
          }
        },
      },
      {
        field: "speechEnabled",
        read: () => useAssistantStore.getState().speechEnabled,
        write: (v) => useAssistantStore.getState().setSpeechEnabled(Boolean(v)),
      },
      {
        field: "greetOnSummon",
        read: () => useAssistantStore.getState().greetOnSummon,
        write: (v) => useAssistantStore.getState().setGreetOnSummon(Boolean(v)),
      },
      {
        field: "responseStyle",
        read: () => useAssistantStore.getState().responseStyle,
        write: (v) => {
          // setResponseStyle normalizes unknown synced values to the default.
          if (typeof v === "string") {
            useAssistantStore.getState().setResponseStyle(v as never);
          }
        },
      },
      {
        field: "customInstructions",
        read: () => useAssistantStore.getState().customInstructions,
        write: (v) => {
          if (typeof v === "string") {
            useAssistantStore.getState().setCustomInstructions(v);
          }
        },
      },
    ],
  },
];

const SETTINGS_SECTIONS_BY_NAME = new Map(
  SETTINGS_SCHEMA.map((section) => [
    section.section,
    {
      section,
      fieldsByName: new Map(section.fields.map((f) => [f.field, f])),
    },
  ])
);

function settingsFieldKey(section: string, field: string): string {
  return `${SETTINGS_KEY_PREFIX}${section}/${field}`;
}

function parseSettingsKey(
  key: string
): { section: string; field: string } | null {
  if (!key.startsWith(SETTINGS_KEY_PREFIX)) return null;
  const rest = key.slice(SETTINGS_KEY_PREFIX.length);
  if (!rest) return null;
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  return { section: rest.slice(0, slash), field: rest.slice(slash + 1) };
}

function collectSettings(): Map<string, unknown> {
  const docs = new Map<string, unknown>();
  for (const section of SETTINGS_SCHEMA) {
    for (const f of section.fields) {
      docs.set(settingsFieldKey(section.section, f.field), f.read());
    }
  }
  return docs;
}

async function applySettingsOp(op: AppliedSyncOp): Promise<void> {
  const parsed = parseSettingsKey(op.k);
  if (!parsed) return;
  const entry = SETTINGS_SECTIONS_BY_NAME.get(parsed.section);
  if (!entry) return;

  if (op.del) return; // settings fields are never deleted
  const field = entry.fieldsByName.get(parsed.field);
  if (!field) return;
  await field.write(op.v);
}

const settingsCodec: SyncCodec = {
  namespace: "settings",
  collect: collectSettings,
  async apply(ops) {
    const sorted = [...ops].sort((a, b) =>
      a.t < b.t ? -1 : a.t > b.t ? 1 : 0
    );
    for (const op of sorted) {
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
      useTimezoneStore.subscribe((state, prev) => {
        if (state.timezone !== prev.timezone) onChange();
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
          state.showResizers !== prev.showResizers ||
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
          if (!useIpodStore.persist.hasHydrated()) return;
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
      useAssistantStore.subscribe((state, prev) => {
        if (
          state.enabled !== prev.enabled ||
          state.characterId !== prev.characterId ||
          state.speechEnabled !== prev.speechEnabled
        ) {
          onChange();
        }
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  },
  isReady() {
    return useIpodStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Files codec (metadata + TextEdit document contents)
// ---------------------------------------------------------------------------

const filesCodec: SyncCodec = {
  namespace: "files",
  usesIndexedDb: true,
  async collect(ctx, keys) {
    const docs = new Map<string, unknown>();
    const filesState = useFilesStore.getState();

    for (const [path, item] of Object.entries(filesState.items)) {
      if (!path) continue;
      docs.set(`files/item:${path}`, item);
    }
    docs.set("files/lib", { libraryState: filesState.libraryState });

    const db = requireDb(ctx, "files");
    const documentPrefix = "files/doc:";
    const documentKeys = keys
      ? [...keys]
          .filter((key) => key.startsWith(documentPrefix))
          .map((key) => key.slice(documentPrefix.length))
      : null;
    const documents = documentKeys
      ? await readAndSerializeStoreItemsByKeys(
          db,
          STORES.DOCUMENTS,
          documentKeys
        )
      : await serializeStoreItems(await readStoreItems(db, STORES.DOCUMENTS));
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

      // Notify open editors (e.g. TextEdit) that document content changed in
      // storage so they can reactively merge the update without losing the
      // user's caret. Map the upserted content keys (file UUIDs) back to paths.
      if (docUpserts.length > 0) {
        const items = useFilesStore.getState().items;
        const uuidToPath = new Map<string, string>();
        for (const [path, item] of Object.entries(items)) {
          if (item?.uuid) {
            uuidToPath.set(item.uuid, path);
          }
        }
        const changedPaths: string[] = [];
        for (const doc of docUpserts) {
          const path = doc.key ? uuidToPath.get(doc.key) : undefined;
          if (path) {
            changedPaths.push(path);
          }
        }
        if (changedPaths.length > 0) {
          emitDocumentContentSynced({ paths: changedPaths });
        }
      }
    }
  },
  subscribe(onChange) {
    return useFilesStore.subscribe((state, prev) => {
      if (state.libraryState !== prev.libraryState) {
        onChange();
        return;
      }
      if (state.items !== prev.items) {
        const paths = new Set([
          ...Object.keys(state.items),
          ...Object.keys(prev.items),
        ]);
        const changedKeys = new Set<string>();
        for (const path of paths) {
          if (state.items[path] !== prev.items[path]) {
            changedKeys.add(`files/item:${path}`);
          }
        }
        if (changedKeys.size > 0) onChange(changedKeys);
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
        if (!useIpodStore.persist.hasHydrated()) return;
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
  isReady() {
    return useIpodStore.persist.hasHydrated();
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
      if (state.videos !== prev.videos) {
        if (!useVideoStore.persist.hasHydrated()) return;
        onChange();
      }
    });
  },
  isReady() {
    return useVideoStore.persist.hasHydrated();
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
// Bookshelf codec (Books app reading state: progress + ordering + last-opened)
//
// The EPUB *files* sync via the `books` blob namespace (under the "files"
// category). This codec owns the lightweight per-book reading state held in
// useBooksStore so it can sync independently of the large file blobs.
//
// Keys:
//   bookshelf/progress:<path> — { cfi, percentage, updatedAt } per book
//   bookshelf/order           — { pinnedTop, pinnedBottom } shelf ordering
//   bookshelf/last-opened     — { path } most recently opened book
//
// Reading progress reconciles per book with `updatedAt`-aware last-writer-wins
// on apply (a stale remote op never clobbers newer local progress), layered on
// top of the engine's per-key timestamp LWW. Reader preferences sync through
// the separate `books-settings` namespace. `shelfView` and `openPath` remain
// device-local (reopen this device's last reader/shelf session).
//
// Deleting a book: `useBooksLogic.deleteBook` calls `useBooksStore.removeBook`,
// which drops the book's `progress` entry and prunes it from the order. On the
// next flush, `collect` no longer emits `bookshelf/progress:<path>`, so the
// engine's shadow diff infers the removal and uploads a tombstone (`del`) that
// removes the key on peers. The `order`/`last-opened` docs are singletons that
// always exist and simply update. Like the structurally identical `videos`
// namespace (per-item keys + a singleton order doc), `bookshelf` has no
// dedicated deletion-marker bucket: single-book deletes are never "suspicious"
// (see the mass-delete guard in the engine), so shadow-diff tombstoning is
// sufficient and a tombstone bucket would be over-engineering.
// ---------------------------------------------------------------------------

const bookshelfCodec: SyncCodec = {
  namespace: "bookshelf",
  collect() {
    const docs = new Map<string, unknown>();
    const state = useBooksStore.getState();
    for (const [path, progress] of Object.entries(state.progressByPath)) {
      if (!path || !progress) continue;
      docs.set(`bookshelf/progress:${path}`, progress);
    }
    docs.set("bookshelf/order", {
      pinnedTop: state.pinnedTop,
      pinnedBottom: state.pinnedBottom,
    });
    docs.set("bookshelf/last-opened", { path: state.lastOpenedPath ?? null });
    return docs;
  },
  apply(ops) {
    const progressUpserts = new Map<string, BookProgress>();
    const progressDeletes = new Set<string>();
    let order: Record<string, unknown> | null = null;
    let lastOpened: string | null | undefined;

    for (const op of ops) {
      if (op.k.startsWith("bookshelf/progress:")) {
        const path = op.k.slice("bookshelf/progress:".length);
        if (op.del) {
          progressDeletes.add(path);
        } else if (asRecord(op.v)) {
          progressUpserts.set(path, op.v as BookProgress);
        }
      } else if (op.k === "bookshelf/order" && !op.del) {
        order = asRecord(op.v);
      } else if (op.k === "bookshelf/last-opened" && !op.del) {
        const doc = asRecord(op.v);
        if (doc && "path" in doc) {
          lastOpened = typeof doc.path === "string" ? doc.path : null;
        }
      }
    }

    // Progress keys the engine should treat as still-pending: the newer local
    // value won the updatedAt LWW, so the local progress must be re-uploaded
    // (the engine otherwise records the stale remote value in the shadow and
    // never re-propagates the winner — devices silently diverge).
    const rejectedKeys: string[] = [];

    useBooksStore.setState((state) => {
      let progressByPath = state.progressByPath;
      if (progressUpserts.size > 0 || progressDeletes.size > 0) {
        progressByPath = { ...state.progressByPath };
        for (const path of progressDeletes) {
          delete progressByPath[path];
        }
        for (const [path, incoming] of progressUpserts) {
          const existing = progressByPath[path];
          // updatedAt-aware LWW: keep the newer reading position so a stale
          // remote op (e.g. an offline device flushing old progress) can't
          // roll back fresher local progress.
          if (
            !existing ||
            (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)
          ) {
            progressByPath[path] = incoming;
          } else {
            rejectedKeys.push(`bookshelf/progress:${path}`);
          }
        }
      }

      const filterPaths = (value: unknown): string[] | null =>
        Array.isArray(value)
          ? value.filter((p): p is string => typeof p === "string")
          : null;

      const pinnedTop = order ? filterPaths(order.pinnedTop) : null;
      const pinnedBottom = order ? filterPaths(order.pinnedBottom) : null;

      return {
        progressByPath,
        pinnedTop: pinnedTop ?? state.pinnedTop,
        pinnedBottom: pinnedBottom ?? state.pinnedBottom,
        lastOpenedPath:
          lastOpened !== undefined ? lastOpened : state.lastOpenedPath,
      };
    });

    return rejectedKeys.length > 0 ? { rejectedKeys } : undefined;
  },
  subscribe(onChange) {
    return useBooksStore.subscribe((state, prev) => {
      if (
        state.progressByPath !== prev.progressByPath ||
        state.pinnedTop !== prev.pinnedTop ||
        state.pinnedBottom !== prev.pinnedBottom ||
        state.lastOpenedPath !== prev.lastOpenedPath
      ) {
        if (!useBooksStore.persist.hasHydrated()) return;
        onChange();
      }
    });
  },
  isReady() {
    return useBooksStore.persist.hasHydrated();
  },
};

// ---------------------------------------------------------------------------
// Books settings codec
//
// Each reader preference gets its own key so unrelated changes on different
// devices merge independently. This intentionally uses a namespace separate
// from `bookshelf`: older clients collect that namespace without these keys
// and would otherwise infer deletions when reading progress changes.
// ---------------------------------------------------------------------------

const BOOKS_SETTINGS_KEYS = {
  fontId: "books-settings/fontId",
  fontSizePct: "books-settings/fontSizePct",
  columnMode: "books-settings/columnMode",
  themeOverride: "books-settings/themeOverride",
  customThemeBackground: "books-settings/customThemeBackground",
  customThemeText: "books-settings/customThemeText",
  customThemeTransparent: "books-settings/customThemeTransparent",
  chineseScript: "books-settings/chineseScript",
  textLayout: "books-settings/textLayout",
  lineHeight: "books-settings/lineHeight",
  gutterPx: "books-settings/gutterPx",
  speechRate: "books-settings/speechRate",
} as const satisfies Record<keyof BooksReaderSettings, string>;

function collectBooksSettings(
  keys?: ReadonlySet<string>
): Map<string, unknown> {
  const docs = new Map<string, unknown>();
  const settings = useBooksStore.getState().settings;
  const add = (key: string, value: unknown) => {
    if (!keys || keys.has(key)) docs.set(key, value);
  };

  add(BOOKS_SETTINGS_KEYS.fontId, settings.fontId);
  add(BOOKS_SETTINGS_KEYS.fontSizePct, settings.fontSizePct);
  add(BOOKS_SETTINGS_KEYS.columnMode, settings.columnMode);
  add(BOOKS_SETTINGS_KEYS.themeOverride, settings.themeOverride);
  add(BOOKS_SETTINGS_KEYS.customThemeBackground, settings.customThemeBackground);
  add(BOOKS_SETTINGS_KEYS.customThemeText, settings.customThemeText);
  add(BOOKS_SETTINGS_KEYS.customThemeTransparent, settings.customThemeTransparent);
  add(BOOKS_SETTINGS_KEYS.chineseScript, settings.chineseScript);
  add(BOOKS_SETTINGS_KEYS.textLayout, settings.textLayout);
  add(BOOKS_SETTINGS_KEYS.lineHeight, settings.lineHeight);
  add(BOOKS_SETTINGS_KEYS.gutterPx, settings.gutterPx);
  add(BOOKS_SETTINGS_KEYS.speechRate, settings.speechRate);
  return docs;
}

function applyBooksSettings(ops: AppliedSyncOp[]): void {
  let updates: Partial<BooksReaderSettings> = {};

  for (const op of ops) {
    if (op.del) continue;

    switch (op.k) {
      case BOOKS_SETTINGS_KEYS.fontId:
        if (typeof op.v === "string" && op.v.length > 0) {
          updates = { ...updates, fontId: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.fontSizePct:
        if (
          typeof op.v === "number" &&
          Number.isFinite(op.v) &&
          op.v >= BOOKS_FONT_SIZE_MIN &&
          op.v <= BOOKS_FONT_SIZE_MAX
        ) {
          updates = { ...updates, fontSizePct: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.columnMode:
        if (op.v === "auto" || op.v === "single" || op.v === "double") {
          updates = { ...updates, columnMode: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.themeOverride:
        if (isBooksThemeOverride(op.v)) {
          updates = { ...updates, themeOverride: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.customThemeBackground:
        if (isBooksCustomHexColor(op.v)) {
          updates = {
            ...updates,
            customThemeBackground: normalizeBooksCustomColor(op.v, "#fdfdfb"),
          };
        }
        break;
      case BOOKS_SETTINGS_KEYS.customThemeText:
        if (isBooksCustomHexColor(op.v)) {
          updates = {
            ...updates,
            customThemeText: normalizeBooksCustomColor(op.v, "#1c1c1c"),
          };
        }
        break;
      case BOOKS_SETTINGS_KEYS.customThemeTransparent:
        if (typeof op.v === "boolean") {
          updates = { ...updates, customThemeTransparent: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.chineseScript:
        if (
          op.v === "original" ||
          op.v === "simplified" ||
          op.v === "traditional"
        ) {
          updates = { ...updates, chineseScript: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.textLayout:
        if (op.v === "book" || op.v === "vertical") {
          updates = { ...updates, textLayout: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.lineHeight:
        // Clamp instead of reject: devices on older app versions may still
        // sync values below the raised 1.5 floor.
        if (typeof op.v === "number" && Number.isFinite(op.v) && op.v > 0) {
          updates = { ...updates, lineHeight: clampBooksLineHeight(op.v) };
        }
        break;
      case BOOKS_SETTINGS_KEYS.gutterPx:
        if (
          typeof op.v === "number" &&
          Number.isFinite(op.v) &&
          op.v >= BOOKS_GUTTER_MIN &&
          op.v <= BOOKS_GUTTER_MAX
        ) {
          updates = { ...updates, gutterPx: op.v };
        }
        break;
      case BOOKS_SETTINGS_KEYS.speechRate:
        if (
          typeof op.v === "number" &&
          Number.isFinite(op.v) &&
          op.v >= BOOKS_SPEECH_RATE_MIN &&
          op.v <= BOOKS_SPEECH_RATE_MAX
        ) {
          updates = { ...updates, speechRate: op.v };
        }
        break;
    }
  }

  if (Object.keys(updates).length > 0) {
    useBooksStore.getState().updateSettings(updates);
  }
}

const booksSettingsCodec: SyncCodec = {
  namespace: "books-settings",
  collect(_ctx, keys) {
    return collectBooksSettings(keys);
  },
  apply(ops) {
    applyBooksSettings(ops);
  },
  subscribe(onChange) {
    return useBooksStore.subscribe((state, prev) => {
      const keys: string[] = [];
      if (state.settings.fontId !== prev.settings.fontId) {
        keys.push(BOOKS_SETTINGS_KEYS.fontId);
      }
      if (state.settings.fontSizePct !== prev.settings.fontSizePct) {
        keys.push(BOOKS_SETTINGS_KEYS.fontSizePct);
      }
      if (state.settings.columnMode !== prev.settings.columnMode) {
        keys.push(BOOKS_SETTINGS_KEYS.columnMode);
      }
      if (state.settings.themeOverride !== prev.settings.themeOverride) {
        keys.push(BOOKS_SETTINGS_KEYS.themeOverride);
      }
      if (
        state.settings.customThemeBackground !==
        prev.settings.customThemeBackground
      ) {
        keys.push(BOOKS_SETTINGS_KEYS.customThemeBackground);
      }
      if (state.settings.customThemeText !== prev.settings.customThemeText) {
        keys.push(BOOKS_SETTINGS_KEYS.customThemeText);
      }
      if (
        state.settings.customThemeTransparent !==
        prev.settings.customThemeTransparent
      ) {
        keys.push(BOOKS_SETTINGS_KEYS.customThemeTransparent);
      }
      if (state.settings.chineseScript !== prev.settings.chineseScript) {
        keys.push(BOOKS_SETTINGS_KEYS.chineseScript);
      }
      if (state.settings.textLayout !== prev.settings.textLayout) {
        keys.push(BOOKS_SETTINGS_KEYS.textLayout);
      }
      if (state.settings.lineHeight !== prev.settings.lineHeight) {
        keys.push(BOOKS_SETTINGS_KEYS.lineHeight);
      }
      if (state.settings.gutterPx !== prev.settings.gutterPx) {
        keys.push(BOOKS_SETTINGS_KEYS.gutterPx);
      }
      if (state.settings.speechRate !== prev.settings.speechRate) {
        keys.push(BOOKS_SETTINGS_KEYS.speechRate);
      }
      if (keys.length === 0 || !useBooksStore.persist.hasHydrated()) return;
      onChange(keys);
    });
  },
  isReady() {
    return useBooksStore.persist.hasHydrated();
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
        wallpaperSource: "",
      });
    }
  }
  displayStore.bumpCustomWallpapersRevision();
}

function createBlobCodec(
  namespace: "images" | "books" | "trash" | "applets" | "wallpapers",
  storeName: string,
  options?: { afterApply?: (ctx: CodecContext) => Promise<void> }
): BlobSyncCodec {
  return {
    namespace,
    usesIndexedDb: true,
    storeName,
    async collect(ctx, keys) {
      // Blob codec collect returns serialized items keyed by sync key; the
      // engine converts them to `{ blob: ref }` docs after content upload.
      const db = requireDb(ctx, namespace);
      const itemPrefix = `${namespace}/item:`;
      const itemKeys = keys
        ? [...keys]
            .filter((key) => key.startsWith(itemPrefix))
            .map((key) => key.slice(itemPrefix.length))
        : null;
      const storeItems = itemKeys
        ? await readStoreItemsByKeys(db, storeName, itemKeys)
        : await readStoreItems(db, storeName);
      const items = await serializeStoreItems(
        storeItems.map((item) =>
          prepareStoreItemForSync(storeName, item)
        )
      );
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
const booksCodec = createBlobCodec("books", STORES.BOOKS);
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
  books: booksCodec,
  bookshelf: bookshelfCodec,
  "books-settings": booksSettingsCodec,
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
  "books",
  "trash",
  "applets",
  "settings",
  "files",
  "bookshelf",
  "books-settings",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
];
