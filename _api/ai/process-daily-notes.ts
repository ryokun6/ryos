/**
 * POST /api/ai/process-daily-notes
 * 
 * Processes unprocessed daily notes (excluding today) into long-term memories.
 * 
 * Daily notes accumulate throughout each day as the user chats. Once a day is
 * complete (i.e. it's no longer "today"), its notes should be reviewed and any
 * stable, lasting facts should be extracted into long-term memory.
 * 
 * This endpoint:
 * 1. Finds all unprocessed daily notes from past days (not today)
 * 2. Feeds each day's entries to an AI model to extract long-term memories
 * 3. Consolidates extracted memories with existing ones (dedup/merge)
 * 4. Marks each processed daily note as processed
 * 
 * Trigger points:
 * - Called from /api/chat as background fire-and-forget on authenticated requests
 * - Called from frontend on chat clear (fire-and-forget)
 */

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { createApiHandler } from "../_utils/handler.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  upsertMemory,
  deleteMemory,
  getUnprocessedDailyNotesExcludingToday,
  markDailyNoteProcessed,
  cleanupStaleTemporaryMemories,
  MAX_MEMORIES_PER_USER,
  CANONICAL_MEMORY_KEYS,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================================
// Schemas
// ============================================================================

/** Schema for memories extracted from daily notes */
const dailyNotesExtractionSchema = z.object({
  longTermMemories: z.array(z.object({
    key: z.string().min(1).max(30)
      .describe("Canonical key (lowercase, underscores)"),
    summary: z.string().min(1).max(180)
      .describe("Brief summary of the stable fact about the USER"),
    content: z.string().min(1).max(2000)
      .describe("Detailed info about the USER to remember permanently"),
    confidence: z.enum(["high", "medium"])
      .describe("high = user directly stated it, medium = strong inference from notes"),
    relatedKeys: z.array(z.string()).optional()
      .describe("Existing memory keys covering the same topic (for merging)"),
  })).describe("Stable, permanent facts about the USER extracted from daily notes. Do NOT duplicate existing memories."),
});

/** Schema for consolidation (same as extract-memories) */
const consolidationSchema = z.object({
  summary: z.string().min(1).max(180)
    .describe("Deduplicated summary combining all info"),
  content: z.string().min(1).max(2000)
    .describe("Deduplicated content – no repeated info, newer wins conflicts"),
});

// ============================================================================
// Prompts
// ============================================================================

const DAILY_NOTES_EXTRACTION_PROMPT = `You are analyzing daily journal notes about a USER to extract permanent long-term memories.

These notes were collected by an AI assistant ("Ryo") during conversations over past days.
Each day's notes capture what the user discussed, their mood, plans, topics, and context.

Your job: identify STABLE, LASTING facts worth remembering permanently.

CANONICAL KEYS: ${CANONICAL_MEMORY_KEYS.join(", ")}

What qualifies as a long-term memory:
- Identity facts (name, birthday, location)
- Stable life facts (job, company, role, pets, family members)
- Lasting preferences (food, music, entertainment, communication style)
- Skills and expertise
- Ongoing projects or goals (if mentioned repeatedly or explicitly stated as long-term)

What does NOT qualify:
- Temporary moods or feelings ("user seemed tired")
- One-off daily events ("user had lunch at 2pm")
- Passing mentions without substance
- Things already captured in existing memories
- Conversation artifacts (greetings, thanks, small talk)

RULES:
- Use canonical keys when the topic matches
- Only extract NEW info not already in existing memories
- If an existing memory key covers the same topic, list it in relatedKeys for merging
- confidence "high" = user directly stated, "medium" = strong inference from pattern across notes
- Look for PATTERNS across multiple days — repeated topics signal importance
- Return empty array if nothing qualifies as a permanent memory`;

const CONSOLIDATION_PROMPT = `Merge NEW and EXISTING memory info into one clean entry.

Rules:
- Remove all duplicate or redundant information
- If new info contradicts old info, keep the newer version
- Keep it concise – no repetition, no filler
- Organize logically
- Summary must be under 180 chars`;

// ============================================================================
// Helpers
// ============================================================================

type LogFn = (...args: unknown[]) => void;

// ============================================================================
// Core Processing Logic (reusable — called from handler and chat endpoint)
// ============================================================================

