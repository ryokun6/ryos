/**
 * Zod schemas for chat tool input validation
 * 
 * This module contains all the Zod schemas used to validate tool inputs.
 * Schemas are extracted here for better organization and reusability.
 */

import { z } from "zod";
import { appIds } from "../../../src/config/appIds.js";
import {
  THEME_IDS,
  LANGUAGE_CODES,
  VFS_PATHS,
  MEMORY_TYPES,
  MEMORY_MODES,
  CALENDAR_ACTIONS,
  CALENDAR_COLORS,
  CONTACT_ACTIONS,
  DOCUMENTS_ACTIONS,
  DOCUMENT_WRITE_MODES,
  SONG_LIBRARY_ACTIONS,
  SONG_LIBRARY_SCOPES,
  TV_ACTIONS,
} from "./types.js";
import {
  MAX_KEY_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_DAILY_NOTE_ENTRY_LENGTH,
} from "../../_utils/_memory.js";

/**
 * Helper to normalize optional string values
 * Converts empty/whitespace strings and placeholder values to undefined
 */
export const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    // Treat empty strings and common AI placeholder values as undefined
    if (trimmed.length === 0 || trimmed === "-" || trimmed === "ignored" || trimmed === "none" || trimmed === "null" || trimmed === "undefined") {
      return undefined;
    }
    return value.toString().trim();
  }
  return value;
};

/**
 * Shared media control schema validation refinement
 * Validates that the correct parameters are provided for each action type
 */
export const mediaControlRefinement = (
  data: { action: string; id?: string; title?: string; artist?: string },
  ctx: z.RefinementCtx
) => {
  const { action, id, title, artist } = data;

  if (action === "addAndPlay") {
    if (!id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'addAndPlay' action requires the 'id' parameter (YouTube ID or URL).",
        path: ["id"],
      });
    }
    if (title !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Do not provide 'title' when using 'addAndPlay' (information is fetched automatically).",
        path: ["title"],
      });
    }
    if (artist !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Do not provide 'artist' when using 'addAndPlay' (information is fetched automatically).",
        path: ["artist"],
      });
    }
    return;
  }

  // playKnown with no identifiers is allowed - handler will treat it as toggle/play current
  if (action === "playKnown") {
    return;
  }

  if (
    (action === "toggle" || action === "play" || action === "pause") &&
    (id !== undefined || title !== undefined || artist !== undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Do not provide 'id', 'title', or 'artist' when using playback state actions ('toggle', 'play', 'pause').",
      path: ["action"],
    });
  }

  if (
    (action === "next" || action === "previous") &&
    (id !== undefined || title !== undefined || artist !== undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Do not provide 'id', 'title', or 'artist' when using track navigation actions ('next', 'previous').",
      path: ["action"],
    });
  }
};

/**
 * Factory for creating media control schemas (iPod, Karaoke)
 */
export const createMediaControlSchema = (options: { hasEnableVideo?: boolean } = {}) => {
  const baseSchema = z.object({
    action: z
      .enum(["toggle", "play", "pause", "playKnown", "addAndPlay", "next", "previous"])
      .default("toggle")
      .describe("Playback operation to perform. Defaults to 'toggle' when omitted."),
    id: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe("For 'playKnown' (optional) or 'addAndPlay' (required): YouTube video ID or supported URL."),
    title: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe("For 'playKnown': The title (or part of it) of the song to play."),
    artist: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe("For 'playKnown': The artist name (or part of it) of the song to play."),
    enableTranslation: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe(
        "ONLY use when user explicitly requests translated lyrics. Set to language code (e.g., 'en', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'it', 'ru') to translate, or 'off'/'original' to show original lyrics. By default, do NOT set this - lyrics should remain in original language."
      ),
    enableFullscreen: z
      .boolean()
      .optional()
      .describe("Enable fullscreen mode. Can be combined with any action."),
  });

  if (options.hasEnableVideo) {
    return baseSchema.extend({
      enableVideo: z
        .boolean()
        .optional()
        .describe("Enable video playback. Can be combined with any action."),
    }).superRefine(mediaControlRefinement);
  }

  return baseSchema.superRefine(mediaControlRefinement);
};

