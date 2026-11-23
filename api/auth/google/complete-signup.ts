import { apiHandler } from "../../_utils/api-handler.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import { getHeader } from "../../_utils/request-helpers.js";
import {
  appendSetCookie,
  buildSetAuthCookie,
  buildSetDeviceCookie,
  createDeviceId,
  parseDeviceCookie,
  prependSetCookie,
} from "../../_utils/_cookie.js";
import {
  assertValidUsername,
  isProfaneUsername,
} from "../../_utils/_validation.js";
import {
  generateAuthToken,
  isUserBanned,
  storeToken,
} from "../../_utils/auth/index.js";
import {
  consumeRegistrationAttempt,
  consumeRegistrationCreate,
  REGISTER_LIMIT_MESSAGE,
} from "../../_utils/auth/_register-quota.js";
import {
  getStoredUserRecord,
  getUsernameByEmail,
  normalizeUserTimeZone,
  setStoredUserRecord,
  setUserEmailIndex,
} from "../../_utils/auth/_user-record.js";
import { clearAIConversationTombstone } from "../../ai/conversations/_helpers/store.js";
import {
  deletePendingGoogleSignup,
  getGoogleUsernameBySub,
  getLinkedGoogleAccountByUsername,
  getPendingGoogleSignup,
  isGoogleOAuthConfigured,
  saveLinkedGoogleAccount,
  toPublicGoogleAccount,
} from "../../_utils/google-oauth.js";
import type { GoogleCompleteSignupRequest } from "../../../src/shared/contracts/google.js";

export default apiHandler<GoogleCompleteSignupRequest>(
  {
    methods: ["POST"],
    auth: "none",
    parseJsonBody: true,
  },
  async ({ req, res, redis, logger, startTime, body }) => {
    if (!isGoogleOAuthConfigured()) {
      logger.response(503, Date.now() - startTime);
      res.status(503).json({
        error: "Google Sign-In is not configured on this server.",
      });
      return;
    }

    const existingDeviceId = parseDeviceCookie(getHeader(req, "cookie"));
    const deviceId = existingDeviceId ?? createDeviceId();
    appendSetCookie(res, buildSetDeviceCookie(deviceId));

    const ip = getClientIp(req);
    const attempt = await consumeRegistrationAttempt(redis, ip);
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfter));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: REGISTER_LIMIT_MESSAGE });
      return;
    }

    const pendingToken =
      typeof body?.pendingToken === "string" ? body.pendingToken.trim() : "";
    const rawUsername =
      typeof body?.username === "string" ? body.username.trim() : "";

    if (!pendingToken) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Google sign-up session is required" });
      return;
    }

    if (!rawUsername) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Username is required" });
      return;
    }

    try {
      assertValidUsername(rawUsername, "register");
    } catch (err) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: err instanceof Error ? err.message : "Invalid username",
      });
      return;
    }

    if (isProfaneUsername(rawUsername)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: "Username contains inappropriate language",
      });
      return;
    }

    const pending = await getPendingGoogleSignup(redis, pendingToken);
    if (!pending) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: "Google sign-up session expired. Please sign in with Google again.",
      });
      return;
    }

    // If this Google account was linked concurrently in another tab, sign into it.
    const alreadyLinkedUser = await getGoogleUsernameBySub(redis, pending.sub);
    if (alreadyLinkedUser) {
      const existingRecord = await getStoredUserRecord(redis, alreadyLinkedUser);
      if (existingRecord) {
        if (isUserBanned(existingRecord)) {
          await deletePendingGoogleSignup(redis, pendingToken);
          logger.response(403, Date.now() - startTime);
          res.status(403).json({ error: "This account has been banned." });
          return;
        }
        await deletePendingGoogleSignup(redis, pendingToken);
        const linkedGoogle = await getLinkedGoogleAccountByUsername(
          redis,
          alreadyLinkedUser
        );
        const sessionToken = generateAuthToken();
        await storeToken(redis, alreadyLinkedUser, sessionToken);
        prependSetCookie(
          res,
          buildSetAuthCookie(alreadyLinkedUser, sessionToken)
        );
        logger.response(200, Date.now() - startTime);
        res.status(200).json({
          user: { username: alreadyLinkedUser },
          account: linkedGoogle ? toPublicGoogleAccount(linkedGoogle) : null,
        });
        return;
      }
    }

    const username = rawUsername.toLowerCase();
    if (username === "ryo") {
      logger.response(409, Date.now() - startTime);
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const existingUser = await getStoredUserRecord(redis, username);
    if (existingUser) {
      // Keep pendingToken alive so the user can pick a different username.
      logger.response(409, Date.now() - startTime);
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const created = await consumeRegistrationCreate(redis, ip, deviceId);
    if (!created.allowed) {
      res.setHeader("Retry-After", String(created.retryAfter));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: REGISTER_LIMIT_MESSAGE });
      return;
    }

    await deletePendingGoogleSignup(redis, pendingToken);

    const now = Date.now();
    const requestTimeZone = normalizeUserTimeZone(
      getHeader(req, "x-user-timezone")
    );

    let canClaimVerifiedEmail = false;
    if (pending.email && pending.emailVerified) {
      const emailOwner = await getUsernameByEmail(redis, pending.email);
      canClaimVerifiedEmail = !emailOwner;
    }

    await setStoredUserRecord(redis, username, {
      username,
      createdAt: now,
      lastActive: now,
      ...(requestTimeZone
        ? { timeZone: requestTimeZone, timeZoneUpdatedAt: now }
        : {}),
      ...(canClaimVerifiedEmail && pending.email
        ? {
            email: pending.email,
            emailVerified: true,
            emailUpdatedAt: now,
          }
        : {}),
    });

    if (canClaimVerifiedEmail && pending.email) {
      await setUserEmailIndex(redis, pending.email, username);
    }

    await clearAIConversationTombstone(redis, username);

    const savedGoogle = await saveLinkedGoogleAccount(redis, {
      username,
      sub: pending.sub,
      email: pending.email,
      emailVerified: pending.emailVerified,
      name: pending.name,
      picture: pending.picture,
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      expiresAt: pending.expiresAt,
      scopes: pending.scopes,
      linkedAt: now,
      updatedAt: now,
      calendarSyncToken: null,
      calendarLastSyncedAt: null,
      contactsSyncToken: null,
      contactsLastSyncedAt: null,
    });

    const token = generateAuthToken();
    await storeToken(redis, username, token);
    prependSetCookie(res, buildSetAuthCookie(username, token));

    logger.response(201, Date.now() - startTime);
    res.status(201).json({
      user: { username },
      account: toPublicGoogleAccount(savedGoogle),
    });
  }
);
