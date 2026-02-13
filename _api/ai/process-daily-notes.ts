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
  getUnprocessedDailyNotesExcludingToday,
  markDailyNoteProcessed,
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

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

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
): Promise<{
  processed: number;
  created: number;
  updated: number;
  dates: string[];
}> {
  // 1. Find unprocessed daily notes (excluding today)
  const unprocessedNotes = await getUnprocessedDailyNotesExcludingToday(redis, username);

  if (unprocessedNotes.length === 0) {
    return { processed: 0, created: 0, updated: 0, dates: [] };
  }

  log("[processDailyNotes] Found unprocessed notes", {
    username,
    noteCount: unprocessedNotes.length,
    dates: unprocessedNotes.map(n => n.date),
  });

  // 2. Build daily notes text for AI analysis
  const dailyNotesText = unprocessedNotes
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(note => {
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
    })
    .join("\n\n");

  // 3. Gather existing memory state for dedup
  const currentIndex = await getMemoryIndex(redis, username);
  const currentCount = currentIndex?.memories.length || 0;
  const remainingSlots = MAX_MEMORIES_PER_USER - currentCount;
  const existingKeys = currentIndex?.memories.map(m => m.key) || [];
  const existingMemoriesText = currentIndex && currentIndex.memories.length > 0
    ? currentIndex.memories.map(m => `- ${m.key}: ${m.summary}`).join("\n")
    : "";

  const maxExtract = remainingSlots > 0 ? Math.min(5, remainingSlots) : 0;

  // 4. AI extraction
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

  log("[processDailyNotes] Extraction complete", {
    username,
    memoriesExtracted: result.longTermMemories.length,
  });

  // 5. Store long-term memories (with consolidation)
  let longTermStored = 0;
  let longTermUpdated = 0;

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

    if (relatedKeys.length > 0 || targetKeyExists) {
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
    }

    const mode = targetKeyExists ? "update" : "add";
    const storeResult = await upsertMemory(redis, username, key, finalSummary, finalContent, mode);

    if (storeResult.success) {
      if (mode === "update") {
        longTermUpdated++;
      } else {
        longTermStored++;
      }
      log("[processDailyNotes] Stored memory", { username, key, confidence: mem.confidence, mode });

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

  // 6. Mark daily notes as processed
  for (const note of unprocessedNotes) {
    await markDailyNoteProcessed(redis, username, note.date);
  }

  log("[processDailyNotes] Complete", {
    username,
    notesProcessed: unprocessedNotes.length,
    memoriesCreated: longTermStored,
    memoriesUpdated: longTermUpdated,
  });

  return {
    processed: unprocessedNotes.length,
    created: longTermStored,
    updated: longTermUpdated,
    dates: unprocessedNotes.map(n => n.date),
  };
}

// ============================================================================
// Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();

  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  logger.request(req.method || "POST", req.url || "/api/ai/process-daily-notes");

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

  // ========================================================================
  // Authentication
  // ========================================================================
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
    const result = await processDailyNotesForUser(
      redis,
      username,
      (...args: unknown[]) => logger.info(String(args[0]), args[1]),
      (...args: unknown[]) => logger.error(String(args[0]), args[1]),
    );

    const totalExtracted = result.created + result.updated;

    logger.info("Daily notes processing complete", {
      username,
      notesProcessed: result.processed,
      memoriesCreated: result.created,
      memoriesUpdated: result.updated,
    });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      processed: result.processed,
      extracted: totalExtracted,
      created: result.created,
      updated: result.updated,
      dates: result.dates,
      message: result.processed === 0
        ? "No unprocessed daily notes to process"
        : totalExtracted > 0
          ? `Processed ${result.processed} daily notes → ${result.created} new memories, ${result.updated} updated`
          : `Processed ${result.processed} daily notes — no new long-term memories extracted`,
    });

  } catch (error) {
    logger.error("Daily notes processing failed", error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Failed to process daily notes" });
  }
}
