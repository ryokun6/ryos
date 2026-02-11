/**
 * POST /api/ai/extract-memories
 * 
 * Analyzes a conversation, logs daily notes, and extracts long-term memories.
 * Called asynchronously when user clears their chat history.
 * 
 * Two-tier extraction flow:
 * 1. Append conversation highlights to today's daily note (journal)
 * 2. Process daily notes + conversation to extract/update long-term memories
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
  getUnprocessedDailyNotes,
  markDailyNoteProcessed,
  MAX_MEMORIES_PER_USER,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily notes extraction schema: capture conversation highlights for the journal
const dailyNotesSchema = z.object({
  notes: z.array(z.string()
    .min(1)
    .max(500)
    .describe("A brief observation, event, or context note from the conversation")
  ).describe("List of daily note entries to log from this conversation. Capture: topics discussed, things the user mentioned doing, mood/context, interesting details, plans mentioned, etc. Keep each note brief and factual."),
});

// Long-term extraction schema: identify stable facts worth remembering permanently
const extractionSchema = z.object({
  memories: z.array(z.object({
    key: z.string()
      .min(1)
      .max(30)
      .describe("Canonical key for this memory (use preferred keys when topic matches)"),
    summary: z.string()
      .min(1)
      .max(180)
      .describe("Brief summary of the stable fact or preference"),
    content: z.string()
      .min(1)
      .max(2000)
      .describe("Detailed information to remember long-term"),
    confidence: z.enum(["high", "medium", "low"])
      .describe("How confident this is a stable, long-term fact (not just passing context)"),
    relatedKeys: z.array(z.string()).optional()
      .describe("Existing memory keys that cover the same/related topic and should be merged with this"),
  })).describe("List of LONG-TERM memories to extract. Only include stable facts, preferences, and identity info – not passing context or daily events."),
});

// Consolidation schema: merge new info with existing memory content
const consolidationSchema = z.object({
  summary: z.string()
    .min(1)
    .max(180)
    .describe("Synthesized summary combining all information"),
  content: z.string()
    .min(1)
    .max(2000)
    .describe("Consolidated content - organized, deduped, newer info takes precedence"),
});

// Message format from the chat
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

// Helper to extract text from message
function getMessageText(msg: ChatMessage): string {
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter(p => p.type === "text" && p.text)
      .map(p => p.text)
      .join("\n");
  }
  return msg.content || "";
}

// Helper to create Redis client
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

// Daily notes extraction prompt
const DAILY_NOTES_PROMPT = `You are analyzing a conversation to capture daily journal notes.

Extract observations, events, and context from this conversation as brief journal entries.
Think of this as a diary – what happened? What did the user mention? What was discussed?

WHAT TO CAPTURE:
- Topics discussed (e.g., "discussed react hooks and state management")
- Things user mentioned doing (e.g., "user said they're working from home today")
- Mood/energy signals (e.g., "user seemed excited about new job opportunity")
- Plans or events mentioned (e.g., "user has a dentist appointment tomorrow")
- Interesting details (e.g., "user tried a new korean restaurant and loved it")
- Questions they asked or problems they had (e.g., "user debugging a CSS grid issue")
- Music/media context (e.g., "listened to newjeans together")

RULES:
- Keep each note brief (1-2 sentences max)
- Be factual and specific, not generic
- Don't include greetings or small talk unless meaningful
- Don't include AI responses, only user context
- If conversation was trivial or too short, return empty array`;

// Long-term memory extraction prompt
const EXTRACTION_PROMPT = `You are analyzing a conversation and daily notes to extract LONG-TERM memories.

CANONICAL KEYS (prefer these when the topic matches):
- name: User's name, nickname, how to address them
- birthday: Birthday, age
- location: Where they live, timezone
- work: Job, company, role, career
- skills: Skills, expertise
- education: School, degree
- projects: Current projects
- music_pref: Music taste, favorite artists
- food_pref: Food preferences, diet
- interests: Hobbies, general interests
- entertainment: Movies, shows, games, books
- family: Family members
- friends: Friends
- pets: Pets
- goals: Goals, aspirations
- current_focus: Current priorities
- context: Important life context
- preferences: General preferences
- instructions: How to respond to them

IMPORTANT: Only extract STABLE, LONG-TERM facts. NOT passing context or daily events.

WHAT IS LONG-TERM:
- "My name is Sarah" → YES (identity, stable)
- "I work at Google as a PM" → YES (career, stable)
- "I love spicy food" → YES (preference, stable)
- "Always respond in Japanese" → YES (instruction, stable)
- "My cat's name is Mochi" → YES (pet, stable)

WHAT IS NOT LONG-TERM (already captured in daily notes):
- "I have a meeting at 3pm" → NO (daily event)
- "Working on a react project today" → NO (temporary)
- "Feeling tired today" → NO (temporary mood)
- "Craving ramen tonight" → NO (temporary)

EXTRACTION RULES:
1. Use canonical keys when the topic matches
2. Extract only NEW stable information
3. If an existing memory covers the same topic, list it in relatedKeys for merging
4. Use confidence "high" for directly stated facts, "medium" for reasonable inferences, "low" for weak signals
5. Don't store sensitive data (passwords, financial info)
6. Use lowercase keys with underscores
7. If nothing qualifies as long-term, return empty array`;

// Consolidation prompt for merging new info with existing memories
const CONSOLIDATION_PROMPT = `You are consolidating user memory information.

Given:
- NEW information extracted from a conversation
- EXISTING memory content that covers the same topic

Create a consolidated memory that:
1. Synthesizes a combined summary (max 180 chars) capturing all relevant info
2. Consolidates content - organize logically, remove duplicates, newer info takes precedence if contradicting
3. Preserves all important details from both sources`;

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

  // Filter to user/assistant messages and format for analysis
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

  logger.info("Starting two-tier extraction", { 
    username, 
    messageCount: messages.length,
    conversationLength: conversationText.length,
  });

  try {
    // ========================================================================
    // PHASE 1: Extract daily notes (journal entries) from the conversation
    // ========================================================================
    logger.info("Phase 1: Extracting daily notes", { username });

    const { object: dailyNotesResult } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: dailyNotesSchema,
      prompt: `${DAILY_NOTES_PROMPT}\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\nExtract up to 10 daily journal entries from this conversation.`,
      temperature: 0.3,
    });

    // Append each daily note entry
    let dailyNotesStored = 0;
    for (const note of dailyNotesResult.notes) {
      const result = await appendDailyNote(redis, username, note);
      if (result.success) {
        dailyNotesStored++;
      }
    }

    logger.info("Phase 1 complete: Daily notes stored", { 
      username, 
      notesExtracted: dailyNotesResult.notes.length,
      notesStored: dailyNotesStored,
    });

    // ========================================================================
    // PHASE 2: Extract long-term memories from conversation + daily notes
    // ========================================================================

    // Check current memory count
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

    // Get existing memory summaries
    const existingKeys = currentIndex?.memories.map(m => m.key) || [];
    const existingSummariesText = currentIndex && currentIndex.memories.length > 0
      ? currentIndex.memories.map(m => `- ${m.key}: ${m.summary}`).join("\n")
      : "None";

    // Get recent unprocessed daily notes for additional context
    const unprocessedNotes = await getUnprocessedDailyNotes(redis, username);
    const dailyNotesContext = unprocessedNotes.length > 0
      ? unprocessedNotes.map(n => {
          const entries = n.entries.map(e => `  - ${e.content}`).join("\n");
          return `${n.date}:\n${entries}`;
        }).join("\n")
      : "None";

    logger.info("Phase 2: Extracting long-term memories", { 
      username, 
      unprocessedDailyNotes: unprocessedNotes.length,
    });

    const { object: extractionResult } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: extractionSchema,
      prompt: `${EXTRACTION_PROMPT}\n\nEXISTING LONG-TERM MEMORIES:\n${existingSummariesText}\n\nRECENT DAILY NOTES (for context – do NOT re-extract daily events):\n${dailyNotesContext}\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\nExtract up to ${Math.min(5, remainingSlots)} LONG-TERM memories. Only stable facts, not daily events.`,
      temperature: 0.3,
    });

    logger.info("Phase 2 extraction complete", { 
      username, 
      memoriesFound: extractionResult.memories.length,
    });

    // Filter to high/medium confidence and limit count
    const toProcess = extractionResult.memories
      .filter(m => m.confidence !== "low")
      .slice(0, remainingSlots);

    // Phase 3: For memories with relatedKeys, fetch content and consolidate
    let stored = 0;
    for (const mem of toProcess) {
      // Normalize key
      const key = mem.key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);
      if (!key || !/^[a-z]/.test(key)) continue;

      let finalSummary = mem.summary;
      let finalContent = mem.content;
      const keysToDelete: string[] = [];

      // Check if there are related keys that need consolidation
      const relatedKeys = (mem.relatedKeys || [])
        .map(k => k.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
        .filter(k => k !== key && existingKeys.includes(k));

      // Also check if the target key itself exists (needs merging)
      const targetKeyExists = existingKeys.includes(key);

      if (relatedKeys.length > 0 || targetKeyExists) {
        // Fetch content only for keys that need consolidation
        const keysToFetch = targetKeyExists ? [key, ...relatedKeys] : relatedKeys;
        const uniqueKeysToFetch = [...new Set(keysToFetch)];
        
        logger.info("Phase 3: Fetching content for consolidation", { 
          username, 
          targetKey: key, 
          keysToFetch: uniqueKeysToFetch 
        });

        const existingContents = await Promise.all(
          uniqueKeysToFetch.map(async (k) => {
            const detail = await getMemoryDetail(redis, username, k);
            const entry = currentIndex?.memories.find(m => m.key === k);
            return {
              key: k,
              summary: entry?.summary || "",
              content: detail?.content || "",
            };
          })
        );

        const existingContentText = existingContents
          .map(m => `Key: ${m.key}\nSummary: ${m.summary}\nContent: ${m.content}`)
          .join("\n\n");

        // Consolidate with AI
        const { object: consolidated } = await generateObject({
          model: google("gemini-2.0-flash"),
          schema: consolidationSchema,
          prompt: `${CONSOLIDATION_PROMPT}\n\nNEW INFORMATION:\nSummary: ${mem.summary}\nContent: ${mem.content}\n\nEXISTING MEMORY CONTENT:\n${existingContentText}\n\nConsolidate into a single memory.`,
          temperature: 0.3,
        });

        finalSummary = consolidated.summary;
        finalContent = consolidated.content;
        keysToDelete.push(...relatedKeys);

        logger.info("Phase 3: Consolidation complete", { username, key, mergedFrom: relatedKeys });
      }

      // Store the memory
      const mode = existingKeys.includes(key) ? "update" : "add";
      
      const storeResult = await upsertMemory(
        redis,
        username,
        key,
        finalSummary,
        finalContent,
        mode
      );

      if (storeResult.success) {
        stored++;
        logger.info("Stored long-term memory", { username, key, confidence: mem.confidence, mode });
        
        // Delete merged keys
        for (const oldKey of keysToDelete) {
          const deleteResult = await deleteMemory(redis, username, oldKey);
          if (deleteResult.success) {
            logger.info("Deleted merged key", { username, oldKey, mergedInto: key });
          } else {
            logger.warn("Failed to delete merged key", { username, oldKey, error: deleteResult.message });
          }
        }
      } else {
        logger.warn("Failed to store long-term memory", { username, key, error: storeResult.message });
      }
    }

    // Mark daily notes as processed
    for (const note of unprocessedNotes) {
      await markDailyNoteProcessed(redis, username, note.date);
    }

    logger.info("Memory extraction complete", { 
      username, 
      dailyNotes: dailyNotesStored,
      longTermMemories: stored,
    });
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
