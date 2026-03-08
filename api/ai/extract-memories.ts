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

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import type { Redis } from "@upstash/redis";
import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  upsertMemory,
  deleteMemory,
  appendDailyNote,
  getDailyNote,
  getTodayDateString,
  normalizeTimeZone,
  markDailyNoteProcessed,
  MAX_MEMORIES_PER_USER,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

const extractionSchema = z.object({
  dailyNotes: z
    .array(
      z
        .string()
        .min(1)
        .max(300)
        .describe("A concise note about what the USER said, did, or mentioned")
    )
    .describe(
      "Short-term journal entries. Capture what the user discussed, their mood, plans, topics. Do NOT repeat anything in EXISTING DAILY NOTES."
    ),

  longTermMemories: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .max(30)
          .describe("Canonical key (lowercase, underscores)"),
        summary: z
          .string()
          .min(1)
          .max(180)
          .describe("Brief summary of the stable fact about the USER"),
        content: z
          .string()
          .min(1)
          .max(2000)
          .describe("Detailed info about the USER to remember permanently"),
        confidence: z
          .enum(["high", "medium"])
          .describe("high = user directly stated it, medium = strong inference"),
        relatedKeys: z
          .array(z.string())
          .optional()
          .describe("Existing memory keys covering the same topic (for merging)"),
      })
    )
    .describe("Stable, permanent facts about the USER. Do NOT duplicate existing memories."),
});

const consolidationSchema = z.object({
  summary: z.string().min(1).max(180).describe("Deduplicated summary combining all info"),
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("Deduplicated content – no repeated info, newer wins conflicts"),
});

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

type LogFn = (...args: unknown[]) => void;

export interface ExtractMemoriesFromConversationOptions {
  redis: Redis;
  username: string;
  messages: ChatMessage[];
  timeZone?: string;
  storeLongTermMemories?: boolean;
  markTodayProcessed?: boolean;
  log?: LogFn;
  logError?: LogFn;
}

export interface ExtractMemoriesFromConversationResult {
  extracted: number;
  dailyNotes: number;
  analyzed: number;
  message: string;
  skippedReason?: "empty-messages" | "conversation-too-short";
}

function getMessageText(msg: ChatMessage): string {
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
  }
  return msg.content || "";
}

const EXTRACTION_PROMPT = `You are analyzing a conversation between a USER and an AI assistant named "Ryo" to extract memories.

CRITICAL - WHO IS WHO:
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
- Keep it concise - no repetition, no filler
- Organize logically
- Summary must be under 180 chars`;

