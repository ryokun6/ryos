/**
 * POST /api/ai/sleep
 * 
 * "Sleep" cycle for the memory system. Processes unprocessed daily notes
 * from previous days into long-term memories.
 * 
 * Key behaviors:
 * - Only processes notes from PREVIOUS days (not today — still being collected)
 * - Tracks individual entry hashes to avoid reprocessing the same entries
 * - Respects a cooldown period (12h) between sleep cycles
 * - Consolidates with existing long-term memories (dedup/merge)
 * - Marks daily notes as processed after successful extraction
 * 
 * Trigger: Called automatically on first chat message of a new session,
 * or can be triggered manually. Designed to be non-blocking (fire-and-forget).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  upsertMemory,
  deleteMemory,
  markDailyNoteProcessed,
  getSleepMetadata,
  saveSleepMetadata,
  shouldRunSleep,
  getUnprocessedDailyNotesForSleep,
  hashDailyNoteEntry,
  MAX_MEMORIES_PER_USER,
  type SleepMetadata,
  type DailyNote,
  type DailyNoteEntry,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for memories extracted from daily notes during sleep.
 * The LLM analyzes patterns across multiple days of notes to find
 * stable facts worth promoting to long-term memory.
 */
const sleepExtractionSchema = z.object({
  longTermMemories: z.array(z.object({
    key: z.string().min(1).max(30)
      .describe("Canonical key (lowercase, underscores) for this memory"),
    summary: z.string().min(1).max(180)
      .describe("Brief summary of the stable fact about the USER"),
    content: z.string().min(1).max(2000)
      .describe("Detailed info about the USER to remember permanently"),
    confidence: z.enum(["high", "medium"])
      .describe("high = clearly stated across notes, medium = reasonable inference from patterns"),
    relatedKeys: z.array(z.string()).optional()
      .describe("Existing memory keys covering the same topic (for merging)"),
    reasoning: z.string().max(200).optional()
      .describe("Brief explanation of why this was promoted from daily notes"),
  })).describe("Stable facts extracted from daily notes worth remembering permanently. Only include facts that appear reliable across the notes."),

  insights: z.array(z.string().max(200)).optional()
    .describe("Optional brief observations about patterns noticed across the daily notes (not stored, just logged)"),
});

/**
 * Consolidation schema for merging new + existing memories.
 */
const consolidationSchema = z.object({
  summary: z.string().min(1).max(180)
    .describe("Deduplicated summary combining all info"),
  content: z.string().min(1).max(2000)
    .describe("Deduplicated content – no repeated info, newer wins conflicts"),
});

// ============================================================================
// Prompts
// ============================================================================

const SLEEP_EXTRACTION_PROMPT = `You are analyzing a user's daily journal notes to extract stable, long-term facts worth remembering permanently.

These notes were collected over multiple days from conversations between the user and an AI assistant. Your job is to find PATTERNS and STABLE FACTS — things that are consistently true about the user, not one-off events.

## What to extract as long-term memories:
- Identity facts: name, age, birthday, location
- Work/education: job, company, role, skills, field of study
- Stable preferences: music taste, food preferences, communication style
- Relationships: family members, pets, close friends mentioned repeatedly
- Ongoing goals or projects mentioned across multiple days
- Explicit instructions about how the AI should behave

## What NOT to extract:
- One-time events or moods (e.g., "had a bad day", "went to the store")
- Temporary plans that have likely passed
- Things already covered in EXISTING LONG-TERM MEMORIES
- Uncertain or ambiguous information
- Anything the AI assistant said (only extract facts about the USER)

## CANONICAL KEYS (prefer these when applicable):
name, birthday, location, work, skills, education, projects, music_pref, food_pref, interests, entertainment, family, friends, pets, goals, current_focus, context, preferences, instructions

## RULES:
- Only extract NEW information not already in existing memories
- If an existing memory key covers the same topic, list it in relatedKeys so we can merge
- confidence "high" = clearly stated/repeated, "medium" = reasonable inference
- Return empty array if nothing qualifies — be selective, not exhaustive
- Focus on facts that will be useful for personalizing future conversations`;

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

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

/**
 * Format daily notes into a readable text block for the LLM prompt.
 */