/**
 * Year validation for Internet Explorer time travel
 */
const yearRefinement = (year: string | undefined) => {
  if (year === undefined) return true;
  
  const allowedYearsRegex =
    /^(current|1000 BC|1 CE|500|800|1000|1200|1400|1600|1700|1800|19[0-8][0-9]|199[0-5]|199[1-9]|20[0-2][0-9]|2030|2040|2050|2060|2070|2080|2090|2100|2150|2200|2250|2300|2400|2500|2750|3000)$/;
  
  const currentYearNum = new Date().getFullYear();
  if (/^\d{4}$/.test(year)) {
    const numericYear = parseInt(year, 10);
    if (numericYear >= 1991 && numericYear < currentYearNum) {
      return true;
    }
  }
  
  return allowedYearsRegex.test(year);
};

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * Launch app schema
 */
export const launchAppSchema = z
  .object({
    id: z.enum(appIds).describe("The app id to launch"),
    url: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe(
        "For internet-explorer only: The URL to load in Internet Explorer. Omit https:// and www. from the URL."
      ),
    year: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe(
        "For internet-explorer only: The year for the Wayback Machine or AI generation."
      )
      .refine(yearRefinement, {
        message: "Invalid year format or value.",
      }),
  })
  .refine(
    (data) => {
      if (data.id === "internet-explorer") {
        const urlProvided = data.url !== undefined && data.url !== null && data.url !== "";
        const yearProvided = data.year !== undefined && data.year !== null && data.year !== "";
        return (urlProvided && yearProvided) || (!urlProvided && !yearProvided);
      }
      if (data.url !== undefined || data.year !== undefined) {
        return false;
      }
      return true;
    },
    {
      message: "For 'internet-explorer', provide both 'url' and 'year', or neither. For other apps, do not provide 'url' or 'year'.",
    }
  );

/**
 * Close app schema
 */
export const closeAppSchema = z.object({
  id: z.enum(appIds).describe("The app id to close"),
});

/**
 * iPod control schema (with video support)
 */
export const ipodControlSchema = createMediaControlSchema({ hasEnableVideo: true });

/**
 * Karaoke control schema (without video)
 */
export const karaokeControlSchema = createMediaControlSchema();

/**
 * Generate HTML schema
 */
export const generateHtmlSchema = z.object({
  html: z
    .string()
    .describe(
      "The HTML code to render. It should follow the guidelines in CODE_GENERATION_INSTRUCTIONS—omit <head>/<body> tags and include only the body contents."
    ),
  title: z
    .string()
    .optional()
    .describe(
      "A short, descriptive title for this HTML applet (e.g., 'Calculator', 'Todo List', 'Color Picker'). This will be used as the default filename when the user saves the applet. Omit file extensions."
    ),
  icon: z
    .string()
    .optional()
    .describe(
      "A single emoji character to use as the applet icon (e.g., '🧮', '📝', '🎨'). This emoji will be displayed in the Finder and as the app icon."
    ),
});

/**
 * Aquarium schema (no input required)
 */
export const aquariumSchema = z.object({});

/**
 * List schema (VFS)
 */
export const listSchema = z.object({
  path: z
    .enum(VFS_PATHS)
    .describe(
      "The directory path to list: '/Applets' for local applets, '/Documents' for documents, '/Applications' for apps, '/Music' for iPod songs, '/Applets Store' for shared applets"
    ),
  query: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Optional search query to filter results (only used for '/Applets Store' path). Case-insensitive substring match on title, name, or creator."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Optional maximum number of results to return (default 25, only used for '/Applets Store' path)."
    ),
});

/**
 * Open schema (VFS)
 */
export const openSchema = z.object({
  path: z
    .string()
    .describe(
      "The EXACT path from list results. Examples:\n" +
      "- '/Applets/Calculator.app' - Open local applet\n" +
      "- '/Documents/notes.md' - Open document in TextEdit\n" +
      "- '/Applications/internet-explorer' - Launch app\n" +
      "- '/Music/{id}' - Play song by ID\n" +
      "- '/Applets Store/{id}' - Preview shared applet"
    ),
});

/**
 * Read schema (VFS)
 */
