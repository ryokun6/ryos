/**
 * POST /api/ai/proactive-greeting
 *
 * Generates a proactive, personalized greeting for the AI chat.
 * Uses the user's memories and daily notes to craft a short,
 * context-aware opener instead of a generic greeting.
 *
 * Currently limited to user "ryo" only.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import {
  getMemoryIndex,
  getDailyNotesForPrompt,
  type MemoryIndex,
} from "../_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 15;

// Only these usernames are allowed to use proactive greetings
const ALLOWED_USERS = new Set(["ryo"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const logger = initLogger(req);

  // CORS
  const origin = getEffectiveOrigin(req);
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "forbidden" });
  }
  setCorsHeaders(res, origin);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // --- Auth ---
  const username = req.headers["x-username"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;

  if (!username || !authHeader) {
    return res.status(401).json({ error: "authentication required" });
  }

  // Check allowlist
  if (!ALLOWED_USERS.has(username.toLowerCase())) {
    return res.status(403).json({ error: "not enabled for this user" });
  }

  // Validate auth
  const redis = Redis.fromEnv();
  const validationResult = await validateAuth(redis, username, authHeader);
  if (!validationResult.valid) {
    return res.status(401).json({ error: "authentication failed" });
  }

  // --- Fetch memories & daily notes ---
  let userMemories: MemoryIndex | null = null;
  let dailyNotesText: string | null = null;

  try {
    [userMemories, dailyNotesText] = await Promise.all([
      getMemoryIndex(redis, username),
      getDailyNotesForPrompt(redis, username),
    ]);
  } catch (err) {
    logger.error("Failed to fetch memories for proactive greeting", err);
  }

  // Build context for the AI
  let memoryContext = "";
  if (userMemories && userMemories.memories.length > 0) {
    memoryContext += "## User's long-term memories:\n";
    for (const mem of userMemories.memories) {
      memoryContext += `- ${mem.key}: ${mem.summary}\n`;
    }
  }

  if (dailyNotesText) {
    memoryContext += `\n## Recent daily notes:\n${dailyNotesText}\n`;
  }

  // If no memories at all, return a simple fallback
  if (!memoryContext) {
    return res.status(200).json({
      greeting: null,
      reason: "no memories available",
    });
  }

  // --- Get current time context ---
  const now = new Date();
  const hour = now.getUTCHours();
  // Rough time-of-day for SF (UTC-8 / UTC-7)
  const sfHour = (hour - 8 + 24) % 24;
  let timeOfDay = "day";
  if (sfHour >= 5 && sfHour < 12) timeOfDay = "morning";
  else if (sfHour >= 12 && sfHour < 17) timeOfDay = "afternoon";
  else if (sfHour >= 17 && sfHour < 21) timeOfDay = "evening";
  else timeOfDay = "night";

  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });

  // --- Generate greeting ---
  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      temperature: 1,
      maxTokens: 150,
      system: `You are Ryo, a friendly AI assistant. You're greeting a returning user at the start of a new chat.

Your style:
- Lowercase, casual, warm
- Short (1-2 sentences max, under 30 words)
- No emojis unless natural
- Sound like a close friend checking in, not a corporate assistant
- Don't be cheesy or over-enthusiastic
- Be specific — reference something from their memories or recent activity
- Mix it up: sometimes ask a question, sometimes share an observation, sometimes reference a shared interest

It's ${dayOfWeek} ${timeOfDay}. The user's name is "${username}".

${memoryContext}

Generate ONE short proactive greeting. Pick one interesting angle from the context — a recent topic, a memory, something timely — and use it naturally. Don't try to cover everything.

Examples of good greetings:
- "hey, how's the cursor roadmap coming along?"
- "morning — did you ever try that restaurant you mentioned?"
- "back again. still working on that project?"
- "hey ryo. happy friday — any plans?"

Do NOT start with generic greetings like "hey! i'm ryo" or "welcome back". Jump straight into something specific and interesting. Output ONLY the greeting text, nothing else.`,
      prompt: "Generate a proactive greeting.",
    });

    const greeting = text.trim();

    logger.info(
      `Generated proactive greeting for ${username}: "${greeting.substring(0, 50)}..."`
    );

    return res.status(200).json({ greeting });
  } catch (err) {
    logger.error("Failed to generate proactive greeting", err);
    return res.status(200).json({
      greeting: null,
      reason: "generation failed",
    });
  }
}
