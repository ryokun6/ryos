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
