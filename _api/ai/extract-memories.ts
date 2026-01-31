/**
 * POST /api/ai/extract-memories
 * 
 * Analyzes a conversation and extracts memories to store.
 * Called asynchronously when user clears their chat history.
 * 
 * This endpoint:
 * 1. Takes the conversation history
 * 2. Uses AI to identify noteworthy information about the user
 * 3. Stores extracted memories using the memory system
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
  promoteMemoryToLongterm,
  filterActiveMemories,
  calculateExpiresAt,
  MAX_MEMORIES_PER_USER,
  type MemoryType,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Phase 1 Schema: Extract new memories and identify related existing keys
const extractionSchema = z.object({
  memories: z.array(z.object({
    key: z.string()
      .min(1)
      .max(30)
      .describe("Canonical key for this memory (use preferred keys when topic matches)"),
    summary: z.string()
      .min(1)
      .max(180)
      .describe("Brief summary of the NEW information from this conversation"),
    content: z.string()
      .min(1)
      .max(2000)
      .describe("Detailed NEW information extracted from this conversation"),
    confidence: z.enum(["high", "medium", "low"])
      .describe("How confident this is worth remembering"),
    relatedKeys: z.array(z.string()).optional()
      .describe("Existing memory keys that cover the same/related topic and should be merged with this"),
    type: z.enum(["longterm", "shortterm"])
      .describe("'longterm' for permanent facts (name, preferences), 'shortterm' for current/temporary info (current project, recent events)"),
    expiresInDays: z.number().int().min(1).max(90).optional()
      .describe("For shortterm only: days until expiration (default 7). Use 14-30 for longer projects, 1-3 for very temporary info."),
  })).describe("List of memories to extract from the conversation"),
  promotions: z.array(z.object({
    key: z.string().describe("Existing shortterm memory key to promote to longterm"),
    reason: z.string().describe("Why this should become permanent"),
  })).optional()
    .describe("Shortterm memories that should be promoted to longterm (became permanent facts)"),
  deleteKeys: z.array(z.string()).optional()
    .describe("Memory keys that should be permanently deleted (obsolete, incorrect, or user requested removal)"),
});

// Phase 2 Schema: Consolidate new info with existing memory content
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

// Phase 1: Extract new information and identify related existing memories
const EXTRACTION_PROMPT = `You are analyzing a conversation to extract user memories.

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

MEMORY TYPES:
- longterm: Permanent facts that rarely change (name, birthday, preferences, skills, instructions)
- shortterm: Current/temporary info that will change (current project, recent events, ongoing context)

TYPE CLASSIFICATION:
- Identity info (name, birthday, location) → longterm
- Stable preferences (music, food, interests) → longterm
- Skills, education, work history → longterm
- Instructions for how to respond → longterm
- Current work/projects → shortterm (7-14 day expiration)
- Recent events/context → shortterm (7 day expiration)
- Temporary states or situations → shortterm (1-7 day expiration)

EXPIRATION (shortterm only):
- Default: 7 days
- Longer projects: 14-30 days
- Very temporary info: 1-3 days

EXTRACTION RULES:
1. Use canonical keys when the topic matches
2. Extract only NEW information from the conversation
3. If an existing memory (shown below) covers the same/related topic:
   - Use the canonical key as the output key
   - List the related existing key(s) in relatedKeys - these will be merged
4. Use confidence "high" for directly stated facts, "medium" for reasonable inferences, "low" for weak signals
5. Don't store sensitive data (passwords, financial info)
6. Use lowercase keys with underscores
7. If nothing noteworthy, return empty array
8. Classify each memory as longterm or shortterm based on the rules above

CONSOLIDATION:
- Review existing shortterm memories (especially expired ones shown below)
- If a shortterm memory has become a permanent fact, add it to "promotions"
- If a memory is obsolete, incorrect, or user requested removal, add its key to "deleteKeys"
- Expired memories are still in storage but hidden from the AI - you can promote them back if still relevant`;

// Phase 2: Consolidate new info with existing memory content
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
    return res.status(200).json({ extracted: 0, message: "Conversation too short" });
  }

  // Check current memory count
  const currentIndex = await getMemoryIndex(redis, username);
  const currentCount = currentIndex?.memories.length || 0;
  const remainingSlots = MAX_MEMORIES_PER_USER - currentCount;

  if (remainingSlots <= 0) {
    logger.info("Memory limit reached", { username, currentCount });
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({ extracted: 0, message: "Memory limit reached" });
  }

  logger.info("Extracting memories", { 
    username, 
    messageCount: messages.length,
    conversationLength: conversationText.length,
    remainingSlots,
  });

  try {
    // Get existing memory summaries with type info (not full content yet - that's fetched on demand)
    const existingKeys = currentIndex?.memories.map(m => m.key) || [];
    
    // Separate active and expired memories for the prompt
    const { active: activeMemories, expired: expiredMemories } = currentIndex
      ? filterActiveMemories(currentIndex.memories)
      : { active: [], expired: [] };
    
    const activeSummariesText = activeMemories.length > 0
      ? activeMemories.map(m => {
          const typeLabel = m.type === "shortterm" ? " [shortterm]" : " [longterm]";
          const expiresLabel = m.expiresAt 
            ? ` (expires: ${new Date(m.expiresAt).toLocaleDateString()})` 
            : "";
          return `- ${m.key}${typeLabel}${expiresLabel}: ${m.summary}`;
        }).join("\n")
      : "None";
    
    const expiredSummariesText = expiredMemories.length > 0
      ? expiredMemories.map(m => {
          const expiredDate = m.expiresAt ? new Date(m.expiresAt).toLocaleDateString() : "unknown";
          return `- ${m.key} (expired ${expiredDate}): ${m.summary}`;
        }).join("\n")
      : "None";
    
    const existingSummariesText = `ACTIVE MEMORIES:\n${activeSummariesText}\n\nEXPIRED MEMORIES (still in storage, can be promoted):\n${expiredSummariesText}`;

    // Phase 1: Extract new memories and identify related existing keys
    logger.info("Phase 1: Extracting new memories", { username });
    const { object: extractionResult } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: extractionSchema,
      prompt: `${EXTRACTION_PROMPT}\n\nEXISTING MEMORIES (summaries only):\n${existingSummariesText}\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\nExtract up to ${Math.min(5, remainingSlots)} memories. For each, identify any related existing keys that should be merged.`,
      temperature: 0.3,
    });

    logger.info("Phase 1 complete", { 
      username, 
      memoriesFound: extractionResult.memories.length,
    });

    // Filter to high/medium confidence and limit count
    const toProcess = extractionResult.memories
      .filter(m => m.confidence !== "low")
      .slice(0, remainingSlots);

    // Phase 2: For memories with relatedKeys, fetch content and consolidate
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
        
        logger.info("Phase 2: Fetching content for consolidation", { 
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

        // Phase 2: Consolidate with AI
        const { object: consolidated } = await generateObject({
          model: google("gemini-2.0-flash"),
          schema: consolidationSchema,
          prompt: `${CONSOLIDATION_PROMPT}\n\nNEW INFORMATION:\nSummary: ${mem.summary}\nContent: ${mem.content}\n\nEXISTING MEMORY CONTENT:\n${existingContentText}\n\nConsolidate into a single memory.`,
          temperature: 0.3,
        });

        finalSummary = consolidated.summary;
        finalContent = consolidated.content;
        keysToDelete.push(...relatedKeys);

        logger.info("Phase 2: Consolidation complete", { username, key, mergedFrom: relatedKeys });
      }

      // Store the memory with type and expiration
      const mode = existingKeys.includes(key) ? "update" : "add";
      const memType = mem.type as MemoryType;
      const expiresAt = memType === "shortterm" 
        ? calculateExpiresAt(mem.expiresInDays || 7)
        : undefined;
      
      const storeResult = await upsertMemory(
        redis,
        username,
        key,
        finalSummary,
        finalContent,
        mode,
        memType,
        expiresAt
      );

      if (storeResult.success) {
        stored++;
        logger.info("Stored memory", { username, key, confidence: mem.confidence, mode, type: memType });
        
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
        logger.warn("Failed to store memory", { username, key, error: storeResult.message });
      }
    }

    // Process promotions (shortterm → longterm)
    let promoted = 0;
    if (extractionResult.promotions && extractionResult.promotions.length > 0) {
      logger.info("Processing promotions", { username, count: extractionResult.promotions.length });
      
      for (const promotion of extractionResult.promotions) {
        const normalizedKey = promotion.key.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        if (!existingKeys.includes(normalizedKey)) {
          logger.warn("Promotion skipped - key not found", { username, key: normalizedKey });
          continue;
        }
        
        const promoteResult = await promoteMemoryToLongterm(redis, username, normalizedKey);
        if (promoteResult.success) {
          promoted++;
          logger.info("Promoted memory to longterm", { username, key: normalizedKey, reason: promotion.reason });
        } else {
          logger.warn("Failed to promote memory", { username, key: normalizedKey, error: promoteResult.message });
        }
      }
    }

    // Process explicit deletions (only when AI specifically recommends)
    let deleted = 0;
    if (extractionResult.deleteKeys && extractionResult.deleteKeys.length > 0) {
      logger.info("Processing deletions", { username, count: extractionResult.deleteKeys.length });
      
      for (const keyToDelete of extractionResult.deleteKeys) {
        const normalizedKey = keyToDelete.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        if (!existingKeys.includes(normalizedKey)) {
          logger.warn("Deletion skipped - key not found", { username, key: normalizedKey });
          continue;
        }
        
        const deleteResult = await deleteMemory(redis, username, normalizedKey);
        if (deleteResult.success) {
          deleted++;
          logger.info("Deleted memory", { username, key: normalizedKey });
        } else {
          logger.warn("Failed to delete memory", { username, key: normalizedKey, error: deleteResult.message });
        }
      }
    }

    logger.info("Memory extraction complete", { username, extracted: stored, promoted, deleted });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      extracted: stored,
      promoted,
      deleted,
      analyzed: extractionResult.memories.length,
      message: stored > 0 || promoted > 0 || deleted > 0
        ? `Processed memories: ${stored} extracted, ${promoted} promoted, ${deleted} deleted`
        : "No noteworthy memories found",
    });

  } catch (error) {
    logger.error("Memory extraction failed", error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Failed to extract memories" });
  }
}