/**
 * Process unprocessed past daily notes for a user into long-term memories.
 * This is the core logic extracted so it can be called from:
 * - The HTTP handler (POST /api/ai/process-daily-notes)
 * - The chat endpoint as a background fire-and-forget call
 * 
 * @returns Summary of processing results
 */
export async function processDailyNotesForUser(
  redis: Redis,
  username: string,
  log: LogFn = console.log,
  logError: LogFn = console.error,
  timeZone?: string,
): Promise<{
  processed: number;
  created: number;
  updated: number;
  dates: string[];
  skippedDates: string[];
}> {
  const EMPTY = { processed: 0, created: 0, updated: 0, dates: [] as string[], skippedDates: [] as string[] };

  // Acquire a short-lived lock to prevent concurrent processing for the same user.
  // If another request is already processing, we skip (the other run will handle it).
  const lockKey = `memory:user:${username}:processing_lock`;
  const acquired = await redis.set(lockKey, "1", { nx: true, ex: 120 }); // 2-min TTL
  if (!acquired) {
    log("[processDailyNotes] Skipping — another run already in progress", { username });
    return EMPTY;
  }

  try {
    return await _processDailyNotesForUserInner(redis, username, log, logError, timeZone);
  } finally {
    // Release lock when done (or on error)
    await redis.del(lockKey).catch(() => {});
  }
}

// ============================================================================
// Batch Processing Constants
// ============================================================================

/**
 * Maximum time (ms) to spend processing before stopping gracefully.
 * Leaves headroom below the 60s Vercel function limit.
 */
const PROCESSING_TIME_BUDGET_MS = 50_000;

/**
 * Maximum number of consolidation AI calls per day-batch.
 * Prevents runaway processing when many memories overlap.
 */
const MAX_CONSOLIDATIONS_PER_BATCH = 5;

/**
 * Maximum number of memories to extract per day-batch.
 * Keeps each day's AI call manageable.
 */
const MAX_EXTRACTIONS_PER_BATCH = 5;

// ============================================================================
// Batch Inner Logic
// ============================================================================

/** Inner processing logic, called under lock — processes notes day-by-day */
async function _processDailyNotesForUserInner(
  redis: Redis,
  username: string,
  log: LogFn,
  logError: LogFn,
  timeZone?: string,
): Promise<{
  processed: number;
  created: number;
  updated: number;
  dates: string[];
  skippedDates: string[];
}> {
  const startTime = Date.now();
  const EMPTY = { processed: 0, created: 0, updated: 0, dates: [] as string[], skippedDates: [] as string[] };

  // 0. Cleanup stale temporary memories before extracting new long-term facts.
  const cleanupResult = await cleanupStaleTemporaryMemories(redis, username);
  if (cleanupResult.removed > 0) {
    log("[processDailyNotes] Removed stale temporary memories", {
      username,
      removed: cleanupResult.removed,
      removedKeys: cleanupResult.removedKeys,
    });
  }

  // 1. Find unprocessed daily notes (excluding today)
  const unprocessedNotes = await getUnprocessedDailyNotesExcludingToday(
    redis,
    username,
    7,
    timeZone,
  );

  if (unprocessedNotes.length === 0) {
    return EMPTY;
  }

  // Sort oldest-first so we process in chronological order
  unprocessedNotes.sort((a, b) => a.date.localeCompare(b.date));

  log("[processDailyNotes] Found unprocessed notes", {
    username,
    noteCount: unprocessedNotes.length,
    dates: unprocessedNotes.map(n => n.date),
  });

  // Accumulate results across all batches
  let totalProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  const processedDates: string[] = [];
  const skippedDates: string[] = [];

  // 2. Process each day as a separate batch
  for (const note of unprocessedNotes) {
    // Time budget check — stop gracefully if running low
    const elapsed = Date.now() - startTime;
    if (elapsed > PROCESSING_TIME_BUDGET_MS) {
      log("[processDailyNotes] Time budget exceeded, stopping gracefully", {
        username,
        elapsedMs: elapsed,
        processedSoFar: totalProcessed,
        remainingDates: unprocessedNotes
          .filter(n => !processedDates.includes(n.date))
          .map(n => n.date),
      });
      // Track remaining dates as skipped (they'll be picked up next run)
      skippedDates.push(
        ...unprocessedNotes
          .filter(n => !processedDates.includes(n.date))
          .map(n => n.date)
      );
      break;
    }

    try {
      const batchResult = await _processSingleDayBatch(
        redis, username, note, log, logError,
      );

      totalCreated += batchResult.created;
      totalUpdated += batchResult.updated;

      // Mark this day as processed immediately — progress is preserved even if
      // a later day fails or we run out of time
      await markDailyNoteProcessed(redis, username, note.date);
      totalProcessed++;
      processedDates.push(note.date);

      log("[processDailyNotes] Day batch complete", {
        username,
        date: note.date,
        entries: note.entries.length,
        created: batchResult.created,
        updated: batchResult.updated,
      });
    } catch (error) {
      // Log and continue to next day — don't let one bad day break everything
      logError("[processDailyNotes] Failed to process day batch", {
        username,
        date: note.date,
        error: error instanceof Error ? error.message : String(error),
      });
      skippedDates.push(note.date);
    }
  }

  log("[processDailyNotes] Complete", {
    username,
    notesProcessed: totalProcessed,
    memoriesCreated: totalCreated,
    memoriesUpdated: totalUpdated,
    skippedDates,
  });

  return {
    processed: totalProcessed,
    created: totalCreated,
    updated: totalUpdated,
    dates: processedDates,
    skippedDates,
  };
}

