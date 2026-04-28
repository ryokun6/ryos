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
 * import { createChatTools } from './api/chat/tools';
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

import type {
  MemoryWriteInput,
  MemoryReadInput,
  MemoryDeleteInput,
  WebFetchInput,
} from "./types.js";
import * as schemas from "./schemas.js";
import type {
  CalendarControlInput,
  DocumentsControlInput,
  StickiesControlInput,
  ContactsControlInput,
  SongLibraryControlInput,
} from "./types.js";
import {
  executeGenerateHtml,
  executeSearchSongs,
  executeSongLibraryControl,
  executeMemoryWrite,
  executeMemoryRead,
  executeMemoryDelete,
  executeCalendarControl,
  executeDocumentsControl,
  executeStickiesControl,
  executeContactsControl,
  executeWebFetch,
  type MemoryToolContext,
} from "./executors.js";

// Re-export types and schemas for external use
export * from "./types.js";
export * from "./schemas.js";
export {
  executeGenerateHtml,
  executeSearchSongs,
  executeSongLibraryControl,
  executeMemoryWrite,
  executeMemoryRead,
  executeMemoryDelete,
  executeCalendarControl,
  executeDocumentsControl,
  executeStickiesControl,
  executeContactsControl,
  executeWebFetch,
  type MemoryToolContext,
} from "./executors.js";

const MEMORY_TOOL_NAMES = [
  "memoryWrite",
  "memoryRead",
  "memoryDelete",
] as const;

const _TELEGRAM_TOOL_NAMES = [
  "memoryWrite",
  "memoryRead",
  "memoryDelete",
  "documentsControl",
  "calendarControl",
  "stickiesControl",
  "contactsControl",
  "songLibraryControl",
] as const;

