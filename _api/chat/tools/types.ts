/**
 * Type definitions for chat tools
 * 
 * This module defines the types used across the chat tool system,
 * supporting both server-side and client-side tool execution.
 */

// Central list of supported theme IDs for tool validation
export const THEME_IDS = ["system7", "macosx", "xp", "win98"] as const;
export type ThemeId = typeof THEME_IDS[number];

// Supported language codes
export const LANGUAGE_CODES = ["en", "zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru"] as const;
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

// Media control input (iPod/Karaoke)
export interface MediaControlInput {
  action?: MediaAction;
  id?: string;
  title?: string;
  artist?: string;
  enableTranslation?: string;
  enableFullscreen?: boolean;
  enableVideo?: boolean;
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

// Settings input
export interface SettingsInput {
  language?: LanguageCode;
  theme?: ThemeId;
  masterVolume?: number;
  speechEnabled?: boolean;
  checkForUpdates?: boolean;
}

// Sticky colors
export const STICKY_COLORS = ["yellow", "blue", "green", "pink", "purple", "orange"] as const;
export type StickyColor = typeof STICKY_COLORS[number];

// Stickies control actions
export const STICKIES_ACTIONS = ["list", "create", "update", "delete", "clear"] as const;
export type StickiesAction = typeof STICKIES_ACTIONS[number];

// Stickies control input
export interface StickiesControlInput {
  action: StickiesAction;
  id?: string;
  content?: string;
  color?: StickyColor;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

// Stickies control output
export interface StickiesControlOutput {
  success: boolean;
  message: string;
  notes?: Array<{
    id: string;
    content: string;
    color: StickyColor;
    position: { x: number; y: number };
    size: { width: number; height: number };
  }>;
  note?: {
    id: string;
    content: string;
    color: StickyColor;
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
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
// Memory Tool Types
// ============================================================================

// Memory write modes
export const MEMORY_MODES = ["add", "update", "merge"] as const;
export type MemoryMode = typeof MEMORY_MODES[number];

// Memory write input
export interface MemoryWriteInput {
  /** Short key for this memory (e.g., "name", "music_pref") */
  key: string;
  /** Brief 1-2 sentence summary */
  summary: string;
  /** Full detailed content */
  content: string;
  /** Write mode: "add" (new), "update" (replace), "merge" (append) */
  mode?: MemoryMode;
}

// Memory write output
export interface MemoryWriteOutput {
  success: boolean;
  message: string;
  /** Current memories after the operation (for AI awareness) */
  currentMemories: Array<{ key: string; summary: string }>;
}

// Memory read input
export interface MemoryReadInput {
  /** The memory key to retrieve full details for */
  key: string;
}

// Memory read output
export interface MemoryReadOutput {
  success: boolean;
  message: string;
  key: string;
  /** Full content (null if not found) */
  content: string | null;
  /** Summary (null if not found) */
  summary: string | null;
}

// Memory delete input
export interface MemoryDeleteInput {
  /** The memory key to delete */
  key: string;
}

// Memory delete output
export interface MemoryDeleteOutput {
  success: boolean;
  message: string;
}