// ============================================================================
// Single Day Batch Processing
// ============================================================================

/**
 * Process a single day's daily note into long-term memories.
 * This keeps each AI call scoped to one day's entries, avoiding prompt overflow.
 */
async function _processSingleDayBatch(
  redis: Redis,
  username: string,
  note: { date: string; entries: { timestamp: number; content: string }[] },
  log: LogFn,
  logError: LogFn,
): Promise<{ created: number; updated: number }> {
  // 1. Build text for this day only
  const dailyNotesText = (() => {
    const entries = note.entries
      .map(e => {
        const time = new Date(e.timestamp).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return `  ${time}: ${e.content}`;
      })
      .join("\n");
    return `${note.date}:\n${entries}`;
  })();

  // 2. Gather current memory state for dedup (fresh each batch to reflect earlier batches)
  const currentIndex = await getMemoryIndex(redis, username);
  const currentCount = currentIndex?.memories.length || 0;
  const remainingSlots = MAX_MEMORIES_PER_USER - currentCount;
  const existingKeys = currentIndex?.memories.map(m => m.key) || [];
  const existingMemoriesText = currentIndex && currentIndex.memories.length > 0
    ? currentIndex.memories.map(m => `- ${m.key}: ${m.summary}`).join("\n")
    : "";

  const maxExtract = remainingSlots > 0
    ? Math.min(MAX_EXTRACTIONS_PER_BATCH, remainingSlots)
    : 0;

  // 3. AI extraction — scoped to this single day
  let existingStateSection = "";
  if (existingMemoriesText) {
    existingStateSection = `\nEXISTING LONG-TERM MEMORIES (do NOT duplicate – update/merge if new info available):\n${existingMemoriesText}`;
  }

  const { object: result } = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: dailyNotesExtractionSchema,
    prompt: `${DAILY_NOTES_EXTRACTION_PROMPT}${existingStateSection}\n\n--- DAILY NOTES ---\n${dailyNotesText}\n--- END DAILY NOTES ---\n\nExtract up to ${Math.max(maxExtract, 3)} long-term memories. For existing keys, you may suggest updates via relatedKeys. Return empty array if nothing qualifies.`,
    temperature: 0.3,
  });

  log("[processDailyNotes] Extraction complete for day", {
    username,
    date: note.date,
    memoriesExtracted: result.longTermMemories.length,
  });

  // 4. Store long-term memories (with consolidation, capped per batch)
  let longTermStored = 0;
  let longTermUpdated = 0;
  let consolidationCount = 0;

  for (const mem of result.longTermMemories) {
    const key = mem.key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);
    if (!key || !/^[a-z]/.test(key)) continue;

    let finalSummary = mem.summary;
    let finalContent = mem.content;
    const keysToDelete: string[] = [];

    const relatedKeys = (mem.relatedKeys || [])
      .map(k => k.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
      .filter(k => k !== key && existingKeys.includes(k));

    const targetKeyExists = existingKeys.includes(key);

    if (!targetKeyExists && relatedKeys.length === 0 && remainingSlots <= 0) {
      continue;
    }

    // Consolidation — only if we haven't exceeded the per-batch cap
    let didConsolidate = false;
    if ((relatedKeys.length > 0 || targetKeyExists) && consolidationCount < MAX_CONSOLIDATIONS_PER_BATCH) {
      const keysToFetch = targetKeyExists ? [key, ...relatedKeys] : relatedKeys;
      const uniqueKeysToFetch = [...new Set(keysToFetch)];

      const existingContents = await Promise.all(
        uniqueKeysToFetch.map(async (k) => {
          const detail = await getMemoryDetail(redis, username, k);
          const entry = currentIndex?.memories.find(m => m.key === k);
          return { key: k, summary: entry?.summary || "", content: detail?.content || "" };
        })
      );

      const existingContentText = existingContents
        .map(m => `Key: ${m.key}\nSummary: ${m.summary}\nContent: ${m.content}`)
        .join("\n\n");

      const { object: consolidated } = await generateObject({
        model: google("gemini-2.0-flash"),
        schema: consolidationSchema,
        prompt: `${CONSOLIDATION_PROMPT}\n\nNEW:\nSummary: ${mem.summary}\nContent: ${mem.content}\n\nEXISTING:\n${existingContentText}\n\nMerge into one clean, deduplicated entry.`,
        temperature: 0.3,
      });

      finalSummary = consolidated.summary;
      finalContent = consolidated.content;
      keysToDelete.push(...relatedKeys);
      consolidationCount++;
      didConsolidate = true;
    }

    // If consolidation ran, AI already merged new+existing → "update" replaces with merged content.
    // If consolidation was skipped but key exists → "merge" appends new content to existing (prevents data loss).
    // If key doesn't exist → "add" creates a new entry.
    const mode = targetKeyExists
      ? (didConsolidate ? "update" : "merge")
      : "add";
    const storeResult = await upsertMemory(redis, username, key, finalSummary, finalContent, mode);

    if (storeResult.success) {
      if (mode === "update" || mode === "merge") {
        longTermUpdated++;
      } else {
        longTermStored++;
      }
      log("[processDailyNotes] Stored memory", { username, key, confidence: mem.confidence, mode, date: note.date });

      for (const oldKey of keysToDelete) {
        const deleteResult = await deleteMemory(redis, username, oldKey);
        if (deleteResult.success) {
          log("[processDailyNotes] Deleted merged key", { username, oldKey, mergedInto: key });
        }
      }
    } else {
      logError("[processDailyNotes] Failed to store memory", { username, key, error: storeResult.message });
    }
  }

  return { created: longTermStored, updated: longTermUpdated };
}

