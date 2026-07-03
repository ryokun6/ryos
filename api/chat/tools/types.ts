/**
 * Type definitions for chat tools
 * 
 * This module defines the types used across the chat tool system,
 * supporting both server-side and client-side tool execution.
 */

export type { CalendarSnapshotData } from "../../../src/shared/domains/calendar.js";
export type { ContactsSnapshotData } from "../../../src/shared/domains/contacts.js";
export type { StickiesSnapshotData } from "../../../src/shared/domains/stickies.js";
export {
  CONTACT_ACTIONS,
  type ContactToolRecord,
  type ContactsAction,
  type ContactsControlInput,
  type ContactsControlOutput,
} from "../../../src/shared/tools/contacts.js";
export {
  CALENDAR_ACTIONS,
  CALENDAR_COLORS,
  type CalendarAction,
  type CalendarColor,
  type CalendarControlInput,
  type CalendarControlOutput,
} from "../../../src/shared/tools/calendar.js";
export {
  STICKIES_ACTIONS,
  STICKY_COLORS,
  type StickiesAction,
  type StickiesControlInput,
  type StickiesControlOutput,
  type StickyColor,
} from "../../../src/shared/tools/stickies.js";

// Central list of supported theme IDs for tool validation
export const THEME_IDS = ["system7", "macosx", "xp", "win98"] as const;
export type ThemeId = typeof THEME_IDS[number];

// Supported language codes
export const LANGUAGE_CODES = [
  "en",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
] as const;
export type LanguageCode = typeof LANGUAGE_CODES[number];

// Media control actions
export const MEDIA_ACTIONS = ["toggle", "play", "pause", "playKnown", "addAndPlay", "next", "previous"] as const;
export type MediaAction = typeof MEDIA_ACTIONS[number];

// VFS paths
export const VFS_PATHS = ["/Applets", "/Documents", "/Applications", "/Music", "/Applets Store"] as const;
export type VfsPath = typeof VFS_PATHS[number];

/**
 * Context passed to server-side tool executors
 */
export interface ServerToolContext {
  /** Logger instance for structured logging */
  log: (...args: unknown[]) => void;
  /** Error logger */
  logError: (...args: unknown[]) => void;
  /** API base URL for making requests */
  apiBaseUrl?: string;
  /** Environment variables */
  env: {
    YOUTUBE_API_KEY?: string;
    YOUTUBE_API_KEY_2?: string;
  };
  /**
   * Approximate IP-derived geolocation for the current request, when known.
   * Provided by `geolocation()` in `api/chat.ts`; absent for non-edge contexts
   * (e.g. Telegram webhook). Used as a fallback location bias by tools like
   * `mapsSearchPlaces` when the model doesn't pass an explicit anchor.
   */
  requestGeo?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: string | number;
    longitude?: string | number;
  };
}

/**
 * Result from a server-side tool execution
 */
export interface ToolExecutionResult<T = unknown> {
  /** Whether the execution was successful */
  success: boolean;
  /** The result data (if successful) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Tool definition with schema and optional server-side executor
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  /** Human-readable description of the tool */
  description: string;
  /** Zod schema for input validation */
  inputSchema: unknown; // Will be typed as ZodSchema in actual implementation
  /** Optional server-side executor - if not provided, tool runs client-side */
  execute?: (input: TInput, context: ServerToolContext) => Promise<TOutput>;
}

/**
 * Input types for various tools
 */

// Launch app input
export interface LaunchAppInput {
  id: string;
  url?: string;
  year?: string;
}

// Close app input
export interface CloseAppInput {
  id: string;
}

// Generate HTML input
export interface GenerateHtmlInput {
  html: string;
  title?: string;
  icon?: string;
}

// Generate HTML output
export interface GenerateHtmlOutput {
  html: string;
  title: string;
  icon: string;
}

// List input
export interface ListInput {
  path: VfsPath;
  query?: string;
  limit?: number;
  librarySource?: "active" | "youtube" | "appleMusic";
}

// Open input
export interface OpenInput {
  path: string;
}

// Read input
export interface ReadInput {
  path: string;
}

// Write input
export interface WriteInput {
  path: string;
  content: string;
  mode?: "overwrite" | "append" | "prepend";
}

// Edit input
export interface EditInput {
  path: string;
  old_string: string;
  new_string: string;
}

// Search songs input
export interface SearchSongsInput {
  query: string;
  maxResults?: number;
}

// Search songs output
export interface SearchSongsResult {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
}

export interface SearchSongsOutput {
  results: SearchSongsResult[];
  message: string;
  hint?: string;
}

// Song library control
export const SONG_LIBRARY_ACTIONS = [
  "list",
  "search",
  "get",
  "searchYoutube",
  "add",
] as const;
export type SongLibraryAction = typeof SONG_LIBRARY_ACTIONS[number];

