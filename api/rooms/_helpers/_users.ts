/**
 * User handlers for chat-rooms API
 */

import { Redis } from "@upstash/redis";
import {
  getUser,
  createUserIfNotExists,
  getCurrentTimestamp,
} from "./_redis.js";
import { CHAT_USERS_PREFIX } from "./_constants.js";
import { logInfo, logError } from "../../_utils/_logging.js";
import {
  isProfaneUsername,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  USERNAME_REGEX,
} from "../../_utils/_validation.js";
// NOTE: Auth imports removed to keep this module Edge-compatible.
import type { User } from "./_types.js";
import { createErrorResponse } from "./_helpers.js";

// Create Redis client
function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

// ============================================================================
// User Management Functions
// ============================================================================

/**
 * Ensure user exists or create them
 * Throws on validation failure
 */
export async function ensureUserExists(
  username: string,
  requestId: string
): Promise<User> {
  // Check for profanity first
  if (isProfaneUsername(username)) {
    logInfo(
      requestId,
      `User check failed: Username contains inappropriate language: ${username}`
    );
    throw new Error("Username contains inappropriate language");
  }

  // Check minimum username length
  if (username.length < MIN_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User check failed: Username too short: ${username.length} chars (min: ${MIN_USERNAME_LENGTH})`
    );
    throw new Error(
      `Username must be at least ${MIN_USERNAME_LENGTH} characters`
    );
  }

  // Check maximum username length
  if (username.length > MAX_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User check failed: Username too long: ${username.length} chars (max: ${MAX_USERNAME_LENGTH})`
    );
    throw new Error(
      `Username must be ${MAX_USERNAME_LENGTH} characters or less`
    );
  }

  // Validate allowed characters
  if (!USERNAME_REGEX.test(username)) {
    logInfo(
      requestId,
      `User check failed: Invalid username format: ${username}`
    );
    throw new Error("Invalid username format");
  }

  // Attempt to get existing user
  const userData = await getUser(username);
  if (userData) {
    logInfo(requestId, `User ${username} exists.`);
    return userData;
  }

  // User doesn't exist, attempt atomic creation
  logInfo(requestId, `User ${username} not found. Attempting creation.`);
  const newUser: User = {
    username,
    lastActive: getCurrentTimestamp(),
  };

  const created = await createUserIfNotExists(username, newUser);

  if (created) {
    logInfo(requestId, `User ${username} created successfully.`);
    return newUser;
  } else {
    // Race condition: User was created between GET and SETNX
    logInfo(
      requestId,
      `User ${username} created concurrently. Fetching existing data.`
    );
    const existingUser = await getUser(username);
    if (existingUser) {
      return existingUser;
    } else {
      logError(
        requestId,
        `User ${username} existed momentarily but is now gone. Race condition?`
      );
      throw new Error("Failed to ensure user existence due to race condition.");
    }
  }
}

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle get users request (search)
 */
export async function handleGetUsers(
  requestId: string,
  searchQuery: string = ""
): Promise<Response> {
  const redis = getRedis();
  logInfo(requestId, `Fetching users with search query: "${searchQuery}"`);
  try {
    // Only search if query is at least 2 characters
    if (searchQuery.length < 2) {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const users: User[] = [];
    let cursor = 0;
    const maxResults = 20;
    const pattern = `${CHAT_USERS_PREFIX}*${searchQuery.toLowerCase()}*`;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });

      cursor = parseInt(String(newCursor));

      if (keys.length > 0) {
        const usersData = await redis.mget<(User | string | null)[]>(...keys);
        const foundUsers = usersData
          .map((user) => {
            try {
              if (!user) return null;
              return typeof user === "string" ? JSON.parse(user) : user;
            } catch {
              return null;
            }
          })
          .filter((u): u is User => u !== null);

        users.push(...foundUsers);

        if (users.length >= maxResults) {
          break;
        }
      }
    } while (cursor !== 0 && users.length < maxResults);

    const limitedUsers = users.slice(0, maxResults);

    logInfo(
      requestId,
      `Found ${limitedUsers.length} users matching "${searchQuery}"`
    );

    return new Response(JSON.stringify({ users: limitedUsers }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error fetching users:", error);
    return createErrorResponse("Failed to fetch users", 500);
  }
}
