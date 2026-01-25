/**
 * Chat Tools Module
 * 
 * This module provides a modular tool system for the chat API endpoint.
 * It follows the Vercel AI SDK's tool loop agent pattern:
 * 
 * 1. **Server-side tools** have `execute` functions and run entirely on the server
 * 2. **Client-side tools** have no `execute` function and are handled via `onToolCall` on the client
 * 
 * ## Architecture
 * 
 * - `types.ts` - Type definitions and constants
 * - `schemas.ts` - Zod schemas for input validation
 * - `executors.ts` - Server-side execution logic
 * - `index.ts` - Main exports and tool definitions
 * 
 * ## Usage
 * 
 * ```typescript
 * import { createChatTools } from './_api/chat/tools';
 * 
 * const tools = createChatTools({
 *   log: logger.info,
 *   logError: logger.error,
 *   env: process.env,
 * });
 * 
 * streamText({
 *   model: selectedModel,
 *   tools,
 *   // ...
 * });
 * ```
 */

import type { ServerToolContext } from "./types.js";
import * as schemas from "./schemas.js";
import { executeGenerateHtml, executeSearchSongs } from "./executors.js";

// Re-export types and schemas for external use
export * from "./types.js";
export * from "./schemas.js";
export { executeGenerateHtml, executeSearchSongs } from "./executors.js";

/**
 * Tool descriptions - centralized for easy maintenance
 */
export const TOOL_DESCRIPTIONS = {
  launchApp:
    "Launch an application in the ryOS interface when the user explicitly requests it. If the id is 'internet-explorer', you must provide BOTH a real 'url' and a 'year' for time-travel; otherwise provide neither.",
  
  closeApp:
    "Close an application in the ryOS interface—but only when the user explicitly asks you to close that specific app.",
  
  ipodControl:
    "Control playback in the iPod app. Launches the iPod automatically if needed. Use action 'toggle' (default), 'play', or 'pause' for playback state; 'playKnown' to play an existing library track by id/title/artist; 'addAndPlay' to add a track from a YouTube ID or URL and start playback; 'next' or 'previous' to navigate the playlist. Optionally enable video or fullscreen mode with enableVideo or enableFullscreen. LYRICS TRANSLATION: By default, keep lyrics in the ORIGINAL language - only use enableTranslation when the user EXPLICITLY asks for translated lyrics. IMPORTANT: If the user's OS is iOS, do NOT automatically start playback – instead, inform the user that due to iOS browser restrictions they need to press the center button or play button on the iPod themselves to start playing.",
  
  karaokeControl:
    "Control playback in the Karaoke app. Launches the Karaoke app automatically if needed. Use action 'toggle' (default), 'play', or 'pause' for playback state; 'playKnown' to play an existing library track by id/title/artist; 'addAndPlay' to add a track from a YouTube ID or URL and start playback; 'next' or 'previous' to navigate the playlist. Optionally enable fullscreen mode with enableFullscreen. LYRICS TRANSLATION: By default, keep lyrics in the ORIGINAL language - only use enableTranslation when the user EXPLICITLY asks for translated lyrics. IMPORTANT: If the user's OS is iOS, do NOT automatically start playback – instead, inform the user that due to iOS browser restrictions they need to tap the play button themselves to start playing. NOTE: Karaoke shares the same music library as iPod but has independent playback state.",
  
  generateHtml:
    "Generate an HTML snippet for an ryOS Applet: a small windowed app (default ~320px wide) that runs inside ryOS, not the full page. Design mobile-first for ~320px width but keep layouts responsive to expand gracefully. Provide markup in 'html', a short 'title', and an 'icon' (emoji). DO NOT wrap it in markdown fences; the client will handle scaffolding.",
  
  aquarium:
    "Render a playful emoji aquarium inside the chat bubble. Use when the user asks for an aquarium / fish tank / fishes / sam's aquarium.",
  
  list:
    "List items from the ryOS virtual file system. Returns a JSON array with metadata for each item. CRITICAL: You MUST ONLY reference items that are explicitly returned in the tool result. DO NOT suggest, mention, or hallucinate items that are not in the returned list.",
  
  open:
    "Open a file, application, or media item from the virtual file system. Routes to the appropriate app based on path:\n" +
    "- Applets → applet-viewer\n" +
    "- Documents → TextEdit\n" +
    "- Applications → launches the app\n" +
    "- Music → plays in iPod\n" +
    "- Applets Store → opens preview\n" +
    "CRITICAL: Use exact paths from 'list' results. Always call 'list' first.",
  
  read:
    "Read the full contents of a file from the virtual file system. Returns the complete text content for AI processing. Supports:\n" +
    "- '/Applets/*' - Read applet HTML content\n" +
    "- '/Documents/*' - Read document markdown content\n" +
    "- '/Applets Store/{id}' - Fetch shared applet content and metadata",
  
  write:
    "Create or modify markdown documents. Saves to disk and opens in TextEdit. " +
    "IMPORTANT: For applets, use generateHtml (create/overwrite) or edit (small changes).",
  
  edit:
    "Edit existing files in the ryOS virtual file system. For creating new files, use the write tool (documents) or generateHtml tool (applets). For larger rewrites, use write with mode 'overwrite'.\n\n" +
    "Before using this tool:\n" +
    "1. Use the read tool to understand the file's contents and context\n" +
    "2. Verify the file exists using list\n\n" +
    "To make a file edit, provide the following:\n" +
    "1. path: The file path to modify (e.g., '/Documents/notes.md' or '/Applets/MyApp.app')\n" +
    "2. old_string: The text to replace (must be unique within the file, and must match exactly including whitespace)\n" +
    "3. new_string: The edited text to replace the old_string\n\n" +
    "The tool will replace ONE occurrence of old_string with new_string in the specified file.\n\n" +
    "CRITICAL REQUIREMENTS:\n" +
    "1. UNIQUENESS: The old_string MUST uniquely identify the specific instance you want to change. Include context lines before and after if needed.\n" +
    "2. SINGLE INSTANCE: This tool changes ONE instance at a time. Make separate calls for multiple changes.\n" +
    "3. VERIFICATION: Before using, check how many instances of the target text exist. If multiple exist, include enough context to uniquely identify each one.\n\n" +
    "WARNING: If you do not follow these requirements:\n" +
    "- The tool will fail if old_string matches multiple locations\n" +
    "- The tool will fail if old_string doesn't match exactly (including whitespace)\n\n" +
    "Supported paths:\n" +
    "- '/Documents/*' - Edit markdown documents\n" +
    "- '/Applets/*' - Edit applet HTML files",
  
  searchSongs:
    "Search for songs/videos on YouTube. Returns a list of results with video IDs, titles, and channel names. Use this to help users find music to add to their iPod. PREFER official music videos from verified artist channels (look for 'VEVO' or the artist's official channel). AVOID karaoke versions, instrumental versions, playlists, compilations, 'best of' collections, lyric videos, and covers unless specifically requested. After getting results, you can use ipodControl with action 'addAndPlay' to add a song using its videoId.",
  
  settings:
    "Change system settings in ryOS. Use this tool when the user asks to change language, theme, volume, enable/disable speech, or check for updates. Multiple settings can be changed in a single call.",
} as const;

