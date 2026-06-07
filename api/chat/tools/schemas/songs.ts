/**
 * Song search and library tool schemas
 */

import { z } from "zod";
import { SONG_LIBRARY_ACTIONS, SONG_LIBRARY_SCOPES } from "../types.js";
import { normalizeOptionalString } from "./media.js";

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
      .describe(
        "Maximum number of songs to return for 'list', 'search', or 'searchYoutube' (1-25, default 5)."
      ),
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