export const readSchema = z.object({
  path: z
    .string()
    .describe(
      "The file path to read. Must be from /Applets, /Documents, or /Applets Store. Use exact path from list results or store applet ID for shared applets."
    ),
});

/**
 * Write schema (VFS)
 */
export const writeSchema = z.object({
  path: z
    .string()
    .describe(
      "Full file path including .md extension. Example: '/Documents/my-notes.md' or '/Documents/Meeting Notes.md'"
    ),
  content: z.string().describe("The markdown content to write."),
  mode: z
    .enum(["overwrite", "append", "prepend"])
    .optional()
    .describe(
      "Write mode: 'overwrite' replaces content (default), 'append' adds to end, 'prepend' adds to start."
    ),
});

/**
 * Edit schema (VFS)
 */
export const editSchema = z.object({
  path: z
    .string()
    .describe("The file path to edit. Must be in /Documents or /Applets."),
  old_string: z
    .string()
    .describe(
      "The text to replace (must be unique within the file, and must match exactly including whitespace and indentation)."
    ),
  new_string: z
    .string()
    .describe("The edited text to replace the old_string."),
});

/**
 * Search songs schema
 */
export const searchSongsSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "The search query. Include 'music video' or 'MV' for better results. Example: 'Never Gonna Give You Up Rick Astley music video'"
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of results to return (1-10, default 5)"),
});

/**
 * Song library control schema
 */
