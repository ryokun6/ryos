/**
 * POST /api/auth/register
 *
 * Create a new user account with password (Node.js runtime for bcrypt)
 */

import {
  generateAuthToken,
  storeToken,
  isUserBanned,
  isLoginLocked,
  recordLoginFailure,
  resetLoginFailures,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../_utils/auth/index.js";
import {
  hashPassword,
  setUserPasswordHash,
  verifyPassword,
  getUserPasswordHash,
} from "../_utils/auth/_password.js";
import { isProfaneUsername, assertValidUsername } from "../_utils/_validation.js";
import { apiHandler } from "../_utils/api-handler.js";
// Use the shared trust-aware IP resolver so self-hosted deployments cannot
// bypass per-IP rate limits via spoofed X-Forwarded-For headers.
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  appendSetCookie,
  prependSetCookie,
  buildSetAuthCookie,
  buildSetDeviceCookie,
  createDeviceId,
  parseDeviceCookie,
} from "../_utils/_cookie.js";
import {
  consumeRegistrationAttempt,
  consumeRegistrationCreate,
  REGISTER_LIMIT_MESSAGE,
} from "../_utils/auth/_register-quota.js";
import { getHeader } from "../_utils/request-helpers.js";
import {
  getStoredUserRecord,
  normalizeUserTimeZone,
  setStoredUserRecord,
  updateStoredUserTimeZone,
} from "../_utils/auth/_user-record.js";
import { clearAIConversationTombstone } from "../ai/conversations/_helpers/store.js";
import { syncKosyncAuthKeyFromPlainPassword } from "../kosync/_helpers/_auth.js";

interface RegisterRequest {
  username: string;
  password: string;
}

export default apiHandler(
  { methods: ["POST"], auth: "none", parseJsonBody: true },
  async (ctx) => {
    const { req, res, redis } = ctx;
    const body = ctx.body as RegisterRequest | null;
    const { username: rawUsername, password } = body || {};

    // httpOnly device id. Browsers keep it; discarding it still hits the IP cap.
    const existingDeviceId = parseDeviceCookie(getHeader(req, "cookie"));
    const deviceId = existingDeviceId ?? createDeviceId();
    appendSetCookie(res, buildSetDeviceCookie(deviceId));

    const ip = getClientIp(req);
    const attempt = await consumeRegistrationAttempt(redis, ip);
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfter));
      res.status(429).json({ error: REGISTER_LIMIT_MESSAGE });
      return;
    }

    // Validate username
    if (!rawUsername || typeof rawUsername !== "string") {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    try {
      assertValidUsername(rawUsername, "register");
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Invalid username",
      });
      return;
    }

    if (isProfaneUsername(rawUsername)) {
      res.status(400).json({
        error: "Username contains inappropriate language",
      });
      return;
    }

    // Validate password
    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      res.status(400).json({
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      });
      return;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      res.status(400).json({
        error: `Password must be ${PASSWORD_MAX_LENGTH} characters or less`,
      });
      return;
    }

    const username = rawUsername.toLowerCase();

    // Check if user already exists
    const existingUser = await getStoredUserRecord(redis, username);
    if (existingUser) {
      // User exists - try to log them in with provided password. This path is
      // subject to the SAME per-username lockout as /api/auth/login so it
      // cannot be used to bypass login throttling for password guessing.
      if (await isLoginLocked(redis, username)) {
        res.status(429).json({
          error: "This account is temporarily locked. Please try again later.",
        });
        return;
      }

      try {
        const storedHash = await getUserPasswordHash(redis, username);
        if (storedHash) {
          const passwordValid = await verifyPassword(password, storedHash);
          if (passwordValid) {
            // Banned accounts cannot obtain a session. Checked only after the
            // password is verified to avoid disclosing ban status.
            if (isUserBanned(existingUser)) {
              res.status(403).json({ error: "This account has been banned." });
              return;
            }
            // Password matches - reset failures and log them in.
            await resetLoginFailures(redis, username);
            await updateStoredUserTimeZone(
              redis,
              username,
              getHeader(req, "x-user-timezone")
            );
            await syncKosyncAuthKeyFromPlainPassword(redis, username, password);
            const token = generateAuthToken();
            await storeToken(redis, username, token);
            prependSetCookie(res, buildSetAuthCookie(username, token));
            res.status(200).json({ user: { username } });
            return;
          }
          // Wrong password — count it toward the shared login lockout.
          await recordLoginFailure(redis, username);
        }
      } catch (loginError) {
        ctx.logger.error("Error attempting login for existing user", loginError);
      }
      // Password doesn't match or no password set
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const created = await consumeRegistrationCreate(redis, ip, deviceId);
    if (!created.allowed) {
      res.setHeader("Retry-After", String(created.retryAfter));
      res.status(429).json({ error: REGISTER_LIMIT_MESSAGE });
      return;
    }

    // Create user
    const now = Date.now();
    const requestTimeZone = normalizeUserTimeZone(getHeader(req, "x-user-timezone"));
    const userData = {
      username,
      createdAt: now,
      lastActive: now,
      ...(requestTimeZone
        ? { timeZone: requestTimeZone, timeZoneUpdatedAt: now }
        : {}),
    };
    await setStoredUserRecord(redis, username, userData);
    await clearAIConversationTombstone(redis, username);

    // Hash and store password
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(redis, username, passwordHash);
    await syncKosyncAuthKeyFromPlainPassword(redis, username, password);

    // Generate and store token
    const token = generateAuthToken();
    await storeToken(redis, username, token);

    prependSetCookie(res, buildSetAuthCookie(username, token));
    res.status(201).json({ user: { username } });
  }
);