export type ChatToolProfile = "all" | "memory" | "telegram";
export type ChatToolsContext = MemoryToolContext;

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

  songLibraryControl:
    "Search ryOS song libraries and cached song metadata from server-side contexts like Telegram. " +
    "Actions: 'list' returns recent songs, 'search' finds songs by id/title/artist/album, 'get' returns metadata for one song id, 'searchYoutube' searches YouTube for songs to add, and 'add' saves a YouTube song into the shared cache plus the signed-in user's library. " +
    "Scopes: 'user' searches the signed-in user's synced song library, 'global' searches the server song/lyrics cache, and 'any' searches both with user-library matches preferred. " +
    "For 'add', pass the chosen YouTube result's videoId and title/channel when available. Results include canonical ryOS links for iPod and Karaoke share URLs.",
  
  settings:
    "Change system settings in ryOS. Use this tool when the user asks to change language, theme, volume, enable/disable speech, or check for updates. Multiple settings can be changed in a single call.",
  
  stickiesControl:
    "Manage sticky notes in ryOS. Actions: 'list' returns all stickies with their IDs, content, and colors; 'create' makes a new sticky note with optional content/text, color (yellow/blue/green/pink/purple/orange), position, size; 'update' modifies an existing sticky by ID - use this to set/replace text content, change color, or move it; 'delete' removes a sticky by ID; 'clear' removes all stickies. The Stickies app opens automatically when creating notes.",

  documentsControl:
    "Manage synced markdown documents in /Documents from headless contexts like Telegram. Actions: 'list' returns synced documents with document names and exact paths, 'read' returns a document's full content, 'write' creates or overwrites/appends/prepends a document, and 'edit' replaces one exact unique string match in an existing document. Use exact /Documents/*.md paths.",

  infiniteMacControl:
    "Control the Infinite Mac emulator to run classic Mac OS systems. Actions: " +
    "'launchSystem' launches a Mac OS (requires 'system' param - options include system-1, system-6, system-7-5, macos-8, macos-9, macosx-10-1 through 10-4); " +
    "'getStatus' returns the current emulator state (loaded, paused, current system, screen size); " +
    "'readScreen' captures the current screen as a PNG image that you can analyze visually; " +
    "'mouseMove' moves the cursor to (x, y) pixel coordinates matching the screenshot; " +
    "'mouseClick' single-clicks at (x, y) with optional 'button' (left/right); " +
    "'doubleClick' double-clicks at (x, y) to open files/folders; " +
    "'keyPress' sends a key press (use JS key codes like 'KeyA', 'Enter', 'Space', 'ArrowUp'); " +
    "'pause'/'unpause' controls emulation. " +
    "IMPORTANT: Mouse coordinates are 1:1 with the screenshot pixels - use exact pixel positions from the image. " +
    "Mouse control works best on classic Mac OS (System 1-9). Mac OS X systems have limited mouse support due to emulator constraints.",

  calendarControl:
    "Manage calendar events and todos in ryOS. " +
    "Event actions: " +
    "'list' returns all events (optionally filter by date); " +
    "'create' adds a new event (requires title and date in YYYY-MM-DD format, optional startTime/endTime in HH:MM, color, notes); " +
    "'update' modifies an existing event by ID; " +
    "'delete' removes an event by ID. " +
    "Todo actions: " +
    "'listTodos' returns all todos — do NOT pass 'date' unless specifically asked, as most todos have no due date (optionally filter by completed status or due date); " +
    "'createTodo' adds a new todo (requires title, optional date as due date in YYYY-MM-DD, optional calendarId); " +
    "'toggleTodo' toggles a todo's completion status by ID; " +
    "'deleteTodo' removes a todo by ID. " +
    "The Calendar app opens automatically when creating events or todos. " +
    "Use 'list'/'listTodos' first to get IDs before updating, toggling, or deleting.",

  contactsControl:
    "Manage contacts in ryOS and the synced Redis contacts store. " +
    "Actions: 'list' returns contacts (optionally filtered by query across names, emails, phones, notes, and Telegram fields); " +
    "'get' returns one contact by ID; " +
    "'create' adds a contact with names, organization, phones, emails, URLs, addresses, birthday, notes, or Telegram details; " +
    "'update' modifies an existing contact by ID; " +
    "'delete' removes a contact by ID. " +
    "Use 'list' first to get IDs before calling 'get', 'update', or 'delete'.",

  tvControl:
    "Control the TV app. Manage the user's TV channel lineup and tune in to channels. " +
    "Actions: " +
    "'list' returns the full lineup (built-in + custom channels) with stable ids and channel numbers; " +
    "'tune' switches the TV to a channel by id (from 'list') or by 'channelNumber'; " +
    "'createChannel' adds a new custom channel (requires 'name'; optional 'description' and 'videos' to seed it); " +
    "'deleteChannel' removes a custom channel by id (built-in channels cannot be deleted); " +
    "'addVideo' appends a YouTube video (by 'videoId' or 'url') to a custom channel; " +
    "'removeVideo' removes a video from a custom channel by 'removeVideoId'. " +
    "Built-in channels (RyoTV, MTV, 台視) are read-only — only custom channels can be edited. " +
    "Always call 'list' first to get channel ids and current state. " +
    "The TV app opens automatically when tuning, creating, or editing channels.",

  webFetch:
    "Fetch and read the text content of a web page. Use this when the user asks you to look something up online, " +
    "read an article, check a website, get information from a URL, or when you need live/current data from the web. " +
    "Returns extracted text content (HTML is converted to readable text). " +
    "Supports HTML pages, JSON APIs, and plain text. Does NOT execute JavaScript — " +
    "works best with server-rendered content (most sites). " +
    "For JS-heavy single-page apps, content may be limited. " +
    "Optionally pass a CSS selector to extract a specific section.",

  // Unified Memory Tools
  memoryWrite:
    "Write to user memory. Supports two types via the 'type' parameter:\n" +
    "- type='long_term' (default): Save permanent facts. Requires key, summary, content. " +
    "Use for: name, preferences, identity, instructions, stable facts. " +
    "Modes: 'merge' (PREFERRED — safely appends to existing or creates new), 'add' (create new key only, fails if exists), " +
    "'update' (REPLACES all content — DANGEROUS, always memoryRead first!).\n" +
    "- type='daily': Append a journal entry to today's daily note. Only requires content. " +
    "Use for: passing observations, mood, plans, conversation context, things discussed. " +
    "Daily notes expire after 30 days but get processed into long-term memories automatically.\n" +
    "IMPORTANT: Prefer mode='merge' to safely add info. NEVER use mode='update' without calling memoryRead first — it replaces ALL existing content. " +
    "Most memory extraction happens automatically in the background – use this tool for explicit user requests " +
    "('remember my name', 'note that...') and important things you want to capture right now.",
  
  memoryRead:
    "Read from user memory. ALWAYS call this before using memoryWrite with mode='update' to avoid losing existing content.\n" +
    "- type='long_term' (default): Read a specific long-term memory by key. " +
    "Memory summaries are always visible in LONG-TERM MEMORIES section — use this to get full content.\n" +
    "- type='daily': Read daily notes for a specific date (defaults to today).",
  
  memoryDelete:
    "Delete a long-term memory by key. " +
    "Use only when the user explicitly asks to forget something. " +
    "Daily notes expire automatically and cannot be deleted.",
} as const;

/**
 * Create the tools object for use with streamText
 * 
 * This function creates a tools configuration object that can be passed
 * directly to the Vercel AI SDK's streamText function.
 * 
 * @param context - Server-side context with logging, environment, and optional memory support
 * @param options - Tool profile selection for channel-specific capability filtering
 * @returns Tools configuration for streamText
 */