export const songLibraryControlSchema = z
  .object({
    action: z
      .enum(SONG_LIBRARY_ACTIONS)
      .describe(
        "Action to perform: 'list' returns recent songs from the selected scope, 'search' finds songs by id/title/artist/album, 'get' returns detailed metadata for one song id, 'searchYoutube' searches YouTube for songs to add, and 'add' adds a YouTube song into the shared cache plus the signed-in user's library."
      ),
    scope: z
      .enum(SONG_LIBRARY_SCOPES)
      .optional()
      .default("any")
      .describe(
        "Where to search: 'user' = the signed-in user's synced library, 'global' = the server song/lyrics cache, 'any' = both with user-library songs preferred."
      ),
    query: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("For 'search': query text matched against id, title, artist, album, and creator."),
    id: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("For 'get': exact song id / YouTube id."),
    videoId: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("For 'add': exact YouTube video id."),
    url: z
      .preprocess(normalizeOptionalString, z.string().url().max(1000).optional())
      .describe("For 'add': YouTube URL as an alternative to videoId."),
    title: z
      .preprocess(normalizeOptionalString, z.string().max(300).optional())
      .describe("For 'add': optional title to save. Pass the YouTube result title when available."),
    artist: z
      .preprocess(normalizeOptionalString, z.string().max(300).optional())
      .describe("For 'add': optional artist/channel name to save."),
    album: z
      .preprocess(normalizeOptionalString, z.string().max(300).optional())
      .describe("For 'add': optional album name to save."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(5)
      .describe("Maximum number of songs to return for 'list', 'search', or 'searchYoutube' (1-25, default 5)."),
  })
  .superRefine((data, ctx) => {
    if ((data.action === "search" || data.action === "searchYoutube") && !data.query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'query' parameter.`,
        path: ["query"],
      });
    }

    if (data.action === "get" && !data.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'get' action requires the 'id' parameter.",
        path: ["id"],
      });
    }

    if (data.action === "add" && !data.videoId && !data.url && !data.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'add' action requires 'videoId', 'url', or 'id'.",
        path: ["videoId"],
      });
    }
  });

/**
 * Settings schema
 */
export const settingsSchema = z.object({
  language: z
    .enum(LANGUAGE_CODES)
    .optional()
    .describe(
      "Change the system language. Supported: 'en' (English), 'zh-TW' (Traditional Chinese), 'ja' (Japanese), 'ko' (Korean), 'fr' (French), 'de' (German), 'es' (Spanish), 'pt' (Portuguese), 'it' (Italian), 'ru' (Russian)."
    ),
  theme: z
    .enum(THEME_IDS)
    .optional()
    .describe(
      'Change the OS theme. One of "system7" (Mac OS 7), "macosx" (Mac OS X), "xp" (Windows XP), "win98" (Windows 98).'
    ),
  masterVolume: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      "Set the master volume (0-1). Affects all system sounds including UI sounds, speech, and music. Use 0 to mute."
    ),
  speechEnabled: z
    .boolean()
    .optional()
    .describe(
      "Enable or disable text-to-speech for AI responses. When enabled, the AI's responses will be read aloud."
    ),
  checkForUpdates: z
    .boolean()
    .optional()
    .describe(
      "When true, triggers a check for ryOS updates. Will notify the user if an update is available."
    ),
});

/**
 * Stickies control schema
 */
export const stickiesControlSchema = z.object({
  action: z
    .enum(["list", "create", "update", "delete", "clear"])
    .describe(
      "Action to perform: 'list' returns all stickies, 'create' creates a new sticky, 'update' modifies an existing sticky, 'delete' removes a sticky by ID, 'clear' removes all stickies."
    ),
  id: z
    .string()
    .optional()
    .describe(
      "For 'update' and 'delete' actions: the ID of the sticky to modify or remove."
    ),
  content: z
    .string()
    .optional()
    .describe(
      "For 'create' and 'update' actions: the text content to set or replace on the sticky note. Use this to write messages, notes, or any text."
    ),
  color: z
    .enum(["yellow", "blue", "green", "pink", "purple", "orange"])
    .optional()
    .describe(
      "For 'create' and 'update' actions: the color of the sticky note. Defaults to 'yellow' for new stickies."
    ),
  position: z
    .object({
      x: z.number().describe("X coordinate (pixels from left)"),
      y: z.number().describe("Y coordinate (pixels from top)"),
    })
    .optional()
    .describe(
      "For 'create' and 'update' actions: the position of the sticky note on screen."
    ),
  size: z
    .object({
      width: z.number().min(100).max(800).describe("Width in pixels (100-800)"),
      height: z.number().min(100).max(800).describe("Height in pixels (100-800)"),
    })
    .optional()
    .describe(
      "For 'create' and 'update' actions: the size of the sticky note."
    ),
}).superRefine((data, ctx) => {
  // Validate that 'update' and 'delete' actions have an ID
  if ((data.action === "update" || data.action === "delete") && !data.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `The '${data.action}' action requires the 'id' parameter.`,
      path: ["id"],
    });
  }
});

/**
 * Infinite Mac control schema
 * Controls the Infinite Mac emulator via postMessage API
 */
export const infiniteMacControlSchema = z.object({
  action: z
    .enum([
      "launchSystem",
      "getStatus",
      "readScreen",
      "mouseMove",
      "mouseClick",
      "doubleClick",
      "keyPress",
      "pause",
      "unpause",
    ])
    .describe(
      "Action to perform: 'launchSystem' launches a Mac OS system, 'getStatus' returns emulator state, " +
      "'readScreen' captures the current screen as an image, 'mouseMove' moves the mouse cursor, " +
      "'mouseClick' single-clicks at a position, 'doubleClick' double-clicks at a position (for opening files/folders), " +
      "'keyPress' sends a key press, 'pause'/'unpause' controls emulation."
    ),
  system: z
    .enum([
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
    ])
    .optional()
    .describe(
      "For 'launchSystem': The Mac OS system to launch. Options: " +
      "'system-1' (System 1.0, 1984), 'system-6' (System 6.0.8, 1991), " +
      "'system-7-5' (System 7.5.3, 1996), 'kanjitalk-7-5' (Japanese System 7.5.3), " +
      "'macos-8' (Mac OS 8.0, 1997), 'macos-8-5' (Mac OS 8.5, 1998), " +
      "'macos-9' (Mac OS 9.0, 1999), 'macos-9-2' (Mac OS 9.2.2, 2001), " +
      "'macosx-10-1' (Mac OS X 10.1, 2001), 'macosx-10-2' (Mac OS X 10.2, 2002), " +
      "'macosx-10-3' (Mac OS X 10.3, 2003), 'macosx-10-4' (Mac OS X 10.4, 2005)."
    ),
  x: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("For 'mouseMove' and 'mouseClick': X coordinate in screen pixels."),
  y: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("For 'mouseMove' and 'mouseClick': Y coordinate in screen pixels."),
  button: z
    .enum(["left", "right"])
    .optional()
    .default("left")
    .describe("For 'mouseClick': Which mouse button to click. Defaults to 'left'."),
  key: z
    .string()
    .optional()
    .describe(
      "For 'keyPress': The key to press. Use JavaScript key codes like 'KeyA', 'KeyB', 'Enter', 'Space', " +
      "'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab', 'Escape', etc."
    ),
}).superRefine((data, ctx) => {
  // Validate action-specific required parameters
  if (data.action === "launchSystem" && !data.system) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The 'launchSystem' action requires the 'system' parameter.",
      path: ["system"],
    });
  }
  if ((data.action === "mouseMove" || data.action === "mouseClick" || data.action === "doubleClick") && (data.x === undefined || data.y === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `The '${data.action}' action requires both 'x' and 'y' parameters.`,
      path: ["x"],
    });
  }
  if (data.action === "keyPress" && !data.key) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The 'keyPress' action requires the 'key' parameter.",
      path: ["key"],
    });
  }
});

// ============================================================================
// Calendar Control Schema
// ============================================================================

/**
 * Calendar control schema
 */
export const calendarControlSchema = z.object({
  action: z
    .enum(CALENDAR_ACTIONS)
    .describe(
      "Action to perform: 'list' returns events (optionally filtered by date), " +
      "'create' adds a new event, 'update' modifies an existing event by ID, " +
      "'delete' removes an event by ID. " +
      "Todo actions: 'listTodos' returns all todos (optionally filter by completed status), " +
      "'createTodo' adds a new todo, 'toggleTodo' toggles completion by ID, " +
      "'deleteTodo' removes a todo by ID."
    ),
  id: z
    .string()
    .optional()
    .describe("For 'update', 'delete', 'toggleTodo', and 'deleteTodo' actions: the item ID."),
  title: z
    .string()
    .max(200)
    .optional()
    .describe("For 'create', 'update', and 'createTodo': the title."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be YYYY-MM-DD format" })
    .optional()
    .describe("For events: event date (YYYY-MM-DD). For 'createTodo': optional due date. For 'list': filter events by date. For 'listTodos': filter by due date — OMIT to return ALL todos (most todos have no due date)."),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { message: "Time must be HH:MM format" })
    .optional()
    .describe("For 'create' and 'update': start time (HH:MM). Omit for all-day events."),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { message: "Time must be HH:MM format" })
    .optional()
    .describe("For 'create' and 'update': end time (HH:MM). Omit for all-day events."),
  color: z
    .enum(CALENDAR_COLORS)
    .optional()
    .describe("Event color: 'blue', 'red', 'green', 'orange', or 'purple'. Defaults to 'blue'."),
  notes: z
    .string()
    .max(500)
    .optional()
    .describe("Optional notes for the event."),
  completed: z
    .boolean()
    .optional()
    .describe("For 'listTodos': filter by completion status (true = completed, false = pending, omit = all)."),
  calendarId: z
    .string()
    .optional()
    .describe("For 'createTodo': which calendar to assign the todo to (e.g. 'home', 'work'). Defaults to the first calendar."),
}).superRefine((data, ctx) => {
  if (data.action === "create" && !data.title) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The 'create' action requires the 'title' parameter.",
      path: ["title"],
    });
  }
  if (data.action === "create" && !data.date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The 'create' action requires the 'date' parameter (YYYY-MM-DD).",
      path: ["date"],
    });
  }
  if ((data.action === "update" || data.action === "delete") && !data.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `The '${data.action}' action requires the 'id' parameter.`,
      path: ["id"],
    });
  }
  if (data.action === "createTodo" && !data.title) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The 'createTodo' action requires the 'title' parameter.",
      path: ["title"],
    });
  }
  if ((data.action === "toggleTodo" || data.action === "deleteTodo") && !data.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `The '${data.action}' action requires the 'id' parameter.`,
      path: ["id"],
    });
  }
});

// ============================================================================
// Contacts Control Schema
// ============================================================================

export const contactsControlSchema = z
  .object({
    action: z
      .enum(CONTACT_ACTIONS)
      .describe(
        "Action to perform: 'list' searches/list contacts, 'get' returns one contact by id, 'create' adds a contact, 'update' modifies a contact by id, and 'delete' removes a contact by id."
      ),
    id: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe("For 'get', 'update', and 'delete': the contact id returned by 'list'."),
    query: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("For 'list': optional search query across names, phones, emails, notes, and telegram fields."),
    displayName: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("Primary display name for the contact."),
    firstName: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("First name."),
    lastName: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Last name."),
    nickname: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Nickname."),
    organization: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("Organization or company."),
    title: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("Job title."),
    notes: z
      .preprocess(normalizeOptionalString, z.string().max(2000).optional())
      .describe("Free-form notes."),
    emails: z.array(z.string().max(320)).max(20).optional().describe("Email addresses."),
    phones: z.array(z.string().max(80)).max(20).optional().describe("Phone numbers."),
    urls: z
      .array(z.string().max(500))
      .max(20)
      .optional()
      .describe("URLs such as websites or social profiles."),
    addresses: z
      .array(z.string().max(500))
      .max(20)
      .optional()
      .describe("Postal addresses as formatted strings."),
    birthday: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "Birthday must be YYYY-MM-DD format",
      })
      .nullable()
      .optional()
      .describe("Birthday in YYYY-MM-DD format."),
    telegramUsername: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Telegram username without the @ prefix."),
    telegramUserId: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Telegram user id as a string."),
  })
  .superRefine((data, ctx) => {
    if (
      (data.action === "get" || data.action === "update" || data.action === "delete") &&
      !data.id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'id' parameter.`,
        path: ["id"],
      });
    }

    if (data.action === "update") {
      const hasUpdates = Boolean(
        data.displayName ||
          data.firstName ||
          data.lastName ||
          data.nickname ||
          data.organization ||
          data.title ||
          data.notes ||
          data.telegramUsername ||
          data.telegramUserId ||
          data.birthday ||
          data.emails?.length ||
          data.phones?.length ||
          data.urls?.length ||
          data.addresses?.length
      );

      if (!hasUpdates) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'update' action requires at least one field to change.",
          path: ["action"],
        });
      }
    }

    if (data.action === "create") {
      const hasIdentity = Boolean(
        data.displayName ||
          data.firstName ||
          data.lastName ||
          data.organization ||
          data.telegramUsername ||
          data.telegramUserId ||
          data.emails?.length ||
          data.phones?.length
      );

      if (!hasIdentity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "The 'create' action requires at least a name, organization, email, phone, or telegram field.",
          path: ["action"],
        });
      }
    }
  });