// ============================================================================
// Handler
// ============================================================================

export default createApiHandler(
  {
    operation: "ai-process-daily-notes",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({
      missingMessage: "Unauthorized - missing credentials",
      invalidMessage: "Unauthorized - invalid token",
    });
    if (!user) {
      return;
    }

    const username = user.username;
    const requestBody = (ctx.req.body || {}) as { timeZone?: string };
    const requestTimeZone = requestBody.timeZone;

    try {
      const result = await processDailyNotesForUser(
        ctx.redis,
        username,
        (...args: unknown[]) => ctx.logger.info(String(args[0]), args[1]),
        (...args: unknown[]) => ctx.logger.error(String(args[0]), args[1]),
        requestTimeZone,
      );

      const totalExtracted = result.created + result.updated;
      const skippedCount = result.skippedDates.length;

      ctx.logger.info("Daily notes processing complete", {
        username,
        notesProcessed: result.processed,
        memoriesCreated: result.created,
        memoriesUpdated: result.updated,
      });

      ctx.response.ok({
        processed: result.processed,
        extracted: totalExtracted,
        created: result.created,
        updated: result.updated,
        dates: result.dates,
        skippedDates: result.skippedDates,
        message:
          result.processed === 0
            ? "No unprocessed daily notes to process"
            : totalExtracted > 0
              ? `Processed ${result.processed} daily notes → ${result.created} new memories, ${result.updated} updated`
                + (skippedCount > 0 ? ` (${skippedCount} days deferred to next run)` : "")
              : `Processed ${result.processed} daily notes — no new long-term memories extracted`
                + (skippedCount > 0 ? ` (${skippedCount} days deferred to next run)` : ""),
      });
    } catch (error) {
      ctx.logger.error("Daily notes processing failed", error);
      ctx.response.serverError("Failed to process daily notes");
    }
  }
);
