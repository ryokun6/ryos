/**
 * Lightweight per-user rate limiting for server-executed chat tools.
 *
 * The chat endpoint already rate limits messages (per IP for anonymous users,
 * per username for authenticated ones), but a single message can trigger up
 * to `stopAfterSteps` tool calls. These per-tool counters bound how much
 * external quota (YouTube API, Apple Maps, arbitrary web fetches) one user
 * can burn through tool loops.
 *
 * Anonymous users are not tracked here: their chat budget (3 messages/day
 * per IP) already caps tool usage, and there is no stable identifier
 * available in the tool context.
 */

import type { Redis } from "../../_utils/redis.js";
import { checkCounterLimit } from "../../_utils/_rate-limit.js";

export type RateLimitedToolName =
  | "webFetch"
  | "searchSongs"
  | "mapsSearchPlaces"
  | "runJs";

const TOOL_RATE_LIMITS: Record<
  RateLimitedToolName,
  { limit: number; windowSeconds: number }
> = {
  webFetch: { limit: 50, windowSeconds: 60 * 60 },
  searchSongs: { limit: 30, windowSeconds: 60 * 60 },
  mapsSearchPlaces: { limit: 50, windowSeconds: 60 * 60 },
  // Each run is CPU-bounded (15s max) but still burns server compute.
  runJs: { limit: 60, windowSeconds: 60 * 60 },
};

export interface ToolRateLimitResult {
  allowed: boolean;
  /** Human/model-readable failure message when not allowed. */
  message?: string;
}

export async function checkToolRateLimit(
  tool: RateLimitedToolName,
  context: {
    username?: string | null;
    /** Reuse the tool context's Redis client when available (also keeps unit tests offline). */
    redis?: Redis;
    logError: (...args: unknown[]) => void;
  }
): Promise<ToolRateLimitResult> {
  const { username, redis, logError } = context;
  if (!username) return { allowed: true };

  const { limit, windowSeconds } = TOOL_RATE_LIMITS[tool];
  try {
    const result = await checkCounterLimit({
      key: `ratelimit:tool:${tool}:${username.toLowerCase()}`,
      windowSeconds,
      limit,
      ...(redis ? { redis } : {}),
    });
    if (!result.allowed) {
      const minutes = Math.max(1, Math.ceil(result.resetSeconds / 60));
      return {
        allowed: false,
        message: `Rate limit reached for ${tool} (${limit} calls/hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
    return { allowed: true };
  } catch (error) {
    // Fail open: a Redis hiccup should not take down tool execution.
    logError(`[${tool}] rate limit check failed`, error);
    return { allowed: true };
  }
}
