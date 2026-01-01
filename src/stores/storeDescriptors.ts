/**
 * Central registry of persisted stores to support inventory, migrations, and
 * upcoming cloud sync orchestration. These descriptors intentionally capture
 * the storage key, version, and whether a store is eligible for remote sync.
 */

export type StoreCategory =
  | "app-state"
  | "settings"
  | "ui"
  | "filesystem-meta"
  | "filesystem-content"
  | "media"
  | "auth";

export interface StoreDescriptor {
  /** Persist storage key (localStorage name). */
  key: string;
  /** File where the store is defined (for quick navigation). */
  file: string;
  /** Persist version (0 when not explicitly versioned). */
  version: number;
  /** Primary storage backing. */
  storage: "localStorage" | "indexedDB" | "hybrid";
  /** High-level category for sync/analytics. */
  category: StoreCategory;
  /** Whether the store should be synced to cloud by default. */
  sync: {
    eligible: boolean;
    defaultEnabled: boolean;
    notes?: string;
  };
  /** Extra context / caveats. */
  notes?: string;
}

export const storeDescriptors: StoreDescriptor[] = [
  {
    key: "ryos:app-store",
    file: "src/stores/useAppStore.ts",
    version: 3,
    storage: "localStorage",
    category: "app-state",
    sync: {
      eligible: true,
      defaultEnabled: true,
      notes: "Window/app instances, recent items; excludes closed windows in partialization.",
    },
    notes: "Instances filtered to open windows; applet content removed from initialData.",
  },
  {
    key: "ryos:audio-settings",
    file: "src/stores/useAudioSettingsStore.ts",
    version: 1,
    storage: "localStorage",
    category: "settings",
    sync: { eligible: true, defaultEnabled: true },
    notes: "Volume levels, toggles, TTS preferences.",
  },
  {
    key: "ryos:display-settings",
    file: "src/stores/useDisplaySettingsStore.ts",
    version: 1,
    storage: "hybrid",
    category: "settings",
    sync: {
      eligible: true,
      defaultEnabled: true,
      notes: "Custom wallpaper blobs live in IndexedDB; only metadata in localStorage.",
    },
    notes: "Wallpaper content stored separately in IndexedDB store `custom_wallpapers`.",
  },
  {
    key: "dock-storage",
    file: "src/stores/useDockStore.ts",
    version: 1,
    storage: "localStorage",
    category: "ui",
    sync: { eligible: true, defaultEnabled: true },
    notes: "Pinned dock items, scale/hide/magnification preferences.",
  },
  {
    key: "ryos:finder",
    file: "src/stores/useFinderStore.ts",
    version: 1,
    storage: "localStorage",
    category: "ui",
    sync: { eligible: true, defaultEnabled: true },
    notes: "Per-instance view state and per-path view preferences.",
  },
  {
    key: "ryos:files",
    file: "src/stores/useFilesStore.ts",
    version: 10,
    storage: "hybrid",
    category: "filesystem-meta",
    sync: {
      eligible: true,
      defaultEnabled: false,
      notes: "Metadata in localStorage; document/image/applet content in IndexedDB stores.",
    },
    notes: "Sync should treat binary content via hashed manifests; metadata safe to sync.",
  },
  {
    key: "ryos:theme",
    file: "src/stores/useThemeStore.ts",
    version: 1,
    storage: "localStorage",
    category: "settings",
    sync: { eligible: true, defaultEnabled: true },
    notes: "OS theme selection; legacy CSS variant loading handled in store.",
  },
  {
    key: "ryos:language",
    file: "src/stores/useLanguageStore.ts",
    version: 1,
    storage: "localStorage",
    category: "settings",
    sync: { eligible: true, defaultEnabled: true },
    notes: "UI language and initialization flag; integrates with i18n detector.",
  },
  {
    key: "ryos:chats",
    file: "src/stores/useChatsStore.ts",
    version: 2,
    storage: "localStorage",
    category: "auth",
    sync: {
      eligible: false,
      defaultEnabled: false,
      notes: "Contains auth tokens and chat state; exclude from cloud sync for security.",
    },
    notes: "Recovery keys stored separately (_usr/_auth).",
  },
  {
    key: "applet-storage",
    file: "src/stores/useAppletStore.ts",
    version: 1,
    storage: "localStorage",
    category: "ui",
    sync: { eligible: true, defaultEnabled: true },
    notes: "Window size cache per applet path.",
  },
  {
    key: "ryos:soundboard",
    file: "src/stores/useSoundboardStore.ts",
    version: 1,
    storage: "localStorage",
    category: "media",
    sync: {
      eligible: true,
      defaultEnabled: false,
      notes: "Contains user audio data; payload sizes may be large.",
    },
    notes: "Slots may include base64 audioData; consider size caps before syncing.",
  },
  {
    key: "ryos:synth",
    file: "src/stores/useSynthStore.ts",
    version: 1,
    storage: "localStorage",
    category: "media",
    sync: { eligible: true, defaultEnabled: false },
    notes: "User synth presets and label preferences; lightweight settings.",
  },
  {
    key: "ryos:internet-explorer",
    file: "src/stores/useInternetExplorerStore.ts",
    version: 4,
    storage: "localStorage",
    category: "ui",
    sync: { eligible: true, defaultEnabled: false },
    notes: "Cache/history for IE app; size may grow, consider caps.",
  },
  {
    key: "ryos:terminal",
    file: "src/stores/useTerminalStore.ts",
    version: 1,
    storage: "localStorage",
    category: "ui",
    sync: {
      eligible: false,
      defaultEnabled: false,
      notes: "Contains command history; keep local-only unless explicitly enabled.",
    },
    notes: "Terminal command history and path; privacy-sensitive.",
  },
  {
    key: "ryos:ipod",
    file: "src/stores/useIpodStore.ts",
    version: 0,
    storage: "localStorage",
    category: "media",
    sync: { eligible: true, defaultEnabled: false },
    notes: "Playlist/library metadata; actual media handled via remote fetch/YouTube.",
  },
  {
    key: "ryos:karaoke",
    file: "src/stores/useKaraokeStore.ts",
    version: 2,
    storage: "localStorage",
    category: "media",
    sync: { eligible: true, defaultEnabled: false },
    notes: "Karaoke queues/history; lyrics and audio fetched separately.",
  },
  {
    key: "ryos:photo-booth",
    file: "src/stores/usePhotoBoothStore.ts",
    version: 1,
    storage: "localStorage",
    category: "media",
    sync: { eligible: true, defaultEnabled: false },
    notes: "Photo references only; image blobs managed elsewhere.",
  },
  {
    key: "ryos:videos",
    file: "src/stores/useVideoStore.ts",
    version: 8,
    storage: "localStorage",
    category: "media",
    sync: { eligible: true, defaultEnabled: false },
    notes: "Video playlist metadata only; YouTube content streamed from network.",
  },
  {
    key: "ryos:paint",
    file: "src/stores/usePaintStore.ts",
    version: 1,
    storage: "localStorage",
    category: "settings",
    sync: { eligible: true, defaultEnabled: true },
    notes: "Paint last file path reference only; no content stored.",
  },
  {
    key: "ryos:sync-settings",
    file: "src/stores/useSyncSettingsStore.ts",
    version: 1,
    storage: "localStorage",
    category: "settings",
    sync: { eligible: true, defaultEnabled: false },
    notes: "User opt-in flags for cloud sync scope and auto-sync.",
  },
  {
    key: "ryos:textedit",
    file: "src/stores/useTextEditStore.ts",
    version: 1,
    storage: "localStorage",
    category: "ui",
    sync: { eligible: true, defaultEnabled: true },
    notes: "Recent documents and editor prefs; not the filesystem content itself.",
  },
  {
    key: "ryos:pc",
    file: "src/stores/usePcStore.ts",
    version: 0,
    storage: "localStorage",
    category: "media",
    sync: { eligible: true, defaultEnabled: false },
    notes: "JS-DOS game list (metadata only).",
  },
];
