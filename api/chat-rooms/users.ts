/**
 * User handlers for chat-rooms API
 */

import {
  redis,
  getUser,
  setUser,
  createUserIfNotExists,
  getCurrentTimestamp,
} from "./_redis.js";
import { CHAT_USERS_PREFIX } from "./_constants.js";
import { logInfo, logError } from "../utils/logging.js";
import {
  isProfaneUsername,
  assertValidUsername,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  USERNAME_REGEX,
} from "../utils/validation.js";
import {
  hashPassword,
  verifyPassword,
  setUserPasswordHash,
  getUserPasswordHash,
  generateAuthToken,
  storeToken,
  storeLastValidToken,
  USER_EXPIRATION_TIME,
  TOKEN_GRACE_PERIOD,
  PASSWORD_MIN_LENGTH,
} from "../utils/auth.js";
import type { User, CreateUserData, UserResponse } from "./_types.js";
import { createErrorResponse } from "./_helpers.js";

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
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

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
 * Handle create user request
 */
export async function handleCreateUser(
  data: CreateUserData,
  requestId: string
): Promise<Response> {
  const { username: originalUsername, password } = data;

  if (!originalUsername) {
    logInfo(requestId, "User creation failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  // Check for profanity in username
  if (isProfaneUsername(originalUsername)) {
    logInfo(
      requestId,
      `User creation failed: Username contains inappropriate language: ${originalUsername}`
    );
    return createErrorResponse("Username contains inappropriate language", 400);
  }

  // Check username length
  if (originalUsername.length > MAX_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User creation failed: Username too long: ${originalUsername.length} chars (max: ${MAX_USERNAME_LENGTH})`
    );
    return createErrorResponse(
      `Username must be ${MAX_USERNAME_LENGTH} characters or less`,
      400
    );
  }

  // Check minimum username length
  if (originalUsername.length < MIN_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User creation failed: Username too short: ${originalUsername.length} chars (min: ${MIN_USERNAME_LENGTH})`
    );
    return createErrorResponse(
      `Username must be at least ${MIN_USERNAME_LENGTH} characters`,
      400
    );
  }

  // Require password for new user creation and validate length
  if (!password) {
    logInfo(requestId, "User creation failed: Password is required");
    return createErrorResponse("Password is required", 400);
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    logInfo(
      requestId,
      `User creation failed: Password too short: ${password.length} chars (min: ${PASSWORD_MIN_LENGTH})`
    );
    return createErrorResponse(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      400
    );
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  // Validate username format strictly
  try {
    assertValidUsername(username, requestId);
  } catch (e) {
    return createErrorResponse(
      e instanceof Error ? e.message : "Invalid username",
      400
    );
  }

  logInfo(requestId, `Creating user: ${username} with password`);
  try {
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const user: User = {
      username,
      lastActive: getCurrentTimestamp(),
    };

    const created = await createUserIfNotExists(username, user);

    if (!created) {
      // User already exists - attempt login if password provided
      if (password) {
        logInfo(
          requestId,
          `Username ${username} exists, attempting authentication with provided password`
        );

        try {
          const passwordHash = await getUserPasswordHash(username);

          if (passwordHash) {
            const isValid = await verifyPassword(password, passwordHash);

            if (isValid) {
              logInfo(
                requestId,
                `Password correct for existing user ${username}, logging in`
              );

              const authToken = generateAuthToken();
              await storeToken(username, authToken);
              await storeLastValidToken(
                username,
                authToken,
                Date.now() + USER_EXPIRATION_TIME * 1000,
                USER_EXPIRATION_TIME + TOKEN_GRACE_PERIOD
              );

              const existingUserData = await getUser(username);
              const existingUser = existingUserData || {
                username,
                lastActive: getCurrentTimestamp(),
              };

              logInfo(
                requestId,
                `User ${username} authenticated via signup form with correct password`
              );

              return new Response(
                JSON.stringify({ user: existingUser, token: authToken }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
          }

          logInfo(
            requestId,
            `Authentication failed for existing user ${username} - incorrect password`
          );
        } catch (authError) {
          logError(
            requestId,
            `Error during authentication attempt for ${username}:`,
            authError
          );
        }
      }

      logInfo(requestId, `Username already taken: ${username}`);
      return createErrorResponse("Username already taken", 409);
    }

    // Hash and store password
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(username, passwordHash);
    logInfo(requestId, `Password hash stored for user: ${username}`);

    // Generate authentication token
    const authToken = generateAuthToken();
    await storeToken(username, authToken);

    await storeLastValidToken(
      username,
      authToken,
      Date.now() + USER_EXPIRATION_TIME * 1000,
      USER_EXPIRATION_TIME + TOKEN_GRACE_PERIOD
    );

    logInfo(requestId, `User created with auth token: ${username}`);

    return new Response(JSON.stringify({ user, token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error creating user ${username}:`, error);
    return createErrorResponse("Failed to create user", 500);
  }
}

/**
 * Handle get users request (search)
 */
export async function handleGetUsers(
  requestId: string,
  searchQuery: string = ""
): Promise<Response> {
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