export const SONG_LIBRARY_SCOPES = ["user", "global", "any"] as const;
export type SongLibraryScope = typeof SONG_LIBRARY_SCOPES[number];

export interface SongLibraryLyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

export interface SongLibraryToolRecord {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  coverColor?: string;
  lyricOffset?: number;
  lyricsSource?: SongLibraryLyricsSource;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  source: "user_library" | "global_cache" | "combined";
  inUserLibrary: boolean;
  hasLyrics?: boolean;
  hasTranslations?: boolean;
  hasFurigana?: boolean;
  hasSoramimi?: boolean;
  ipodUrl: string;
  karaokeUrl: string;
}

export interface SongLibraryControlInput {
  action: SongLibraryAction;
  scope?: SongLibraryScope;
  query?: string;
  id?: string;
  videoId?: string;
  url?: string;
  title?: string;
  artist?: string;
  album?: string;
  limit?: number;
}

export interface SongLibraryControlOutput {
  success: boolean;
  message: string;
  scope?: SongLibraryScope;
  songs?: SongLibraryToolRecord[];
  song?: SongLibraryToolRecord | null;
  youtubeResults?: SearchSongsResult[];
}

// Settings input
export interface SettingsInput {
  language?: LanguageCode;
  theme?: ThemeId;
  masterVolume?: number;
  speechEnabled?: boolean;
  checkForUpdates?: boolean;
}

// Infinite Mac control actions
export const INFINITE_MAC_ACTIONS = [
  "launchSystem",
  "getStatus",
  "readScreen",
  "mouseMove",
  "mouseClick",
  "doubleClick",
  "keyPress",
  "pause",
  "unpause",
] as const;
export type InfiniteMacAction = typeof INFINITE_MAC_ACTIONS[number];

// Infinite Mac system presets
export const INFINITE_MAC_SYSTEMS = [
  "system-1",
  "system-6",
  "system-7-5",
  "kanjitalk-7-5",
  "macos-8",
  "macos-8-5",
  "macos-9",
  "macos-9-2",
  "macosx-10-1",
  "macosx-10-2",
  "macosx-10-3",
  "macosx-10-4",
] as const;
export type InfiniteMacSystem = typeof INFINITE_MAC_SYSTEMS[number];

// Infinite Mac control input
export interface InfiniteMacControlInput {
  action: InfiniteMacAction;
  // For launchSystem
  system?: InfiniteMacSystem;
  // For mouseMove and mouseClick
  x?: number;
  y?: number;
  // For mouseClick
  button?: "left" | "right";
  // For keyPress
  key?: string;
}

// Infinite Mac control output
export interface InfiniteMacControlOutput {
  success: boolean;
  message: string;
  // For getStatus
  status?: {
    isEmulatorLoaded: boolean;
    isPaused: boolean;
    currentSystem: string | null;
    screenSize: { width: number; height: number } | null;
  };
  // For readScreen - returns screen metadata and base64 image data URL
  screenSize?: { width: number; height: number };
  currentSystem?: string;
  screenImageDataUrl?: string; // Base64 PNG data URL for display
  // Available systems list (for launchSystem help)
  availableSystems?: Array<{
    id: string;
    name: string;
    year: string;
    description: string;
  }>;
}

// ============================================================================
// TV Control Types
// ============================================================================

export const TV_ACTIONS = [
  "list",
  "tune",
  "createChannel",
  "deleteChannel",
  "addVideo",
  "removeVideo",
] as const;
export type TvAction = (typeof TV_ACTIONS)[number];

// ============================================================================
// Unified Media Control Types (MediaCore)
// ============================================================================

/**
 * Targets the unified `mediaControl` tool can drive. "music" is the iPod app;
 * the rest map 1:1 onto their apps. Winamp is intentionally not a target yet —
 * it is not on the MediaCore now-playing bus (Webamp owns its own event loop).
 */
export const MEDIA_TARGETS = ["music", "karaoke", "videos", "tv"] as const;
export type MediaTarget = (typeof MEDIA_TARGETS)[number];

/**
 * Unified action vocabulary: the shared transport actions (`MEDIA_ACTIONS`)
 * plus TV's channel-management actions (`TV_ACTIONS`). The two sets do not
 * overlap; channel actions are only valid with `target: "tv"`.
 */
export const MEDIA_CONTROL_ACTIONS = [
  ...MEDIA_ACTIONS,
  ...TV_ACTIONS,
] as const;
export type MediaControlAction = (typeof MEDIA_CONTROL_ACTIONS)[number];

// ============================================================================
// Documents Control Types
// ============================================================================

export const DOCUMENTS_ACTIONS = ["list", "read", "write", "edit"] as const;
export type DocumentsAction = typeof DOCUMENTS_ACTIONS[number];

export const DOCUMENT_WRITE_MODES = [
  "overwrite",
  "append",
  "prepend",
] as const;
export type DocumentWriteMode = typeof DOCUMENT_WRITE_MODES[number];

