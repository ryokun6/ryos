/**
 * Media control and web-fetch tool schemas
 */

import { z } from "zod";
import { TV_ACTIONS } from "../types.js";

/**
 * Helper to normalize optional string values
 * Converts empty/whitespace strings and placeholder values to undefined
 */
export const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    // Treat empty strings and common AI placeholder values as undefined
    if (
      trimmed.length === 0 ||
      trimmed === "-" ||
      trimmed === "ignored" ||
      trimmed === "none" ||
      trimmed === "null" ||
      trimmed === "undefined"
    ) {
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
      message:
        "Do not provide 'id', 'title', or 'artist' when using playback state actions ('toggle', 'play', 'pause').",
      path: ["action"],
    });
  }

  if (
    (action === "next" || action === "previous") &&
    (id !== undefined || title !== undefined || artist !== undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Do not provide 'id', 'title', or 'artist' when using track navigation actions ('next', 'previous').",
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
    return baseSchema
      .extend({
        enableVideo: z
          .boolean()
          .optional()
          .describe("Enable video playback. Can be combined with any action."),
      })
      .superRefine(mediaControlRefinement);
  }

  return baseSchema.superRefine(mediaControlRefinement);
};

/**
 * iPod control schema (with video support)
 */
export const ipodControlSchema = createMediaControlSchema({ hasEnableVideo: true });

/**
 * Karaoke control schema (without video)
 */
export const karaokeControlSchema = createMediaControlSchema();

/**
 * Web Fetch Tool Schema
 */
/**
 * TV Control Schema
 */
export const tvControlSchema = z
  .object({
    action: z
      .enum(TV_ACTIONS)
      .describe(
        "Action to perform: " +
          "'list' returns the lineup (built-ins + custom channels), include videos when verbose; " +
          "'tune' switches the TV to a channel by id or number; " +
          "'createChannel' creates a new custom channel from a one-line theme/prompt — the server AI-plans the name, tagline, and lineup by fanning out YouTube searches; " +
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
    prompt: z
      .preprocess(
        normalizeOptionalString,
        z.string().min(2).max(280).optional()
      )
      .describe(
        "For 'createChannel' (REQUIRED): a one-line theme/description (e.g. 'skateboarding tricks', 'lofi beats to study to', '90s anime intros'). The server AI-plans the channel name, tagline, and 2-4 YouTube search queries, fans them out, dedupes, and builds the lineup. Do NOT manually pre-search videos — call createChannel directly with the user's intent as the prompt."
      ),
    name: z
      .preprocess(normalizeOptionalString, z.string().min(1).max(24).optional())
      .describe(
        "For 'createChannel' (optional): override the planner's channel name. Omit to let the server pick a punchy 1-3 word name."
      ),
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
      if (!data.prompt || !data.prompt.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "The 'createChannel' action requires a 'prompt' (one-line theme/description). The server fans out YouTube searches automatically — do not pre-pick videos.",
          path: ["prompt"],
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

/**
 * Web Fetch Tool Schema
 */
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
