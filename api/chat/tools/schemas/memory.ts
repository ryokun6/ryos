/**
 * Unified memory tool schemas
 */

import { z } from "zod";
import { MEMORY_TYPES, MEMORY_MODES } from "../types.js";
import {
  MAX_KEY_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_DAILY_NOTE_ENTRY_LENGTH,
} from "../../../_utils/_memory.js";

/**
 * Unified memory write schema
 * Handles both long-term memories and daily notes
 */
export const memoryWriteSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
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
          message:
            "Key must start with a letter and contain only lowercase letters, numbers, and underscores.",
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
export const memoryReadSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
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
