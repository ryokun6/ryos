/**
 * Browser storage key registry.
 *
 * Keep new keys under `ryos:<scope>:<owner>[:<name>][:vN]`.
 * Existing shipped keys stay stable here to preserve user data; legacy aliases
 * are grouped separately so migrations can intentionally clean them up.
 */

export const STORE_STORAGE_KEYS = {
  app: "ryos:app-store",
  applet: "applet-storage",
  audioSettings: "ryos:audio-settings",
  calendar: "calendar-storage",
  chats: "ryos:chats",
  cloudSync: "ryos:cloud-sync",
  contacts: "contacts-storage",
  dashboard: "dashboard-storage",
  displaySettings: "ryos:display-settings",
  dock: "dock-storage",
  files: "ryos:files",
  finder: "ryos:finder",
  infiniteMac: "ryos:infinite-mac",
  infinitePc: "ryos:store:infinite-pc",
  internetExplorer: "ryos:internet-explorer",
  ipod: "ryos:ipod",
  karaoke: "ryos:karaoke",
  maps: "ryos:maps:v1",
  paint: "ryos:paint",
  pc: "ryos:pc",
  photoBooth: "ryos:photo-booth",
  soundboard: "ryos:soundboard",
  stickies: "stickies-storage",
  synth: "ryos:synth",
  terminal: "ryos:terminal",
  textEdit: "ryos:textedit",
  tv: "ryos:tv",
  videos: "ryos:videos",
  weather: "ryos:weather",
} as const;

export const LEGACY_LOCAL_STORAGE_KEYS = {
  chats: {
    cachedRoomMessages: "chats:cachedRoomMessages",
    cachedRooms: "chats:cachedRooms",
    chatRoomUsername: "chats:chatRoomUsername",
    lastOpenedRoomId: "chats:lastOpenedRoomId",
    messages: "chats:messages",
    sidebarVisible: "chats:sidebarVisible",
  },
  finder: {
    initialPath: "app_finder_initialPath",
  },
  paint: {
    lastFilePath: "paint:lastFilePath",
  },
  photoBooth: {
    photos: "photo-booth:photos",
  },
  settings: {
    wallpaper: "ryos:app:settings:wallpaper",
  },
  synth: {
    currentPreset: "synth-current-preset",
    labelType: "synth-label-type",
    presets: "synth-presets",
  },
  terminal: {
    commandHistory: "terminal:commandHistory",
    currentPath: "terminal:currentPath",
  },
  textEdit: {
    pendingFileOpen: "pending_file_open",
  },
  theme: {
    current: "os_theme",
  },
} as const;

export const LOCAL_STORAGE_KEYS = {
  auth: {
    usernameRecovery: "_usr_recovery_key_",
  },
  cache: {
    prefetchManifestTimestamp: "ryos:manifest-timestamp",
    wallpaperMenubarLuminance: "ryos:wallpaper-menubar-luminance",
  },
  handoff: {
    appInitialPath: (appId: string): `ryos:app:${string}:initial-path` =>
      `ryos:app:${appId}:initial-path`,
    finderInitialPath: "ryos:app:finder:initial-path",
    pendingFileOpen: "ryos:pending-file-open",
  },
  language: {
    current: "ryos:language",
    initialized: "ryos:language-initialized",
  },
  migrations: {
    fileSizeTimestampSync: "ryos:file-size-timestamp-sync-v1",
  },
  sync: {
    clientId: "ryos:sync2:client-id",
    stateForUser: (username: string): `ryos:sync2:state:${string}` =>
      `ryos:sync2:state:${username.toLowerCase()}`,
  },
  theme: {
    accent: "ryos:theme:accent",
    aquaMaterial: "ryos:theme:aqua-material",
    current: "ryos:theme",
    darkMode: "ryos:theme:dark",
    systemFont: "ryos:theme:system-font",
    wallpaperAccentColor: "ryos:theme:accent:wallpaper-color",
  },
} as const;

export const SESSION_STORAGE_KEYS = {
  analytics: {
    sessionId: "ryos:analytics:session-id",
  },
  boot: {
    debugMode: "ryos:bootDebugMode",
    nextMessage: "ryos:nextBootMessage",
  },
  listen: {
    clientInstanceId: "ryos:listen-client-instance",
  },
  reload: {
    count: "ryos:reload-count",
    staleCooldown: "ryos-stale-reload",
    windowStart: "ryos:reload-window-start",
  },
} as const;

export const ANALYTICS_LOCAL_STORAGE_KEYS = {
  clientId: "ryos:analytics:client-id",
} as const;

export const CURRENT_LOCAL_STORAGE_STATIC_KEYS = [
  ...Object.values(STORE_STORAGE_KEYS),
  LOCAL_STORAGE_KEYS.auth.usernameRecovery,
  LOCAL_STORAGE_KEYS.cache.prefetchManifestTimestamp,
  LOCAL_STORAGE_KEYS.cache.wallpaperMenubarLuminance,
  LOCAL_STORAGE_KEYS.handoff.finderInitialPath,
  LOCAL_STORAGE_KEYS.handoff.pendingFileOpen,
  LOCAL_STORAGE_KEYS.language.current,
  LOCAL_STORAGE_KEYS.language.initialized,
  LOCAL_STORAGE_KEYS.migrations.fileSizeTimestampSync,
  LOCAL_STORAGE_KEYS.sync.clientId,
  LOCAL_STORAGE_KEYS.theme.accent,
  LOCAL_STORAGE_KEYS.theme.aquaMaterial,
  LOCAL_STORAGE_KEYS.theme.current,
  LOCAL_STORAGE_KEYS.theme.darkMode,
  LOCAL_STORAGE_KEYS.theme.systemFont,
  LOCAL_STORAGE_KEYS.theme.wallpaperAccentColor,
  ANALYTICS_LOCAL_STORAGE_KEYS.clientId,
] as const;

export const CURRENT_SESSION_STORAGE_STATIC_KEYS = [
  SESSION_STORAGE_KEYS.analytics.sessionId,
  SESSION_STORAGE_KEYS.boot.debugMode,
  SESSION_STORAGE_KEYS.boot.nextMessage,
  SESSION_STORAGE_KEYS.listen.clientInstanceId,
  SESSION_STORAGE_KEYS.reload.count,
  SESSION_STORAGE_KEYS.reload.staleCooldown,
  SESSION_STORAGE_KEYS.reload.windowStart,
] as const;