export function createChatTools(
  context: MemoryToolContext,
  options: { profile?: ChatToolProfile } = {}
) {
  const allTools = {
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
    // Web Fetch Tool (Server-side execution)
    // ============================================================================
    webFetch: {
      description: TOOL_DESCRIPTIONS.webFetch,
      inputSchema: schemas.webFetchSchema,
      execute: async (input: WebFetchInput) => {
        return executeWebFetch(input, context);
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

    // ============================================================================
    // Stickies Control Tools (Client-side execution)
    // ============================================================================
    stickiesControl: {
      description: TOOL_DESCRIPTIONS.stickiesControl,
      inputSchema: schemas.stickiesControlSchema,
      // No execute - handled client-side (requires Zustand store access)
    },

    // ============================================================================
    // Infinite Mac Emulator Control Tools (Client-side execution)
    // ============================================================================
    infiniteMacControl: {
      description: TOOL_DESCRIPTIONS.infiniteMacControl,
      inputSchema: schemas.infiniteMacControlSchema,
      // No execute - handled client-side (requires iframe postMessage access)
      // toModelOutput converts the tool result to multimodal content for the AI model
      toModelOutput: ({ output }: { output: unknown }) => {
        // Check if this is a readScreen result with image data
        const result = output as { screenImageDataUrl?: string; message?: string; screenSize?: { width: number; height: number } } | undefined;
        if (result?.screenImageDataUrl) {
          // Extract base64 data from data URL (remove "data:image/png;base64," prefix)
          const base64Match = result.screenImageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (base64Match) {
            const mediaType = base64Match[1];
            const base64Data = base64Match[2];
            // Return multimodal content with image for the AI to "see"
            return {
              type: "content" as const,
              value: [
                {
                  type: "text" as const,
                  text: result.message || "Screen captured from emulator.",
                },
                {
                  type: "image-data" as const,
                  data: base64Data,
                  mediaType,
                },
              ],
            };
          }
        }
        // For other outputs, return as JSON
        return { type: "json" as const, value: output };
      },
    },

    // ============================================================================
    // Calendar Control Tools (Client-side execution)
    // ============================================================================
    calendarControl: {
      description: TOOL_DESCRIPTIONS.calendarControl,
      inputSchema: schemas.calendarControlSchema,
      // No execute - handled client-side (requires Zustand store access)
    },
    contactsControl: {
      description: TOOL_DESCRIPTIONS.contactsControl,
      inputSchema: schemas.contactsControlSchema,
      // No execute - handled client-side in web chat, server-side in Telegram
    },

    // ============================================================================
    // TV Control Tools (Client-side execution)
    // ============================================================================
    tvControl: {
      description: TOOL_DESCRIPTIONS.tvControl,
      inputSchema: schemas.tvControlSchema,
      // No execute - handled client-side (requires Zustand store + browser fetch)
    },

    // ============================================================================
    // Unified Memory Tools (Server-side execution)
    // Handles both long-term memories and daily notes
    // ============================================================================
    memoryWrite: {
      description: TOOL_DESCRIPTIONS.memoryWrite,
      inputSchema: schemas.memoryWriteSchema,
      execute: async (input: MemoryWriteInput) => {
        return executeMemoryWrite(input, context);
      },
    },
    memoryRead: {
      description: TOOL_DESCRIPTIONS.memoryRead,
      inputSchema: schemas.memoryReadSchema,
      execute: async (input: MemoryReadInput) => {
        return executeMemoryRead(input, context);
      },
    },
    memoryDelete: {
      description: TOOL_DESCRIPTIONS.memoryDelete,
      inputSchema: schemas.memoryDeleteSchema,
      execute: async (input: MemoryDeleteInput) => {
        return executeMemoryDelete(input, context);
      },
    },
  };

  const profile = options.profile || "all";

  if (profile === "all") {
    return allTools;
  }

  if (profile === "telegram") {
    return {
      webFetch: allTools.webFetch,
      memoryWrite: allTools.memoryWrite,
      memoryRead: allTools.memoryRead,
      memoryDelete: allTools.memoryDelete,
      documentsControl: {
        description: TOOL_DESCRIPTIONS.documentsControl,
        inputSchema: schemas.documentsControlSchema,
        execute: async (input: DocumentsControlInput) => {
          return executeDocumentsControl(input, context);
        },
      },
      calendarControl: {
        description: TOOL_DESCRIPTIONS.calendarControl,
        inputSchema: schemas.calendarControlSchema,
        execute: async (input: CalendarControlInput) => {
          return executeCalendarControl(input, context);
        },
      },
      stickiesControl: {
        description: TOOL_DESCRIPTIONS.stickiesControl,
        inputSchema: schemas.stickiesControlSchema,
        execute: async (input: StickiesControlInput) => {
          return executeStickiesControl(input, context);
        },
      },
      contactsControl: {
        description: TOOL_DESCRIPTIONS.contactsControl,
        inputSchema: schemas.contactsControlSchema,
        execute: async (input: ContactsControlInput) => {
          return executeContactsControl(input, context);
        },
      },
      songLibraryControl: {
        description: TOOL_DESCRIPTIONS.songLibraryControl,
        inputSchema: schemas.songLibraryControlSchema,
        execute: async (input: SongLibraryControlInput) => {
          return executeSongLibraryControl(input, context);
        },
      },
    } as Pick<typeof allTools, (typeof _TELEGRAM_TOOL_NAMES)[number]>;
  }

  return Object.fromEntries(
    MEMORY_TOOL_NAMES.map((toolName) => [toolName, allTools[toolName]])
  ) as Pick<typeof allTools, (typeof MEMORY_TOOL_NAMES)[number]>;
}

/**
 * Type for the tools object returned by createChatTools
 */
export type ChatTools = ReturnType<typeof createChatTools>;