function formatDailyNotesForPrompt(notes: DailyNote[]): string {
  return notes.map(note => {
    const entries = note.entries
      .map((e: DailyNoteEntry) => {
        const time = new Date(e.timestamp).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return `  ${time}: ${e.content}`;
      })
      .join("\n");
    return `${note.date}:\n${entries}`;
  }).join("\n\n");
}

// ============================================================================
// Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();

  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  logger.request(req.method || "POST", req.url || "/api/ai/sleep");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate auth
  const authHeader = req.headers.authorization as string | undefined;
  const usernameHeader = req.headers["x-username"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !usernameHeader) {
    logger.warn("Missing credentials");
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - missing credentials" });
  }

  const redis = createRedis();
  const authResult = await validateAuth(redis, usernameHeader, token, {});

  if (!authResult.valid) {
    logger.warn("Invalid token", { username: usernameHeader });
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - invalid token" });
  }

  const username = usernameHeader.toLowerCase();

  try {
    // ========================================================================
    // Check cooldown — skip if sleep ran recently
    // ========================================================================
    const canSleep = await shouldRunSleep(redis, username);
    if (!canSleep) {
      const meta = await getSleepMetadata(redis, username);
      const hoursSince = meta
        ? ((Date.now() - meta.lastSleepAt) / (1000 * 60 * 60)).toFixed(1)
        : "unknown";
      logger.info("Sleep skipped (cooldown)", { username, hoursSinceLastSleep: hoursSince });
      logger.response(200, Date.now() - startTime);
      return res.status(200).json({
        ran: false,
        message: `Sleep cycle skipped — last ran ${hoursSince}h ago`,
        notesAnalyzed: 0,
        memoriesProcessed: 0,
        skippedCooldown: true,
      });
    }

    // ========================================================================
    // Gather unprocessed daily notes (excluding today)
    // ========================================================================
    const unprocessedNotes = await getUnprocessedDailyNotesForSleep(redis, username);

    if (unprocessedNotes.length === 0) {
      logger.info("Sleep skipped (no unprocessed notes)", { username });

      // Still update sleep metadata to reset cooldown
      const existingMeta = await getSleepMetadata(redis, username);
      await saveSleepMetadata(redis, username, {
        lastSleepAt: Date.now(),
        lastSleepDate: new Date().toISOString().split("T")[0],
        processedEntryHashes: existingMeta?.processedEntryHashes || [],
        lastSleepMemoriesProcessed: 0,
        lastSleepNotesProcessed: 0,
      });

      logger.response(200, Date.now() - startTime);
      return res.status(200).json({
        ran: true,
        message: "No unprocessed daily notes to analyze",
        notesAnalyzed: 0,
        memoriesProcessed: 0,
        skippedCooldown: false,
      });
    }

    // Count total entries to process
    const totalEntries = unprocessedNotes.reduce(
      (sum, note) => sum + note.entries.length,
      0
    );

    logger.info("Starting sleep cycle", {
      username,
      noteDays: unprocessedNotes.length,
      totalEntries,
      dateRange: `${unprocessedNotes[unprocessedNotes.length - 1].date} to ${unprocessedNotes[0].date}`,
    });

    // ========================================================================
    // Gather existing state for context
    // ========================================================================
    const currentIndex = await getMemoryIndex(redis, username);
    const currentCount = currentIndex?.memories.length || 0;
    const remainingSlots = MAX_MEMORIES_PER_USER - currentCount;
    const existingKeys = currentIndex?.memories.map(m => m.key) || [];
    const existingMemoriesText = currentIndex && currentIndex.memories.length > 0
      ? currentIndex.memories.map(m => `- ${m.key}: ${m.summary}`).join("\n")
      : "";

    // Format daily notes for the prompt
    const dailyNotesText = formatDailyNotesForPrompt(unprocessedNotes);

    // ========================================================================
    // LLM extraction: analyze daily notes for long-term memory patterns
    // ========================================================================
    let existingStateSection = "";
    if (existingMemoriesText) {
      existingStateSection = `\nEXISTING LONG-TERM MEMORIES (do NOT duplicate):\n${existingMemoriesText}`;
    }

    const maxNewMemories = remainingSlots > 0 ? Math.min(5, remainingSlots) : 0;

    logger.info("Running sleep extraction", {
      username,
      existingMemories: currentCount,
      remainingSlots,
      maxNewMemories,
    });

    const { object: result } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: sleepExtractionSchema,
      prompt: `${SLEEP_EXTRACTION_PROMPT}${existingStateSection}\n\n--- DAILY NOTES (from previous days) ---\n${dailyNotesText}\n--- END DAILY NOTES ---\n\nAnalyze these daily notes and extract up to ${maxNewMemories} long-term memories. Return an empty array if nothing qualifies.`,
      temperature: 0.3,
    });

    logger.info("Sleep extraction complete", {
      username,
      memoriesFound: result.longTermMemories.length,
      insights: result.insights?.length || 0,
    });

    if (result.insights && result.insights.length > 0) {
      logger.info("Sleep insights", { username, insights: result.insights });
    }

    // ========================================================================
    // Store long-term memories (with consolidation for overlapping keys)
    // ========================================================================
    let memoriesProcessed = 0;
    const toProcess = result.longTermMemories.slice(0, remainingSlots);

    for (const mem of toProcess) {
      const key = mem.key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);
      if (!key || !/^[a-z]/.test(key)) continue;

      let finalSummary = mem.summary;
      let finalContent = mem.content;
      const keysToDelete: string[] = [];

      const relatedKeys = (mem.relatedKeys || [])
        .map(k => k.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
        .filter(k => k !== key && existingKeys.includes(k));

      const targetKeyExists = existingKeys.includes(key);

      // Consolidate with existing if keys overlap
      if (relatedKeys.length > 0 || targetKeyExists) {
        const keysToFetch = targetKeyExists ? [key, ...relatedKeys] : relatedKeys;
        const uniqueKeysToFetch = [...new Set(keysToFetch)];

        logger.info("Sleep consolidating", { username, key, merging: uniqueKeysToFetch });

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
      }

      const mode = targetKeyExists ? "update" : "add";
      const storeResult = await upsertMemory(redis, username, key, finalSummary, finalContent, mode);

      if (storeResult.success) {
        memoriesProcessed++;
        logger.info("Sleep stored memory", {
          username,
          key,
          confidence: mem.confidence,
          mode,
          reasoning: mem.reasoning,
        });

        for (const oldKey of keysToDelete) {
          const deleteResult = await deleteMemory(redis, username, oldKey);
          if (deleteResult.success) {
            logger.info("Sleep deleted merged key", { username, oldKey, mergedInto: key });
          }
        }
      } else {
        logger.warn("Sleep failed to store memory", { username, key, error: storeResult.message });
      }
    }

    // ========================================================================
    // Mark daily notes as processed + track entry hashes
    // ========================================================================
    const existingMeta = await getSleepMetadata(redis, username);
    const allProcessedHashes = new Set(existingMeta?.processedEntryHashes || []);

    for (const note of unprocessedNotes) {
      // Add all entry hashes to the processed set
      for (const entry of note.entries) {
        allProcessedHashes.add(hashDailyNoteEntry(note.date, entry));
      }
      // Mark the note as processed at the note level too
      await markDailyNoteProcessed(redis, username, note.date);
    }

    // Keep only the last 500 hashes to prevent unbounded growth
    const hashArray = Array.from(allProcessedHashes);
    const trimmedHashes = hashArray.length > 500
      ? hashArray.slice(hashArray.length - 500)
      : hashArray;

    // Save updated sleep metadata
    const newMeta: SleepMetadata = {
      lastSleepAt: Date.now(),
      lastSleepDate: new Date().toISOString().split("T")[0],
      processedEntryHashes: trimmedHashes,
      lastSleepMemoriesProcessed: memoriesProcessed,
      lastSleepNotesProcessed: unprocessedNotes.length,
    };
    await saveSleepMetadata(redis, username, newMeta);

    logger.info("Sleep cycle complete", {
      username,
      notesAnalyzed: unprocessedNotes.length,
      memoriesProcessed,
      totalEntriesProcessed: totalEntries,
    });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      ran: true,
      message: memoriesProcessed > 0
        ? `Processed ${unprocessedNotes.length} days of notes, extracted ${memoriesProcessed} long-term memories`
        : `Analyzed ${unprocessedNotes.length} days of notes, no new long-term memories found`,
      notesAnalyzed: unprocessedNotes.length,
      memoriesProcessed,
      skippedCooldown: false,
    });

  } catch (error) {
    logger.error("Sleep cycle failed", error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Sleep cycle failed" });
  }
}
