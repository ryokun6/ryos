/**
 * Zod schemas for chat tool input validation
 * 
 * This module contains all the Zod schemas used to validate tool inputs.
 * Schemas are extracted here for better organization and reusability.
 */

import { z } from "zod";
import { appIds } from "../../../src/config/appIds.js";
import { THEME_IDS, LANGUAGE_CODES, VFS_PATHS, MEMORY_MODES } from "./types.js";
import {
  MAX_KEY_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_CONTENT_LENGTH,
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
  if ((data.action === "mouseMove" || data.action === "mouseClick") && (data.x === undefined || data.y === undefined)) {
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
// Memory Tool Schemas
// ============================================================================

/**
 * Memory write schema
 * Used to save/update user memories
 */
export const memoryWriteSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .regex(/^[a-z][a-z0-9_]*$/, {
      message: "Key must start with a letter and contain only lowercase letters, numbers, and underscores",
    })
    .describe(
      "Short key for this memory (e.g., 'name', 'music_pref', 'work_context'). Must start with a letter, contain only lowercase letters, numbers, underscores."
    ),
  summary: z
    .string()
    .min(1)
    .max(MAX_SUMMARY_LENGTH)
    .describe(
      `Brief 1-2 sentence summary of the memory (max ${MAX_SUMMARY_LENGTH} chars). This is always visible to you.`
    ),
  content: z
    .string()
    .min(1)
    .max(MAX_CONTENT_LENGTH)
    .describe(
      `Full detailed content of the memory (max ${MAX_CONTENT_LENGTH} chars). Retrieved via memoryRead.`
    ),
  mode: z
    .enum(MEMORY_MODES)
    .default("add")
    .describe(
      "'add' creates new memory (fails if key exists), 'update' replaces existing (fails if doesn't exist), 'merge' appends to existing or creates new."
    ),
});

/**
 * Memory read schema
 * Used to retrieve full memory details
 */
export const memoryReadSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .describe("The memory key to retrieve full details for."),
});

/**
 * Memory delete schema
 * Used to delete a specific memory
 */
export const memoryDeleteSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .describe("The memory key to delete."),
});
