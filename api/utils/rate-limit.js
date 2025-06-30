import { Redis } from "@upstash/redis";

// Set up Redis client
const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

// Constants for rate limiting
const AI_RATE_LIMIT_PREFIX = "rl:ai:";
const AI_LIMIT_PER_5_HOURS = 25;
const AI_LIMIT_ANON_PER_5_HOURS = 3;

// Helper function to get rate limit key for a user
const getAIRateLimitKey = (identifier) => {
  // Simple key format: rl:ai:{identifier}
  // For authenticated users: rl:ai:username
  // For anonymous users: rl:ai:anon:123.45.67.89
  return `${AI_RATE_LIMIT_PREFIX}${identifier}`;
};

// Helper function to check and increment AI message count
async function checkAndIncrementAIMessageCount(
  identifier,
  isAuthenticated,
  authToken = null
) {
  const key = getAIRateLimitKey(identifier);
  const currentCount = await redis.get(key);
  const count = currentCount ? parseInt(currentCount) : 0;

  // Determine if user is anonymous (identifier starts with "anon:")
  const isAnonymous = identifier.startsWith("anon:");

  // Set limit based on authentication status
  const limit = isAnonymous ? AI_LIMIT_ANON_PER_5_HOURS : AI_LIMIT_PER_5_HOURS;

  // Allow ryo to bypass rate limits
  const isRyo = identifier === "ryo";

  // Skip all rate limiting for ryo
  if (isRyo) {
    return { allowed: true, count, limit };
  }

  // If authenticated, validate the token
  if (isAuthenticated && authToken) {
    const AUTH_TOKEN_PREFIX = "chat:token:";

    // 1) Preferred path: token -> username mapping (multi-token support)
    const mappedUsername = await redis.get(`${AUTH_TOKEN_PREFIX}${authToken}`);
    const mappedUsernameMatches =
      mappedUsername && mappedUsername.toLowerCase() === identifier;

    // 2) Legacy path: single token stored as username -> token
    const legacyToken = await redis.get(`${AUTH_TOKEN_PREFIX}${identifier}`);
    const legacyTokenMatches = legacyToken && legacyToken === authToken;

    if (!mappedUsernameMatches && !legacyTokenMatches) {
      // Invalid token for this user – treat as unauthenticated (use anon limit)
      return {
        allowed: false,
        count: 0,
        limit: AI_LIMIT_ANON_PER_5_HOURS,
      };
    }
  }

  if (count >= limit && !isRyo) {
    return { allowed: false, count, limit };
  }

  // Increment count
  await redis.incr(key);

  // Set TTL to 5 hours if this is the first message
  if (count === 0) {
    const ttlSeconds = 5 * 60 * 60; // 5 hours in seconds
    await redis.expire(key, ttlSeconds);
  }

  return { allowed: true, count: count + 1, limit };
}

// Export rate limit functions
export {
  checkAndIncrementAIMessageCount,
  AI_LIMIT_PER_5_HOURS,
  AI_LIMIT_ANON_PER_5_HOURS,
};