// ============================================================================
// Documents Control Schema
// ============================================================================

export const documentsControlSchema = z
  .object({
    action: z
      .enum(DOCUMENTS_ACTIONS)
      .describe(
        "Action to perform: 'list' returns synced /Documents files with their names and exact paths, 'read' returns a document's content, 'write' creates or overwrites/appends/prepends a document, and 'edit' replaces one exact string match inside a document."
      ),
    path: z
      .string()
      .optional()
      .describe(
        "For 'read', 'write', and 'edit': full document path under /Documents, e.g. '/Documents/notes.md'."
      ),
    content: z
      .string()
      .optional()
      .describe("For 'write': markdown content to save. Required for writes."),
    mode: z
      .enum(DOCUMENT_WRITE_MODES)
      .optional()
      .default("overwrite")
      .describe(
        "For 'write': 'overwrite' replaces content, 'append' adds to the end, 'prepend' adds to the start."
      ),
    old_string: z
      .string()
      .optional()
      .describe(
        "For 'edit': exact text to replace. Must match uniquely within the document."
      ),
    new_string: z.string().optional().describe("For 'edit': replacement text."),
  })
  .superRefine((data, ctx) => {
    const path = data.path?.trim();
    const requiresPath =
      data.action === "read" || data.action === "write" || data.action === "edit";

    if (requiresPath && !path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'path' parameter.`,
        path: ["path"],
      });
    }

    if (path) {
      if (!path.startsWith("/Documents/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Document paths must be under /Documents.",
          path: ["path"],
        });
      }
      if (!path.endsWith(".md")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Document paths must end with .md.",
          path: ["path"],
        });
      }
    }

    if (data.action === "write" && data.content === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'write' action requires the 'content' parameter.",
        path: ["content"],
      });
    }

    if (data.action === "edit" && data.old_string === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'edit' action requires the 'old_string' parameter.",
        path: ["old_string"],
      });
    }

    if (data.action === "edit" && data.new_string === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'edit' action requires the 'new_string' parameter.",
        path: ["new_string"],
      });
    }
  });

// ============================================================================
// Web Fetch Tool Schema
// ============================================================================

export const webFetchSchema = z.object({
  url: z
    .string()
    .min(1)
    .max(2048)
    .describe(
      "The URL to fetch. Must be a public HTTP/HTTPS URL. " +
      "Examples: 'https://example.com', 'https://en.wikipedia.org/wiki/TypeScript'"
    ),
  selector: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Optional CSS selector to extract a specific section of the page. " +
      "Examples: 'article', 'main', '.content', '#body-text'. " +
      "If omitted, extracts the main content automatically."
    ),
});

// ============================================================================
// TV Control Schema
// ============================================================================

const tvVideoEntrySchema = z.union([
  z
    .preprocess(normalizeOptionalString, z.string().min(1).max(1000))
    .describe("YouTube video id (11 chars) or full YouTube URL."),
  z.object({
    videoId: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("YouTube video id."),
    url: z
      .preprocess(normalizeOptionalString, z.string().max(1000).optional())
      .describe("YouTube URL (used if videoId is omitted)."),
    title: z
      .preprocess(normalizeOptionalString, z.string().max(300).optional())
      .describe("Optional title (otherwise looked up automatically)."),
    artist: z
      .preprocess(normalizeOptionalString, z.string().max(300).optional())
      .describe("Optional artist/channel."),
  }),
]);

export const tvControlSchema = z
  .object({
    action: z
      .enum(TV_ACTIONS)
      .describe(
        "Action to perform: " +
          "'list' returns the lineup (built-ins + custom channels), include videos when verbose; " +
          "'tune' switches the TV to a channel by id or number; " +
          "'createChannel' adds a new custom channel (optionally seeded with videos); " +
          "'deleteChannel' removes a custom channel by id; " +
          "'addVideo' appends a YouTube video to a custom channel; " +
          "'removeVideo' removes a video from a custom channel."
      ),
    channelId: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe(
        "Channel id from a previous 'list' (short id like 'ch3' or full id). Required for 'tune'/'deleteChannel'/'addVideo'/'removeVideo' unless 'channelNumber' is used for 'tune'."
      ),
    channelNumber: z
      .number()
      .int()
      .min(1)
      .max(999)
      .optional()
      .describe(
        "For 'tune': switch by displayed channel number (e.g. 1 = RyoTV, 2 = MTV)."
      ),
    name: z
      .preprocess(normalizeOptionalString, z.string().min(1).max(24).optional())
      .describe("For 'createChannel': channel name (1-24 chars, evocative, not generic)."),
    description: z
      .preprocess(
        normalizeOptionalString,
        z.string().min(1).max(120).optional()
      )
      .describe("For 'createChannel': optional one-line description/tagline."),
    videoId: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("For 'addVideo': YouTube video id (11 chars)."),
    url: z
      .preprocess(normalizeOptionalString, z.string().max(1000).optional())
      .describe("For 'addVideo': YouTube URL (alternative to videoId)."),
    title: z
      .preprocess(normalizeOptionalString, z.string().max(300).optional())
      .describe(
        "For 'addVideo': optional explicit video title (otherwise looked up from YouTube oEmbed)."
      ),
    artist: z
      .preprocess(normalizeOptionalString, z.string().max(300).optional())
      .describe("For 'addVideo': optional explicit artist/channel name."),
    removeVideoId: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("For 'removeVideo': the YouTube video id to remove from the channel."),
    videos: z
      .array(tvVideoEntrySchema)
      .max(50)
      .optional()
      .describe(
        "For 'createChannel' (optional): seed videos for the new channel. Each entry can be a YouTube id/URL string or an object with videoId/url and optional title/artist."
      ),
  })
  .superRefine((data, ctx) => {
    if (data.action === "tune") {
      if (!data.channelId && data.channelNumber === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'tune' action requires 'channelId' or 'channelNumber'.",
          path: ["channelId"],
        });
      }
    }
    if (data.action === "createChannel") {
      if (!data.name || !data.name.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'createChannel' action requires the 'name' parameter.",
          path: ["name"],
        });
      }
    }
    if (data.action === "deleteChannel" && !data.channelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'deleteChannel' action requires the 'channelId' parameter.",
        path: ["channelId"],
      });
    }
    if (data.action === "addVideo") {
      if (!data.channelId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'addVideo' action requires the 'channelId' parameter.",
          path: ["channelId"],
        });
      }
      if (!data.videoId && !data.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'addVideo' action requires 'videoId' or 'url'.",
          path: ["videoId"],
        });
      }
    }
    if (data.action === "removeVideo") {
      if (!data.channelId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'removeVideo' action requires the 'channelId' parameter.",
          path: ["channelId"],
        });
      }
      if (!data.removeVideoId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'removeVideo' action requires the 'removeVideoId' parameter.",
          path: ["removeVideoId"],
        });
      }
    }
  });

// ============================================================================
// Unified Memory Tool Schemas
// ============================================================================

/**
 * Unified memory write schema
 * Handles both long-term memories and daily notes
 */
export const memoryWriteSchema = z.object({
  type: z
    .enum(MEMORY_TYPES)
    .default("long_term")
    .describe(
      "'long_term' for permanent facts (name, preferences, identity). 'daily' for journal entries (observations, context, passing details). Defaults to 'long_term'."
    ),
  key: z
    .string()
    .max(MAX_KEY_LENGTH)
    .optional()
    .describe(
      "Required for long_term. Short key (e.g., 'name', 'music_pref'). Ignored for daily."
    ),
  summary: z
    .string()
    .max(MAX_SUMMARY_LENGTH)
    .optional()
    .describe(
      `Required for long_term. Brief 1-2 sentence summary (max ${MAX_SUMMARY_LENGTH} chars). Ignored for daily.`
    ),
  content: z
    .string()
    .min(1)
    .max(MAX_CONTENT_LENGTH)
    .describe(
      `The content to store. For long_term: detailed info (max ${MAX_CONTENT_LENGTH} chars). For daily: a brief note (max ${MAX_DAILY_NOTE_ENTRY_LENGTH} chars).`
    ),
  mode: z
    .enum(MEMORY_MODES)
    .default("merge")
    .describe(
      "For long_term only. 'merge' (PREFERRED — appends new content to existing, or creates if new). " +
      "'add' (create new key, fails if exists). " +
      "'update' (REPLACES all content — only use after memoryRead). Ignored for daily."
    ),
}).superRefine((data, ctx) => {
  if (data.type === "long_term") {
    if (!data.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Key is required for long_term memories.",
        path: ["key"],
      });
    } else if (!/^[a-z][a-z0-9_]*$/.test(data.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Key must start with a letter and contain only lowercase letters, numbers, and underscores.",
        path: ["key"],
      });
    }
    if (!data.summary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Summary is required for long_term memories.",
        path: ["summary"],
      });
    }
  }
  if (data.type === "daily" && data.content.length > MAX_DAILY_NOTE_ENTRY_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Daily note content must be ${MAX_DAILY_NOTE_ENTRY_LENGTH} chars or less.`,
      path: ["content"],
    });
  }
});

/**
 * Unified memory read schema
 * Handles both long-term memories and daily notes
 */
export const memoryReadSchema = z.object({
  type: z
    .enum(MEMORY_TYPES)
    .default("long_term")
    .describe(
      "'long_term' to read a specific memory by key. 'daily' to read daily notes for a date."
    ),
  key: z
    .string()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .optional()
    .describe("Required for long_term. The memory key to retrieve."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be YYYY-MM-DD format" })
    .optional()
    .describe("For daily only. Date in YYYY-MM-DD format. Defaults to today."),
}).superRefine((data, ctx) => {
  if (data.type === "long_term" && !data.key) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Key is required when reading long_term memories.",
      path: ["key"],
    });
  }
});

/**
 * Memory delete schema (long-term only)
 */
export const memoryDeleteSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .describe("The long-term memory key to delete."),
});
