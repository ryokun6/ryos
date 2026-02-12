/**
 * POST /api/ai/extract-memories
 * 
 * Analyzes a conversation and extracts both daily notes and long-term memories.
 * Called asynchronously when user clears their chat history.
 * 
 * Single-pass extraction: one AI call reads the conversation + existing state
 * and outputs both daily notes and long-term memories together.
 * Then a consolidation step merges with existing long-term memories where keys overlap.
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
  appendDailyNote,
  getDailyNote,
  getTodayDateString,
  markDailyNoteProcessed,
  MAX_MEMORIES_PER_USER,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================================
// Schemas
// ============================================================================

// Single-pass: extract both daily notes and long-term memories at once
const extractionSchema = z.object({
  dailyNotes: z.array(z.string()
    .min(1)
    .max(300)
    .describe("A concise note about what the USER said, did, or mentioned")
  ).describe("Short-term journal entries. Capture what the user discussed, their mood, plans, topics. Do NOT repeat anything in EXISTING DAILY NOTES."),

  longTermMemories: z.array(z.object({
    key: z.string().min(1).max(30)
      .describe("Canonical key (lowercase, underscores)"),
    summary: z.string().min(1).max(180)
      .describe("Brief summary of the stable fact about the USER"),
    content: z.string().min(1).max(2000)
      .describe("Detailed info about the USER to remember permanently"),
    confidence: z.enum(["high", "medium"])
      .describe("high = user directly stated it, medium = strong inference"),
    relatedKeys: z.array(z.string()).optional()
      .describe("Existing memory keys covering the same topic (for merging)"),
  })).describe("Stable, permanent facts about the USER. Do NOT duplicate existing memories."),
});

// Consolidation: dedup merge for overlapping keys
const consolidationSchema = z.object({
  summary: z.string().min(1).max(180)
    .describe("Deduplicated summary combining all info"),
  content: z.string().min(1).max(2000)
    .describe("Deduplicated content – no repeated info, newer wins conflicts"),
});

// ============================================================================
// Types & Helpers
// ============================================================================

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

function getMessageText(msg: ChatMessage): string {
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter(p => p.type === "text" && p.text)
      .map(p => p.text)
      .join("\n");
  }
  return msg.content || "";
}

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

// ============================================================================
// Prompt
// ============================================================================

const EXTRACTION_PROMPT = `You are analyzing a conversation between a USER and an AI assistant named "Ryo" to extract memories.

CRITICAL – WHO IS WHO:
- Lines starting with "User:" are the HUMAN user. Extract facts about THEM.
- Lines starting with "Ryo:" are the AI ASSISTANT. Do NOT attribute Ryo's statements, opinions, or knowledge to the user.
- Only extract what the USER directly said, asked, mentioned, or revealed about themselves.

You will output TWO types of memories:

## dailyNotes (short-term journal)
Capture what the USER discussed, their mood, plans, topics, questions, problems.
- One short sentence each, max ~15 words
- Be specific and factual
- Skip small talk, greetings, trivial exchanges
- Do NOT repeat anything already in EXISTING DAILY NOTES

## longTermMemories (permanent facts)
Stable facts about the USER worth remembering permanently.
CANONICAL KEYS: name, birthday, location, work, skills, education, projects, music_pref, food_pref, interests, entertainment, family, friends, pets, goals, current_focus, context, preferences, instructions

What qualifies: identity, stable facts (job, pets, family), preferences, instructions
What does NOT: temporary events, moods, plans, things already in existing memories

RULES:
- Use canonical keys when topic matches
- Only extract NEW info not already in existing state
- If an existing memory key covers the same topic, list it in relatedKeys
- confidence "high" = user directly stated, "medium" = strong inference
- Return empty arrays if nothing qualifies`;

const CONSOLIDATION_PROMPT = `Merge NEW and EXISTING memory info into one clean entry.

Rules:
- Remove all duplicate or redundant information
- If new info contradicts old info, keep the newer version
- Keep it concise – no repetition, no filler
- Organize logically
- Summary must be under 180 chars`;

// ============================================================================
// Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();

  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  logger.request(req.method || "POST", req.url || "/api/ai/extract-memories");

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

  // Parse request body
  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    logger.warn("No messages provided");
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Messages array required" });
  }

  // Format conversation with clear role labels
  const conversationText = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => {
      const text = getMessageText(m);
      const role = m.role === "user" ? "User" : "Ryo";
      return `${role}: ${text}`;
    })
    .join("\n\n");

  if (conversationText.trim().length < 50) {
    logger.info("Conversation too short for extraction");
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({ extracted: 0, dailyNotes: 0, message: "Conversation too short" });
  }

  logger.info("Starting extraction", { 
    username, 
    messageCount: messages.length,
    conversationLength: conversationText.length,
  });

  try {
    // ========================================================================
    // Gather existing state (for dedup in prompt)
    // ========================================================================

    // Existing daily notes — only unprocessed entries to save tokens
    const today = getTodayDateString();
    const existingDailyNote = await getDailyNote(redis, username, today);
    const hasUnprocessedEntries = existingDailyNote && !existingDailyNote.processedForMemories && existingDailyNote.entries.length > 0;
    const existingDailyNotesText = hasUnprocessedEntries
      ? existingDailyNote.entries.map(e => `- ${e.content}`).join("\n")
      : "";

    // Existing long-term memories
    const currentIndex = await getMemoryIndex(redis, username);
    const currentCount = currentIndex?.memories.length || 0;
    const remainingSlots = MAX_MEMORIES_PER_USER - currentCount;
    const existingKeys = currentIndex?.memories.map(m => m.key) || [];
    const existingMemoriesText = currentIndex && currentIndex.memories.length > 0
      ? currentIndex.memories.map(m => `- ${m.key}: ${m.summary}`).join("\n")
      : "";

    // ========================================================================
    // Single-pass extraction: daily notes + long-term memories in one call
    // ========================================================================

    // Build existing state section — only include non-empty sections
    let existingStateSection = "";
    if (existingDailyNotesText) {
      existingStateSection += `\nEXISTING DAILY NOTES (do NOT repeat):\n${existingDailyNotesText}`;
    }
    if (existingMemoriesText) {
      existingStateSection += `\nEXISTING LONG-TERM MEMORIES (do NOT duplicate):\n${existingMemoriesText}`;
    }

    const maxLongTerm = remainingSlots > 0 ? Math.min(5, remainingSlots) : 0;

    logger.info("Extracting", { username, existingDailyNotes: existingDailyNote?.entries.length || 0, existingMemories: currentCount, remainingSlots });

    const { object: result } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: extractionSchema,
      prompt: `${EXTRACTION_PROMPT}${existingStateSection}\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\nExtract up to 8 daily notes and up to ${maxLongTerm} long-term memories. Return empty arrays if nothing qualifies.`,
      temperature: 0.3,
    });

    logger.info("Extraction complete", {
      username,
      dailyNotes: result.dailyNotes.length,
      longTermMemories: result.longTermMemories.length,
    });

    // ========================================================================
    // Store daily notes
    // ========================================================================
    let dailyNotesStored = 0;
    for (const note of result.dailyNotes) {
      const storeResult = await appendDailyNote(redis, username, note);
      if (storeResult.success) dailyNotesStored++;
    }

    // ========================================================================
    // Store long-term memories (with consolidation for overlapping keys)
    // ========================================================================
    let longTermStored = 0;
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
        
        logger.info("Consolidating", { username, key, merging: uniqueKeysToFetch });

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
        longTermStored++;
        logger.info("Stored memory", { username, key, confidence: mem.confidence, mode });
        
        for (const oldKey of keysToDelete) {
          const deleteResult = await deleteMemory(redis, username, oldKey);
          if (deleteResult.success) {
            logger.info("Deleted merged key", { username, oldKey, mergedInto: key });
          }
        }
      } else {
        logger.warn("Failed to store memory", { username, key, error: storeResult.message });
      }
    }

    // Only mark today's note as processed — this extraction only analyzed
    // the conversation + today's entries. Past daily notes should be processed
    // separately by /api/ai/process-daily-notes which actually reads their content.
    if (dailyNotesStored > 0 || (existingDailyNote && existingDailyNote.entries.length > 0)) {
      await markDailyNoteProcessed(redis, username, today);
    }

    logger.info("Done", { username, dailyNotes: dailyNotesStored, longTerm: longTermStored });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      extracted: longTermStored,
      dailyNotes: dailyNotesStored,
      analyzed: result.longTermMemories.length,
      message: longTermStored > 0 || dailyNotesStored > 0
        ? `Logged ${dailyNotesStored} daily notes, extracted ${longTermStored} long-term memories`
        : "No noteworthy information found",
    });

  } catch (error) {
    logger.error("Memory extraction failed", error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Failed to extract memories" });
  }
}
