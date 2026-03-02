/**
 * Token handlers for chat-rooms API
 */

import { Redis } from "@upstash/redis";
import { CHAT_USERS_PREFIX } from "./_constants.js";
import { logInfo, logError } from "../../_utils/_logging.js";
import { isProfaneUsername } from "../../_utils/_validation.js";
import {
  generateAuthToken,
  storeToken,
  storeLastValidToken,
  deleteToken,
  deleteAllUserTokens,
  getUserTokens,
  validateAuth,
  extractAuth,
  verifyPassword,
  hashPassword,
  getUserPasswordHash,
  setUserPasswordHash,
  TOKEN_GRACE_PERIOD,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import { createErrorResponse } from "./_helpers.js";
import type {
  GenerateTokenData,
  RefreshTokenData,
  AuthenticateWithPasswordData,
  SetPasswordData,
} from "./_types.js";

// Create Redis client
function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle generate token request
 */
export async function handleGenerateToken(
  data: GenerateTokenData,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  const { username: originalUsername, force = false } = data;

  if (!originalUsername) {
    logInfo(requestId, "Token generation failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  const username = originalUsername.toLowerCase();

  logInfo(
    requestId,
    `Generating token for user: ${username}${force ? " (force mode)" : ""}`
  );
  try {
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    const authToken = generateAuthToken();
    await storeToken(redis, username, authToken);

    logInfo(requestId, `Token generated successfully for user ${username}`);

    return new Response(JSON.stringify({ token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error generating token for user ${username}:`, error);
    return createErrorResponse("Failed to generate token", 500);
  }
}

/**
 * Handle refresh token request
 */
export async function handleRefreshToken(
  data: RefreshTokenData,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  const { username: originalUsername, oldToken } = data;

  if (!originalUsername || !oldToken) {
    logInfo(
      requestId,
      "Token refresh failed: Username and oldToken are required"
    );
    return createErrorResponse("Username and oldToken are required", 400);
  }

  const username = originalUsername.toLowerCase();

  logInfo(requestId, `Refreshing token for user: ${username}`);
  try {
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    const validationResult = await validateAuth(
      redis,
      username,
      oldToken,
      { allowExpired: true }
    );

    if (!validationResult.valid) {
      logInfo(requestId, `Invalid old token provided for user: ${username}`);
      return createErrorResponse("Invalid authentication token", 401);
    }

    await storeLastValidToken(
      redis,
      username,
      oldToken,
      Date.now(),
      TOKEN_GRACE_PERIOD
    );
    logInfo(
      requestId,
      `Stored old token for future grace period use for user: ${username}`
    );

    await deleteToken(redis, oldToken);

    const authToken = generateAuthToken();
    await storeToken(redis, username, authToken);

    logInfo(
      requestId,
      `Token refreshed successfully for user ${username} (was ${
        validationResult.expired ? "expired" : "valid"
      })`
    );

    return new Response(JSON.stringify({ token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error refreshing token for user ${username}:`, error);
    return createErrorResponse("Failed to refresh token", 500);
  }
}

/**
 * Handle verify token request
 * Requires username in X-Username header for O(1) lookup
 */
export async function handleVerifyToken(
  request: Request,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  try {
    const { token: authToken, username } = extractAuth(request);

    if (!authToken) {
      logInfo(
        requestId,
        "Token verification failed: Missing Authorization header"
      );
      return createErrorResponse("Authorization token required", 401);
    }

    if (!username) {
      logInfo(
        requestId,
        "Token verification failed: Missing X-Username header"
      );
      return createErrorResponse("X-Username header required", 400);
    }

    if (isProfaneUsername(username)) {
      logInfo(
        requestId,
        `Token verification blocked for profane username: ${username}`
      );
      return createErrorResponse("Invalid authentication token", 401);
    }

    // Direct O(1) lookup using validateAuth
    const validationResult = await validateAuth(
      redis,
      username,
      authToken,
      { allowExpired: true } // allow expired tokens within grace period
    );

    if (!validationResult.valid) {
      return createErrorResponse("Invalid authentication token", 401);
    }

    if (validationResult.expired) {
      return new Response(
        JSON.stringify({
          valid: true,
          username,
          expired: true,
          message: "Token is within grace period",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true, username, message: "Token is valid" }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    logError(requestId, `Error verifying token:`, error);
    return createErrorResponse("Failed to verify token", 500);
  }
}

/**
 * Handle authenticate with password request
 */
export async function handleAuthenticateWithPassword(
  data: AuthenticateWithPasswordData,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  const { username: originalUsername, password, oldToken } = data;

  if (!originalUsername || !password) {
    logInfo(requestId, "Auth failed: Username and password are required");
    return createErrorResponse("Username and password are required", 400);
  }

  // Validate password length to prevent DoS via bcrypt with very long passwords
  if (password.length > PASSWORD_MAX_LENGTH) {
    logInfo(
      requestId,
      `Auth failed: Password too long: ${password.length} chars (max: ${PASSWORD_MAX_LENGTH})`
    );
    return createErrorResponse("Invalid username or password", 401);
  }

  const username = originalUsername.toLowerCase();

  if (isProfaneUsername(username)) {
    logInfo(
      requestId,
      `Password auth blocked for profane username: ${username}`
    );
    return createErrorResponse("Invalid username or password", 401);
  }

  logInfo(requestId, `Authenticating user with password: ${username}`);
  try {
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("Invalid username or password", 401);
    }

    const passwordHash = await getUserPasswordHash(redis, username);

    if (!passwordHash) {
      logInfo(requestId, `No password set for user: ${username}`);
      return createErrorResponse("Invalid username or password", 401);
    }

    const isValid = await verifyPassword(password, passwordHash);

    if (!isValid) {
      logInfo(requestId, `Invalid password for user: ${username}`);
      return createErrorResponse("Invalid username or password", 401);
    }

    if (oldToken) {
      await deleteToken(redis, oldToken);
      await storeLastValidToken(
        redis,
        username,
        oldToken,
        Date.now(),
        TOKEN_GRACE_PERIOD
      );
    }

    const authToken = generateAuthToken();
    await storeToken(redis, username, authToken);

    logInfo(
      requestId,
      `Password authentication successful for user ${username}`
    );

    return new Response(JSON.stringify({ token: authToken, username }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error authenticating user ${username}:`, error);
    return createErrorResponse("Failed to authenticate", 500);
  }
}

/**
 * Handle set password request
 */
export async function handleSetPassword(
  data: SetPasswordData,
  username: string | null,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  const { password } = data;

  if (!password) {
    logInfo(requestId, "Set password failed: Password is required");
    return createErrorResponse("Password is required", 400);
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    logInfo(
      requestId,
      `Set password failed: Password too short: ${password.length} chars (min: ${PASSWORD_MIN_LENGTH})`
    );
    return createErrorResponse(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      400
    );
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    logInfo(
      requestId,
      `Set password failed: Password too long: ${password.length} chars (max: ${PASSWORD_MAX_LENGTH})`
    );
    return createErrorResponse(
      `Password must be ${PASSWORD_MAX_LENGTH} characters or less`,
      400
    );
  }

  logInfo(requestId, `Setting password for user: ${username}`);
  try {
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(redis, username!, passwordHash);

    logInfo(requestId, `Password set successfully for user ${username}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error setting password for user ${username}:`, error);
    return createErrorResponse("Failed to set password", 500);
  }
}

/**
 * Handle check password request
 */
export async function handleCheckPassword(
  username: string | null,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  logInfo(requestId, `Checking if password is set for user: ${username}`);

  try {
    const passwordHash = await getUserPasswordHash(redis, username!);
    const hasPassword = !!passwordHash;

    return new Response(
      JSON.stringify({
        hasPassword,
        username: username,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, `Error checking password for user ${username}:`, error);
    return createErrorResponse("Failed to check password status", 500);
  }
}

/**
 * Handle list tokens request
 */
export async function handleListTokens(
  username: string | null,
  request: Request,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  logInfo(requestId, `Listing active tokens for user: ${username}`);

  try {
    const tokens = await getUserTokens(redis, username!);
    const { token: currentToken } = extractAuth(request);

    const tokenList = tokens.map((t) => ({
      ...t,
      isCurrent: t.token === currentToken,
      maskedToken: `...${t.token.slice(-8)}`,
    }));

    logInfo(
      requestId,
      `Found ${tokenList.length} active tokens for user ${username}`
    );

    return new Response(
      JSON.stringify({
        tokens: tokenList,
        count: tokenList.length,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, `Error listing tokens for user ${username}:`, error);
    return createErrorResponse("Failed to list tokens", 500);
  }
}

/**
 * Handle logout all devices request
 */
export async function handleLogoutAllDevices(
  username: string | null,
  request: Request,
  requestId: string
): Promise<Response> {
  logInfo(requestId, `Logging out all devices for user: ${username}`);

  try {
    const deletedCount = await deleteAllUserTokens(username!);

    logInfo(requestId, `Deleted ${deletedCount} tokens for user ${username}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Logged out from ${deletedCount} devices`,
        deletedCount,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(
      requestId,
      `Error logging out all devices for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to logout all devices", 500);
  }
}

/**
 * Handle logout current session request
 */
export async function handleLogoutCurrent(
  username: string | null,
  token: string | null,
  requestId: string
): Promise<Response> {
  const redis = getRedis();
  logInfo(requestId, `Logging out current session for user: ${username}`);

  try {
    await deleteToken(redis, token!);

    logInfo(requestId, `Current session logged out for user: ${username}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Logged out from current session`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(
      requestId,
      `Error logging out current session for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to logout current session", 500);
  }
}
