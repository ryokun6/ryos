import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { Redis } from "@upstash/redis";
import type { MemoryIndex } from "../_utils/_memory.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ChatProactiveGreetingCoreInput {
  redis: Redis;
  username: string | null;
  isAuthenticated: boolean;
  userMemories: MemoryIndex | null;
  dailyNotesText: string | null;
  log: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
}

export async function executeChatProactiveGreetingCore(
  input: ChatProactiveGreetingCoreInput
): Promise<CoreResponse> {
  const { redis, username, isAuthenticated, userMemories, dailyNotesText, log, logError } = input;

  if (!username || !isAuthenticated) {
    return {
      status: 200,
      body: { greeting: null, reason: "no memories available" },
    };
  }

  try {
    const { getUnprocessedDailyNotesExcludingToday } = await import("../_utils/_memory.js");
    getUnprocessedDailyNotesExcludingToday(redis, username)
      .then(async (unprocessedNotes) => {
        if (unprocessedNotes.length > 0) {
          log(
            `[DailyNotes] Found ${unprocessedNotes.length} unprocessed past daily notes for ${username}, triggering background processing`
          );
          const { processDailyNotesForUser } = await import("../ai/process-daily-notes.js");
          processDailyNotesForUser(redis, username, log, logError).catch((err: unknown) => {
            logError("[DailyNotes] Background processing failed (non-blocking):", err);
          });
        }
      })
      .catch(() => {});
  } catch {
    // non-blocking background enrichment only
  }

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

  if (!memoryContext) {
    log("No memories available for proactive greeting");
    return {
      status: 200,
      body: { greeting: null, reason: "no memories available" },
    };
  }

  const now = new Date();
  const sfTime = now.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dayOfWeek = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
  });

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

It's ${dayOfWeek} ${sfTime}. The user's name is "${username}".

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
    log(`Generated proactive greeting: "${greeting.substring(0, 50)}..."`);
    return { status: 200, body: { greeting } };
  } catch (greetingErr) {
    logError("Failed to generate proactive greeting", greetingErr);
    return { status: 200, body: { greeting: null, reason: "generation failed" } };
  }
}
