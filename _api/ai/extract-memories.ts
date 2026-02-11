/**
 * POST /api/ai/extract-memories
 * 
 * Analyzes a conversation, logs daily notes, and extracts long-term memories.
 * Called asynchronously when user clears their chat history.
 * 
 * Two-tier extraction flow:
 * 1. Append NEW conversation highlights to today's daily note (skips duplicates)
 * 2. Process conversation + daily notes context to extract/update long-term memories
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
  getUnprocessedDailyNotes,
  markDailyNoteProcessed,
  MAX_MEMORIES_PER_USER,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================================
// Schemas
// ============================================================================

// Daily notes: only NEW items not already captured
const dailyNotesSchema = z.object({
  notes: z.array(z.string()
    .min(1)
    .max(300)
    .describe("A concise note about what the USER said, did, or mentioned")
  ).describe("NEW daily note entries only. Do NOT repeat anything already in EXISTING NOTES."),
});

// Long-term memories: stable facts about the USER
const extractionSchema = z.object({
  memories: z.array(z.object({
    key: z.string().min(1).max(30)
      .describe("Canonical key (lowercase, underscores)"),
    summary: z.string().min(1).max(180)
      .describe("Brief summary of the fact about the USER"),
    content: z.string().min(1).max(2000)
      .describe("Detailed info about the USER"),
    confidence: z.enum(["high", "medium"])
      .describe("high = directly stated by user, medium = strong inference"),
    relatedKeys: z.array(z.string()).optional()
      .describe("Existing keys covering the same topic (for merging)"),
  })).describe("Long-term facts about the USER. Only stable info, not daily events."),
});

// Consolidation: dedup merge
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
// Prompts
// ============================================================================

const DAILY_NOTES_PROMPT = `You are extracting daily journal notes from a conversation between a USER and an AI assistant named "Ryo".

CRITICAL – WHO IS WHO:
- Lines starting with "User:" are the HUMAN user. Extract facts about THEM.
- Lines starting with "Ryo:" are the AI ASSISTANT. Do NOT attribute Ryo's opinions, knowledge, or statements to the user.
- If Ryo says "I love cats" that is the AI talking, NOT the user.
- Only extract what the USER directly said, asked, mentioned, or revealed about themselves.

WHAT TO CAPTURE (about the USER only):
- What the user said they're doing, working on, or planning
- Mood or energy the user expressed ("I'm tired", "excited about...")
- Topics the user asked about or discussed
- Events or plans the user mentioned
- Problems or questions the user brought up

KEEP IT CONCISE:
- Each note should be one short sentence, max ~15 words
- Be specific and factual, not vague
- Skip small talk, greetings, and trivial exchanges
- If the conversation was trivial, return empty array`;

const EXTRACTION_PROMPT = `You are extracting LONG-TERM memories from a conversation between a USER and an AI assistant named "Ryo".

CRITICAL – WHO IS WHO:
- Lines starting with "User:" are the HUMAN user. Extract facts about THEM.
- Lines starting with "Ryo:" are the AI ASSISTANT. Do NOT treat Ryo's statements as user facts.
- Example: if Ryo says "I'm from San Francisco" – that's the AI, NOT the user.
- Only extract what the USER directly stated about themselves.

CANONICAL KEYS (use when topic matches):
name, birthday, location, work, skills, education, projects, music_pref, food_pref, interests, entertainment, family, friends, pets, goals, current_focus, context, preferences, instructions

WHAT QUALIFIES AS LONG-TERM (directly stated by the user):
- Identity: "My name is Sarah", "I'm 28"
- Stable facts: "I work at Google", "I have a cat named Mochi"
- Preferences: "I love spicy food", "I prefer dark mode"
- Instructions: "Always respond in Japanese"

WHAT DOES NOT QUALIFY:
- Temporary/daily events: meetings, today's plans, current mood
- Things already covered by existing memories (check list below)
- Anything said by Ryo (the AI), not the user
- Vague or uncertain information

RULES:
1. Use canonical keys when the topic matches
2. Only extract NEW info not already in existing memories
3. If an existing key covers the same topic, list it in relatedKeys
4. confidence "high" = user directly stated it, "medium" = strong inference from what user said
5. If nothing new qualifies, return empty array
6. Do NOT store AI/Ryo's traits, opinions, or facts as user memories`;

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
    // PHASE 1: Extract daily notes – pass existing notes so model skips dupes
    // ========================================================================
    logger.info("Phase 1: Extracting daily notes", { username });

    // Fetch today's existing daily notes — only include unprocessed entries for dedup
    // Processed entries are from previous conversations, low dup risk, skip to save tokens
    const today = getTodayDateString();
    const existingDailyNote = await getDailyNote(redis, username, today);
    const hasUnprocessedEntries = existingDailyNote && !existingDailyNote.processedForMemories && existingDailyNote.entries.length > 0;
    const existingEntriesText = hasUnprocessedEntries
      ? existingDailyNote.entries.map(e => `- ${e.content}`).join("\n")
      : "None";

    const { object: dailyNotesResult } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: dailyNotesSchema,
      prompt: `${DAILY_NOTES_PROMPT}\n\nEXISTING NOTES FOR TODAY (do NOT repeat these):\n${existingEntriesText}\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\nExtract up to 8 NEW notes not already covered above. Return empty array if nothing new.`,
      temperature: 0.3,
    });

    // Append only the new entries
    let dailyNotesStored = 0;
    for (const note of dailyNotesResult.notes) {
      const result = await appendDailyNote(redis, username, note);
      if (result.success) {
        dailyNotesStored++;
      }
    }

    logger.info("Phase 1 complete", { 
      username, 
      existingEntries: existingDailyNote?.entries.length || 0,
      newExtracted: dailyNotesResult.notes.length,
      newStored: dailyNotesStored,
    });

    // ========================================================================
    // PHASE 2: Extract long-term memories
    // ========================================================================

    const currentIndex = await getMemoryIndex(redis, username);
    const currentCount = currentIndex?.memories.length || 0;
    const remainingSlots = MAX_MEMORIES_PER_USER - currentCount;

    if (remainingSlots <= 0) {
      logger.info("Long-term memory limit reached", { username, currentCount });
      logger.response(200, Date.now() - startTime);
      return res.status(200).json({ 
        extracted: 0, 
        dailyNotes: dailyNotesStored,
        message: `Stored ${dailyNotesStored} daily notes. Long-term memory limit reached.` 
      });
    }

    const existingKeys = currentIndex?.memories.map(m => m.key) || [];
    const existingSummariesText = currentIndex && currentIndex.memories.length > 0
      ? currentIndex.memories.map(m => `- ${m.key}: ${m.summary}`).join("\n")
      : "None";

    // Unprocessed daily notes for extra context
    const unprocessedNotes = await getUnprocessedDailyNotes(redis, username);
    const dailyNotesContext = unprocessedNotes.length > 0
      ? unprocessedNotes.map(n => {
          const entries = n.entries.map(e => `  - ${e.content}`).join("\n");
          return `${n.date}:\n${entries}`;
        }).join("\n")
      : "None";

    logger.info("Phase 2: Extracting long-term memories", { username });

    // Build Phase 2 prompt — skip daily notes section entirely if none to save tokens
    let phase2Prompt = `${EXTRACTION_PROMPT}\n\nEXISTING LONG-TERM MEMORIES (do NOT duplicate):\n${existingSummariesText}`;
    if (dailyNotesContext !== "None") {
      phase2Prompt += `\n\nRECENT DAILY NOTES (context only – do NOT re-extract daily events):\n${dailyNotesContext}`;
    }
    phase2Prompt += `\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\nExtract up to ${Math.min(5, remainingSlots)} NEW long-term memories not already covered above.`;

    const { object: extractionResult } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: extractionSchema,
      prompt: phase2Prompt,
      temperature: 0.3,
    });

    logger.info("Phase 2 complete", { 
      username, 
      memoriesFound: extractionResult.memories.length,
    });

    // Only high/medium confidence
    const toProcess = extractionResult.memories.slice(0, remainingSlots);

    // ========================================================================
    // PHASE 3: Consolidate with existing memories where needed
    // ========================================================================
    let stored = 0;
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

      if (relatedKeys.length > 0 || targetKeyExists) {
        const keysToFetch = targetKeyExists ? [key, ...relatedKeys] : relatedKeys;
        const uniqueKeysToFetch = [...new Set(keysToFetch)];
        
        logger.info("Phase 3: Consolidating", { username, key, keysToFetch: uniqueKeysToFetch });

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

      const mode = existingKeys.includes(key) ? "update" : "add";
      
      const storeResult = await upsertMemory(redis, username, key, finalSummary, finalContent, mode);

      if (storeResult.success) {
        stored++;
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

    // Mark daily notes as processed
    for (const note of unprocessedNotes) {
      await markDailyNoteProcessed(redis, username, note.date);
    }

    logger.info("Extraction complete", { username, dailyNotes: dailyNotesStored, longTerm: stored });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      extracted: stored,
      dailyNotes: dailyNotesStored,
      analyzed: extractionResult.memories.length,
      message: stored > 0 || dailyNotesStored > 0
        ? `Logged ${dailyNotesStored} daily notes, extracted ${stored} long-term memories`
        : "No noteworthy information found",
    });

  } catch (error) {
    logger.error("Memory extraction failed", error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Failed to extract memories" });
  }
}