export async function extractMemoriesFromConversation({
  redis,
  username,
  messages,
  timeZone,
  storeLongTermMemories = true,
  markTodayProcessed = true,
  log = console.log,
  logError = console.error,
}: ExtractMemoriesFromConversationOptions): Promise<ExtractMemoriesFromConversationResult> {
  if (!messages || messages.length === 0) {
    return {
      extracted: 0,
      dailyNotes: 0,
      analyzed: 0,
      message: "Messages array required",
      skippedReason: "empty-messages",
    };
  }

  const userTimeZone = normalizeTimeZone(timeZone);
  const conversationText = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const text = getMessageText(message);
      const role = message.role === "user" ? "User" : "Ryo";
      return `${role}: ${text}`;
    })
    .join("\n\n");

  if (conversationText.trim().length < 50) {
    log("[extractMemories] Conversation too short for extraction", {
      username,
      conversationLength: conversationText.length,
    });
    return {
      extracted: 0,
      dailyNotes: 0,
      analyzed: 0,
      message: "Conversation too short",
      skippedReason: "conversation-too-short",
    };
  }

  log("[extractMemories] Starting extraction", {
    username,
    messageCount: messages.length,
    conversationLength: conversationText.length,
    storeLongTermMemories,
    markTodayProcessed,
  });

  const today = getTodayDateString(userTimeZone);
  const existingDailyNote = await getDailyNote(redis, username, today);
  const hasExistingDailyEntries = !!existingDailyNote && existingDailyNote.entries.length > 0;
  const existingDailyNotesText = hasExistingDailyEntries
    ? existingDailyNote!.entries.map((entry) => `- ${entry.content}`).join("\n")
    : "";

  const currentIndex = await getMemoryIndex(redis, username);
  const currentCount = currentIndex?.memories.length || 0;
  const remainingSlots = MAX_MEMORIES_PER_USER - currentCount;
  const existingKeys = currentIndex?.memories.map((memory) => memory.key) || [];
  const existingMemoriesText =
    currentIndex && currentIndex.memories.length > 0
      ? currentIndex.memories.map((memory) => `- ${memory.key}: ${memory.summary}`).join("\n")
      : "";

  let existingStateSection = "";
  if (existingDailyNotesText) {
    existingStateSection += `\nEXISTING DAILY NOTES (do NOT repeat):\n${existingDailyNotesText}`;
  }
  if (existingMemoriesText) {
    existingStateSection += `\nEXISTING LONG-TERM MEMORIES (do NOT duplicate):\n${existingMemoriesText}`;
  }

  const maxLongTerm = storeLongTermMemories ? Math.max(0, Math.min(5, remainingSlots)) : 0;
  log("[extractMemories] Extracting", {
    username,
    existingDailyNotes: existingDailyNote?.entries.length || 0,
    existingMemories: currentCount,
    remainingSlots,
    maxLongTerm,
  });

  const { object: result } = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: extractionSchema,
    prompt:
      `${EXTRACTION_PROMPT}${existingStateSection}\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\n` +
      `Extract up to 8 daily notes and up to ${maxLongTerm} long-term memories. Return empty arrays if nothing qualifies.`,
    temperature: 0.3,
  });

  log("[extractMemories] Extraction complete", {
    username,
    dailyNotes: result.dailyNotes.length,
    longTermMemories: result.longTermMemories.length,
  });

  let dailyNotesStored = 0;
  for (const note of result.dailyNotes) {
    const storeResult = await appendDailyNote(redis, username, note, {
      timeZone: userTimeZone,
    });
    if (storeResult.success) {
      dailyNotesStored++;
    }
  }

  let longTermStored = 0;
  if (storeLongTermMemories && maxLongTerm > 0) {
    const toProcess = result.longTermMemories.slice(0, maxLongTerm);

    for (const mem of toProcess) {
      const key = mem.key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);
      if (!key || !/^[a-z]/.test(key)) {
        continue;
      }

      let finalSummary = mem.summary;
      let finalContent = mem.content;
      const keysToDelete: string[] = [];
      const relatedKeys = (mem.relatedKeys || [])
        .map((relatedKey) => relatedKey.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
        .filter((relatedKey) => relatedKey !== key && existingKeys.includes(relatedKey));
      const targetKeyExists = existingKeys.includes(key);

      if (relatedKeys.length > 0 || targetKeyExists) {
        const keysToFetch = targetKeyExists ? [key, ...relatedKeys] : relatedKeys;
        const uniqueKeysToFetch = [...new Set(keysToFetch)];

        log("[extractMemories] Consolidating", {
          username,
          key,
          merging: uniqueKeysToFetch,
        });

        const existingContents = await Promise.all(
          uniqueKeysToFetch.map(async (existingKey) => {
            const detail = await getMemoryDetail(redis, username, existingKey);
            const entry = currentIndex?.memories.find((memory) => memory.key === existingKey);
            return {
              key: existingKey,
              summary: entry?.summary || "",
              content: detail?.content || "",
            };
          })
        );

        const existingContentText = existingContents
          .map(
            (memory) => `Key: ${memory.key}\nSummary: ${memory.summary}\nContent: ${memory.content}`
          )
          .join("\n\n");

        const { object: consolidated } = await generateObject({
          model: google("gemini-2.0-flash"),
          schema: consolidationSchema,
          prompt:
            `${CONSOLIDATION_PROMPT}\n\nNEW:\nSummary: ${mem.summary}\nContent: ${mem.content}\n\nEXISTING:\n${existingContentText}\n\n` +
            "Merge into one clean, deduplicated entry.",
          temperature: 0.3,
        });

        finalSummary = consolidated.summary;
        finalContent = consolidated.content;
        keysToDelete.push(...relatedKeys);
      }

      const mode = targetKeyExists ? "update" : "add";
      const storeResult = await upsertMemory(
        redis,
        username,
        key,
        finalSummary,
        finalContent,
        mode
      );

      if (storeResult.success) {
        longTermStored++;
        log("[extractMemories] Stored memory", {
          username,
          key,
          confidence: mem.confidence,
          mode,
        });

        for (const oldKey of keysToDelete) {
          const deleteResult = await deleteMemory(redis, username, oldKey);
          if (deleteResult.success) {
            log("[extractMemories] Deleted merged key", {
              username,
              oldKey,
              mergedInto: key,
            });
          }
        }
      } else {
        logError("[extractMemories] Failed to store memory", {
          username,
          key,
          error: storeResult.message,
        });
      }
    }
  }

  if (markTodayProcessed && (dailyNotesStored > 0 || hasExistingDailyEntries)) {
    await markDailyNoteProcessed(redis, username, today);
  }

  log("[extractMemories] Done", {
    username,
    dailyNotes: dailyNotesStored,
    longTerm: longTermStored,
  });

  return {
    extracted: longTermStored,
    dailyNotes: dailyNotesStored,
    analyzed: result.longTermMemories.length,
    message:
      longTermStored > 0 || dailyNotesStored > 0
        ? `Logged ${dailyNotesStored} daily notes, extracted ${longTermStored} long-term memories`
        : "No noteworthy information found",
  };
}

export default apiHandler<{ messages?: ChatMessage[]; timeZone?: string }>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    const username = user?.username || "";
    const messages = body?.messages;
    const bodyTimeZone = body?.timeZone;
    const headerTimeZoneRaw = req.headers["x-user-timezone"];
    const headerTimeZone = Array.isArray(headerTimeZoneRaw)
      ? headerTimeZoneRaw[0]
      : headerTimeZoneRaw;
    const userTimeZone = normalizeTimeZone(bodyTimeZone || headerTimeZone);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger.warn("No messages provided");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Messages array required" });
      return;
    }

    try {
      const result = await extractMemoriesFromConversation({
        redis,
        username,
        messages,
        timeZone: userTimeZone,
        storeLongTermMemories: true,
        markTodayProcessed: true,
        log: (...args: unknown[]) => logger.info(String(args[0]), args[1]),
        logError: (...args: unknown[]) => logger.error(String(args[0]), args[1]),
      });

      logger.response(200, Date.now() - startTime);
      res.status(200).json(result);
    } catch (error) {
      logger.error("Memory extraction failed", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to extract memories" });
    }
  }
);