/**
 * Create the tools object for use with streamText
 * 
 * This function creates a tools configuration object that can be passed
 * directly to the Vercel AI SDK's streamText function.
 * 
 * @param context - Server-side context with logging and environment
 * @returns Tools configuration for streamText
 */
export function createChatTools(context: ServerToolContext) {
  return {
    // ============================================================================
    // App Control Tools (Client-side execution)
    // ============================================================================
    launchApp: {
      description: TOOL_DESCRIPTIONS.launchApp,
      inputSchema: schemas.launchAppSchema,
      // No execute - handled client-side
    },
    closeApp: {
      description: TOOL_DESCRIPTIONS.closeApp,
      inputSchema: schemas.closeAppSchema,
      // No execute - handled client-side
    },

    // ============================================================================
    // Media Control Tools (Client-side execution)
    // ============================================================================
    ipodControl: {
      description: TOOL_DESCRIPTIONS.ipodControl,
      inputSchema: schemas.ipodControlSchema,
      // No execute - handled client-side (requires browser media APIs)
    },
    karaokeControl: {
      description: TOOL_DESCRIPTIONS.karaokeControl,
      inputSchema: schemas.karaokeControlSchema,
      // No execute - handled client-side (requires browser media APIs)
    },

    // ============================================================================
    // HTML Generation Tools (Server-side execution)
    // ============================================================================
    generateHtml: {
      description: TOOL_DESCRIPTIONS.generateHtml,
      inputSchema: schemas.generateHtmlSchema,
      execute: async (input: { html: string; title?: string; icon?: string }) => {
        return executeGenerateHtml(input, context);
      },
    },

    // ============================================================================
    // Visual Effects Tools (Client-side execution)
    // ============================================================================
    aquarium: {
      description: TOOL_DESCRIPTIONS.aquarium,
      inputSchema: schemas.aquariumSchema,
      // No execute - rendered client-side in chat bubble
    },

    // ============================================================================
    // Virtual File System Tools (Client-side execution)
    // These tools need access to browser IndexedDB and Zustand stores
    // ============================================================================
    list: {
      description: TOOL_DESCRIPTIONS.list,
      inputSchema: schemas.listSchema,
      // No execute - handled client-side (requires IndexedDB access)
    },
    open: {
      description: TOOL_DESCRIPTIONS.open,
      inputSchema: schemas.openSchema,
      // No execute - handled client-side (requires launching apps)
    },
    read: {
      description: TOOL_DESCRIPTIONS.read,
      inputSchema: schemas.readSchema,
      // No execute - handled client-side (requires IndexedDB access)
    },
    write: {
      description: TOOL_DESCRIPTIONS.write,
      inputSchema: schemas.writeSchema,
      // No execute - handled client-side (requires IndexedDB access)
    },
    edit: {
      description: TOOL_DESCRIPTIONS.edit,
      inputSchema: schemas.editSchema,
      // No execute - handled client-side (requires IndexedDB access)
    },

    // ============================================================================
    // YouTube/Song Search Tools (Server-side execution)
    // ============================================================================
    searchSongs: {
      description: TOOL_DESCRIPTIONS.searchSongs,
      inputSchema: schemas.searchSongsSchema,
      execute: async (input: { query: string; maxResults?: number }) => {
        return executeSearchSongs(input, context);
      },
    },

    // ============================================================================
    // System Settings Tools (Client-side execution)
    // ============================================================================
    settings: {
      description: TOOL_DESCRIPTIONS.settings,
      inputSchema: schemas.settingsSchema,
      // No execute - handled client-side (requires Zustand store access)
    },
  };
}

/**
 * Type for the tools object returned by createChatTools
 */
export type ChatTools = ReturnType<typeof createChatTools>;
