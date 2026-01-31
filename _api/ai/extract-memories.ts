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
  upsertMemory,
  MAX_MEMORIES_PER_USER,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Schema for extracted memories
const extractedMemorySchema = z.object({
  memories: z.array(z.object({
    key: z.string()
      .min(1)
      .max(30)
      .describe("Short key for this memory (lowercase, underscores ok)"),
    summary: z.string()
      .min(1)
      .max(150)
      .describe("Brief 1-2 sentence summary"),
    content: z.string()
      .min(1)
      .max(500)
      .describe("Relevant details and context"),
    confidence: z.enum(["high", "medium", "low"])
      .describe("How confident this is worth remembering"),
  })).describe("List of memories to extract from the conversation"),
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

// System prompt for memory extraction
const EXTRACTION_PROMPT = `You are analyzing a conversation to extract important information about the user that should be remembered for future conversations.

Extract memories for information that is:
- Personal details (name, birthday, location, timezone, family, pets)
- Preferences and opinions (likes, dislikes, communication style)
- Work/life context (job, projects, goals, skills, education)
- Significant events or context shared
- Patterns or recurring themes

Guidelines:
- Only extract information explicitly stated or strongly implied
- Use confidence "high" for directly stated facts, "medium" for reasonable inferences, "low" for weak signals
- Prefer specific details over vague observations
- Don't extract sensitive data (passwords, financial details)
- Use lowercase keys with underscores (e.g., "work_project", "music_pref")
- Keep summaries concise but informative
- If nothing noteworthy, return empty array

Common keys to use:
- name, nickname, birthday, age, location, timezone
- work, job, company, role, projects, skills
- interests, hobbies, music_pref, food_pref
- family, pets, relationships
- goals, aspirations, current_focus
- communication_style, preferences`;

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
    // Get existing memory keys to avoid duplicates
    const existingKeys = currentIndex?.memories.map(m => m.key) || [];
    const existingKeysText = existingKeys.length > 0
      ? `\n\nExisting memory keys (avoid duplicating these topics unless updating): ${existingKeys.join(", ")}`
      : "";

    // Use AI to extract memories
    const { object: result } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: extractedMemorySchema,
      prompt: `${EXTRACTION_PROMPT}${existingKeysText}\n\n--- CONVERSATION ---\n${conversationText}\n--- END CONVERSATION ---\n\nExtract up to ${Math.min(5, remainingSlots)} memories from this conversation. Focus on high and medium confidence items.`,
      temperature: 0.3,
    });

    logger.info("Extraction complete", { 
      username, 
      memoriesFound: result.memories.length,
    });

    // Filter to high/medium confidence and limit count
    const toStore = result.memories
      .filter(m => m.confidence !== "low")
      .slice(0, remainingSlots);

    // Store each memory
    let stored = 0;
    for (const mem of toStore) {
      // Normalize key
      const key = mem.key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);
      if (!key || !/^[a-z]/.test(key)) continue;

      const storeResult = await upsertMemory(
        redis,
        username,
        key,
        mem.summary,
        mem.content,
        existingKeys.includes(key) ? "merge" : "add"
      );

      if (storeResult.success) {
        stored++;
        logger.info("Stored memory", { username, key, confidence: mem.confidence });
      } else {
        logger.warn("Failed to store memory", { username, key, error: storeResult.message });
      }
    }

    logger.info("Memory extraction complete", { username, extracted: stored });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      extracted: stored,
      analyzed: result.memories.length,
      message: stored > 0 
        ? `Extracted ${stored} memories from conversation`
        : "No noteworthy memories found",
    });

  } catch (error) {
    logger.error("Memory extraction failed", error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Failed to extract memories" });
  }
}