export interface DocumentsControlInput {
  action: DocumentsAction;
  path?: string;
  content?: string;
  mode?: DocumentWriteMode;
  old_string?: string;
  new_string?: string;
}

export interface DocumentsControlOutput {
  success: boolean;
  message: string;
  documents?: Array<{
    path: string;
    name: string;
    size?: number;
    modifiedAt?: number;
  }>;
  document?: {
    path: string;
    name: string;
    content: string;
    size?: number;
    modifiedAt?: number;
  };
}

// ============================================================================
// Memory Tool Types (Unified for both daily notes and long-term memories)
// ============================================================================

// Memory types
export const MEMORY_TYPES = ["long_term", "daily"] as const;
export type MemoryType = typeof MEMORY_TYPES[number];

// Memory write modes (for long-term only)
export const MEMORY_MODES = ["add", "update", "merge"] as const;
export type MemoryMode = typeof MEMORY_MODES[number];

// Unified memory write input
export interface MemoryWriteInput {
  /** Type of memory: "long_term" for permanent facts, "daily" for journal entries */
  type?: MemoryType;
  /** Short key (required for long_term, ignored for daily) */
  key?: string;
  /** Brief summary (required for long_term, ignored for daily) */
  summary?: string;
  /** Content to store (required for both types) */
  content: string;
  /** Write mode for long_term: "add", "update", "merge" (ignored for daily) */
  mode?: MemoryMode;
}

// Unified memory write output
export interface MemoryWriteOutput {
  success: boolean;
  message: string;
  /** Current long-term memories after the operation (for AI awareness) */
  currentMemories?: Array<{ key: string; summary: string }>;
  /** Today's date for daily notes */
  date?: string;
  /** Number of entries in today's daily note */
  entryCount?: number;
}

// Unified memory read input
export interface MemoryReadInput {
  /** Type of memory to read */
  type?: MemoryType;
  /** Key to read (for long_term) */
  key?: string;
  /** Date to read (for daily, YYYY-MM-DD format, defaults to today) */
  date?: string;
}

// Unified memory read output
export interface MemoryReadOutput {
  success: boolean;
  message: string;
  /** For long_term reads */
  key?: string;
  content?: string | null;
  summary?: string | null;
  /** For daily reads */
  date?: string;
  entries?: Array<{
    timestamp: number;
    isoTimestamp?: string;
    localDate?: string;
    localTime?: string;
    timeZone?: string;
    content: string;
  }>;
}

// Memory delete input (long-term only)
export interface MemoryDeleteInput {
  /** The memory key to delete */
  key: string;
}

// Memory delete output
export interface MemoryDeleteOutput {
  success: boolean;
  message: string;
}

// ============================================================================
// Maps Search Places Tool Types
// ============================================================================

export interface MapsSearchPlacesInput {
  /** Free-form search query (e.g. "best ramen near Shibuya"). */
  query: string;
  /**
   * Optional approximate center used to bias results. Apple's Maps Server API
   * does not allow combining a point bias with a bounding region, so the tool
   * exposes only the point variant and falls back to the request's IP-derived
   * coordinates when this is omitted.
   */
  near?: {
    latitude: number;
    longitude: number;
  };
  /** Optional ISO 3166-1 alpha-2 country codes to constrain results. */
  countries?: string[];
  /** Optional BCP-47 language tag for response text. */
  language?: string;
  /** Maximum number of results to return (1-10, default 5). */
  limit?: number;
}

export interface MapsSearchPlaceResult {
  /**
   * Stable identifier used for ryOS persistence (Apple Place ID when
   * available, otherwise a coordinate-based composite for older entries).
   */
  id: string;
  /** Apple Place ID, when known. */
  placeId?: string;
  name: string;
  /** Single-line address suitable for showing under the title. */
  address: string;
  /** Multi-line formatted address from Apple. */
  addressLines?: string[];
  latitude: number;
  longitude: number;
  /** MapKit POI category (e.g. "Restaurant"). Drives the card icon. */
  category?: string;
  country?: string;
  countryCode?: string;
  /** Convenience link that opens Apple Maps centered on this place. */
  appleMapsUrl: string;
}

export interface MapsSearchPlacesOutput {
  success: boolean;
  query: string;
  results: MapsSearchPlaceResult[];
  message: string;
  error?: string;
}

// ============================================================================
// Web Fetch Tool Types
// ============================================================================

export interface WebFetchInput {
  url: string;
  /** Extract only a CSS-selector subset of the page (optional) */
  selector?: string;
}

export interface WebFetchOutput {
  success: boolean;
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  siteName?: string;
  content: string;
  contentLength: number;
  truncated: boolean;
  message: string;
}

// ============================================================================
// App State Types (for server-side calendar/stickies executors)
// ============================================================================
