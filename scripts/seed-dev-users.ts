#!/usr/bin/env bun
/**
 * Seed development users for local testing
 * Run with: NODE_ENV=development bun run scripts/seed-dev-users.ts
 *
 * Creates admin user 'ryo' with password 'testtest' in dev environment only.
 * If the user exists with a different password, it will be deleted and recreated.
 * This script will ONLY run when NODE_ENV or VERCEL_ENV is set to 'development'.
 */

import { Redis } from "@upstash/redis";

const BASE_URL = process.env.API_URL || "http://localhost:3000";

// Redis key prefixes (must match api/chat-rooms/_constants.ts and api/_utils/auth)
const CHAT_USERS_PREFIX = "chat:users:";
const PASSWORD_HASH_PREFIX = "chat:password:";
const AUTH_TOKEN_PREFIX = "chat:token:";

// ANSI color codes
const COLOR = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
};

interface DevUser {
  username: string;
  password: string;
  description: string;
}

// Dev users to seed - only in development!
const DEV_USERS: DevUser[] = [
  {
    username: "ryo",
    password: "testtest",
    description: "Admin user",
  },
];

// Initialize Redis client
function getRedisClient(): Redis | null {
  const url = process.env.REDIS_KV_REST_API_URL;
  const token = process.env.REDIS_KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

/**
 * Delete a user from Redis (user data, password hash, and tokens)
 */
async function deleteUserFromRedis(redis: Redis, username: string): Promise<boolean> {
  const normalizedUsername = username.toLowerCase();

  try {
    const keysToDelete: string[] = [
      `${CHAT_USERS_PREFIX}${normalizedUsername}`,
      `${PASSWORD_HASH_PREFIX}${normalizedUsername}`,
      `${AUTH_TOKEN_PREFIX}last:${normalizedUsername}`,
    ];

    // Find and delete all user tokens
    const tokenPattern = `${AUTH_TOKEN_PREFIX}user:${normalizedUsername}:*`;
    let cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: tokenPattern,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      keysToDelete.push(...keys);
    } while (cursor !== 0);

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }

    return true;
  } catch (error) {
    console.error(`Failed to delete user ${username} from Redis:`, error);
    return false;
  }
}

/**
 * Try to authenticate user with given password
 */
async function tryAuthenticate(
  username: string,
  password: string
): Promise<{ success: boolean; token?: string; status: number }> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ username, password }),
      }
    );

    if (res.status === 200) {
      const data = await res.json();
      return { success: true, token: data.token, status: res.status };
    }
    return { success: false, status: res.status };
  } catch {
    return { success: false, status: 0 };
  }
}

/**
 * Create a new user
 */
async function createUser(
  username: string,
  password: string
): Promise<{ success: boolean; message: string; token?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.status === 201) {
      return { success: true, message: "created", token: data.token };
    }
    return { success: false, message: data.error || `status ${res.status}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function seedUser(
  user: DevUser,
  redis: Redis | null
): Promise<{ success: boolean; message: string }> {
  // Step 1: Try to authenticate with the expected password
  const authResult = await tryAuthenticate(user.username, user.password);

  if (authResult.success) {
    return {
      success: true,
      message: `User '${user.username}' exists with correct password`,
    };
  }

  // Step 2: If auth failed with 401, user might exist with different password
  if (authResult.status === 401) {
    // Check if user exists by trying to create (will fail with 409 if exists)
    const createAttempt = await createUser(user.username, user.password);

    if (createAttempt.success) {
      return {
        success: true,
        message: `Created new user '${user.username}'`,
      };
    }

    // User exists with different password - need to delete and recreate
    if (createAttempt.message.includes("taken") || createAttempt.message.includes("409")) {
      if (!redis) {
        return {
          success: false,
          message: `User '${user.username}' exists with different password but no Redis connection to delete`,
        };
      }

      console.log(
        `  ${COLOR.YELLOW}→${COLOR.RESET} User '${user.username}' exists with different password, deleting...`
      );

      const deleted = await deleteUserFromRedis(redis, user.username);
      if (!deleted) {
        return {
          success: false,
          message: `Failed to delete existing user '${user.username}'`,
        };
      }

      // Now create the user with the correct password
      const recreateResult = await createUser(user.username, user.password);
      if (recreateResult.success) {
        return {
          success: true,
          message: `Recreated user '${user.username}' with new password`,
        };
      }
      return {
        success: false,
        message: `Failed to recreate '${user.username}': ${recreateResult.message}`,
      };
    }

    return {
      success: false,
      message: `Failed to create '${user.username}': ${createAttempt.message}`,
    };
  }

  // Step 3: Other error (network, server down, etc.)
  return {
    success: false,
    message: `Failed to seed '${user.username}': server returned status ${authResult.status}`,
  };
}

async function main(): Promise<void> {
  // Safety check: Only allow in development mode
  const nodeEnv = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  const isDev = nodeEnv === "development" || vercelEnv === "development";
  
  if (!isDev) {
    console.error(
      `${COLOR.RED}${COLOR.BOLD}ERROR:${COLOR.RESET} This script can only run in development mode!`
    );
    console.error(
      `Current NODE_ENV: ${nodeEnv ? `'${nodeEnv}'` : "(not set)"}`
    );
    console.error(
      `Current VERCEL_ENV: ${vercelEnv ? `'${vercelEnv}'` : "(not set)"}`
    );
    console.error("Set NODE_ENV=development or VERCEL_ENV=development to run this script.");
    process.exit(1);
  }

  console.log(`\n${COLOR.CYAN}${COLOR.BOLD}Seeding Development Users${COLOR.RESET}`);
  console.log(`${COLOR.DIM}Server: ${BASE_URL}${COLOR.RESET}\n`);

  // Initialize Redis for user deletion if needed
  const redis = getRedisClient();
  if (!redis) {
    console.log(
      `${COLOR.YELLOW}Warning:${COLOR.RESET} Redis not configured - cannot delete/recreate existing users with wrong passwords.\n`
    );
  }

  let allSuccess = true;

  for (const user of DEV_USERS) {
    const result = await seedUser(user, redis);
    const icon = result.success
      ? `${COLOR.GREEN}✓${COLOR.RESET}`
      : `${COLOR.RED}✗${COLOR.RESET}`;
    const desc = `${COLOR.DIM}(${user.description})${COLOR.RESET}`;
    console.log(`  ${icon} ${result.message} ${desc}`);
    if (!result.success) allSuccess = false;
  }

  console.log("");

  if (allSuccess) {
    console.log(`${COLOR.GREEN}${COLOR.BOLD}Done!${COLOR.RESET} Dev users are ready.\n`);
    console.log(`${COLOR.DIM}Admin login:${COLOR.RESET}`);
    console.log(`  Username: ${COLOR.CYAN}ryo${COLOR.RESET}`);
    console.log(`  Password: ${COLOR.CYAN}testtest${COLOR.RESET}\n`);
    process.exit(0);
  } else {
    console.log(
      `${COLOR.YELLOW}${COLOR.BOLD}Warning:${COLOR.RESET} Some users could not be created.\n`
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Seed script error:", error);
  process.exit(1);
});
