/**
 * Token handlers for chat-rooms API
 */

import { redis, getUser, setUser, getCurrentTimestamp } from "./redis.js";
import { CHAT_USERS_PREFIX, USER_EXPIRATION_TIME } from "./constants.js";
import { logInfo, logError } from "../utils/logging.js";
import { isProfaneUsername } from "../utils/validation.js";
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
  AUTH_TOKEN_PREFIX,
  USER_TTL_SECONDS,
  TOKEN_GRACE_PERIOD,
  PASSWORD_MIN_LENGTH,
} from "../utils/auth.js";
import { createErrorResponse } from "./helpers.js";
import type {
  GenerateTokenData,
  RefreshTokenData,
  AuthenticateWithPasswordData,
  SetPasswordData,
} from "./types.js";

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
    await storeToken(username, authToken);

    await storeLastValidToken(
      username,
      authToken,
      Date.now() + USER_EXPIRATION_TIME * 1000,
      USER_EXPIRATION_TIME + TOKEN_GRACE_PERIOD
    );

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
      username,
      oldToken,
      requestId,
      true
    );

    if (!validationResult.valid) {
      logInfo(requestId, `Invalid old token provided for user: ${username}`);
      return createErrorResponse("Invalid authentication token", 401);
    }

    await storeLastValidToken(
      username,
      oldToken,
      Date.now(),
      TOKEN_GRACE_PERIOD
    );
    logInfo(
      requestId,
      `Stored old token for future grace period use for user: ${username}`
    );

    await deleteToken(oldToken);

    const authToken = generateAuthToken();
    await storeToken(username, authToken);

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
 */
export async function handleVerifyToken(
  request: Request,
  requestId: string
): Promise<Response> {
  try {
    const { token: authToken } = extractAuth(request);
    if (!authToken) {
      logInfo(
        requestId,
        "Token verification failed: Missing Authorization header"
      );
      return createErrorResponse("Authorization token required", 401);
    }

    // Check new scheme: chat:token:user:{username}:{token}
    const pattern = `${AUTH_TOKEN_PREFIX}user:*:${authToken}`;
    let cursor = 0;
    let foundKey: string | null = null;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      if (keys.length > 0) {
        foundKey = keys[0];
        break;
      }
    } while (cursor !== 0);

    if (foundKey) {
      const parts = foundKey.split(":");
      const username = parts[3];
      if (isProfaneUsername(username)) {
        logInfo(
          requestId,
          `Token verification blocked for profane username: ${username}`
        );
        return createErrorResponse("Invalid authentication token", 401);
      }
      await redis.expire(foundKey, USER_TTL_SECONDS);
      return new Response(
        JSON.stringify({ valid: true, username, message: "Token is valid" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Grace-period path: scan last token records
    const lastPattern = `${AUTH_TOKEN_PREFIX}last:*`;
    cursor = 0;
    let graceUsername: string | null = null;
    let expiredAt = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: lastPattern,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      if (keys.length) {
        const values = await Promise.all(
          keys.map((k) => redis.get<string>(k))
        );
        for (let i = 0; i < keys.length; i++) {
          const raw = values[i];
          if (!raw) continue;
          try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (parsed?.token === authToken) {
              const exp = Number(parsed.expiredAt) || 0;
              if (Date.now() < exp + TOKEN_GRACE_PERIOD * 1000) {
                const keyParts = keys[i].split(":");
                graceUsername = keyParts[keyParts.length - 1];
                expiredAt = exp;
                break;
              }
            }
          } catch {
            // ignore
          }
        }
        if (graceUsername) break;
      }
    } while (cursor !== 0);

    if (graceUsername) {
      if (isProfaneUsername(graceUsername)) {
        logInfo(
          requestId,
          `Grace token verification blocked for profane username: ${graceUsername}`
        );
        return createErrorResponse("Invalid authentication token", 401);
      }
      return new Response(
        JSON.stringify({
          valid: true,
          username: graceUsername,
          expired: true,
          message: "Token is within grace period",
          expiredAt,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return createErrorResponse("Invalid authentication token", 401);
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
  const { username: originalUsername, password, oldToken } = data;

  if (!originalUsername || !password) {
    logInfo(requestId, "Auth failed: Username and password are required");
    return createErrorResponse("Username and password are required", 400);
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

    const passwordHash = await getUserPasswordHash(username);

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
      await deleteToken(oldToken);
      await storeLastValidToken(
        username,
        oldToken,
        Date.now(),
        TOKEN_GRACE_PERIOD
      );
    }

    const authToken = generateAuthToken();
    await storeToken(username, authToken);

    await storeLastValidToken(
      username,
      authToken,
      Date.now() + USER_EXPIRATION_TIME * 1000,
      USER_EXPIRATION_TIME + TOKEN_GRACE_PERIOD
    );

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

  logInfo(requestId, `Setting password for user: ${username}`);
  try {
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(username!, passwordHash);

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
  logInfo(requestId, `Checking if password is set for user: ${username}`);

  try {
    const passwordHash = await getUserPasswordHash(username!);
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
  logInfo(requestId, `Listing active tokens for user: ${username}`);

  try {
    const tokens = await getUserTokens(username!);
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
  logInfo(requestId, `Logging out current session for user: ${username}`);

  try {
    await deleteToken(token!);

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

