import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import {
  buildSetAuthCookie,
  prependSetCookie,
} from "../../_utils/_cookie.js";
import {
  generateAuthToken,
  isUserBanned,
  storeToken,
} from "../../_utils/auth/index.js";
import {
  getStoredUserRecord,
  getUsernameByEmail,
  normalizeEmail,
  setStoredUserRecord,
  setUserEmailIndex,
} from "../../_utils/auth/_user-record.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import {
  GoogleApiError,
  consumeGoogleOAuthState,
  createPendingGoogleSignup,
  exchangeGoogleCodeForTokens,
  extractPendingProfile,
  fetchGoogleUserInfo,
  getGoogleOAuthConfig,
  getGoogleUsernameBySub,
  getLinkedGoogleAccountByUsername,
  normalizeScopeList,
  renderGoogleOAuthCallbackHtml,
  saveLinkedGoogleAccount,
  suggestAvailableGoogleUsername,
  toPublicGoogleAccount,
} from "../../_utils/google-oauth.js";
import type { GoogleOAuthPostMessage } from "../../../src/shared/contracts/google.js";

const CALLBACK_RL_LIMIT = 40;
const CALLBACK_RL_WINDOW_SECONDS = 10 * 60;

function sendCallbackHtml(
  res: Parameters<Parameters<typeof apiHandler>[1]>[0]["res"],
  status: number,
  options: Parameters<typeof renderGoogleOAuthCallbackHtml>[0]
): void {
  const { html, csp } = renderGoogleOAuthCallbackHtml(options);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Security-Policy", csp);
  res.status(status).send(html);
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "optional",
    allowExpiredAuth: false,
    allowMissingOrigin: true,
    acceptOrigin: () => true,
    contentType: "text/html; charset=utf-8",
  },
  async ({ req, res, redis, logger, startTime, user }) => {
    const ip = RateLimit.getClientIp(req);
    try {
      const rl = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey([
          "rl",
          "auth",
          "google",
          "callback",
          "ip",
          ip,
        ]),
        windowSeconds: CALLBACK_RL_WINDOW_SECONDS,
        limit: CALLBACK_RL_LIMIT,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        sendCallbackHtml(res, 429, {
          message: null,
          clientOrigin: null,
          fallbackErrorText:
            "Too many Google sign-in attempts. Please wait and try again.",
        });
        return;
      }
    } catch (rlErr) {
      logger.warn("Google callback rate limit check failed", rlErr);
    }

    const requestUrl = new URL(req.url || "/", "http://localhost");
    const state = requestUrl.searchParams.get("state") || "";
    const code = requestUrl.searchParams.get("code") || "";
    const oauthError = requestUrl.searchParams.get("error") || "";

    const stateRecord = await consumeGoogleOAuthState(redis, state);
    if (!stateRecord) {
      logger.response(400, Date.now() - startTime);
      sendCallbackHtml(res, 400, {
        message: null,
        clientOrigin: null,
        fallbackErrorText:
          "This Google sign-in session expired or was already used. Please try again.",
      });
      return;
    }

    const reply = (status: number, message: GoogleOAuthPostMessage) => {
      logger.response(status, Date.now() - startTime);
      sendCallbackHtml(res, status, {
        message,
        clientOrigin: stateRecord.clientOrigin,
        returnMode: stateRecord.returnMode,
      });
    };

    if (oauthError) {
      const friendly =
        oauthError === "access_denied"
          ? "Google sign-in was cancelled."
          : `Google sign-in failed (${oauthError}).`;
      reply(200, {
        type: "ryos:google-oauth-result",
        status: "error",
        error: friendly,
      });
      return;
    }

    if (!code) {
      reply(400, {
        type: "ryos:google-oauth-result",
        status: "error",
        error: "Missing authorization code from Google.",
      });
      return;
    }

    const config = getGoogleOAuthConfig(stateRecord.clientOrigin);
    if (!config) {
      reply(503, {
        type: "ryos:google-oauth-result",
        status: "error",
        error: "Google Sign-In is not configured on this server.",
      });
      return;
    }

    if (
      (stateRecord.mode === "link" || stateRecord.mode === "scopes") &&
      (!stateRecord.username ||
        (user?.username &&
          user.username.toLowerCase() !== stateRecord.username))
    ) {
      reply(403, {
        type: "ryos:google-oauth-result",
        status: "error",
        error:
          "Your ryOS session changed during Google linking. Please try again.",
      });
      return;
    }

    try {
      const tokenData = await exchangeGoogleCodeForTokens({
        code,
        codeVerifier: stateRecord.codeVerifier,
        redirectUri: stateRecord.redirectUri,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      });

      const userInfo = await fetchGoogleUserInfo(tokenData.access_token);
      const grantedScopes = normalizeScopeList([
        ...stateRecord.scopes,
        ...(tokenData.scope ? [tokenData.scope] : []),
      ]);
      const expiresAt =
        typeof tokenData.expires_in === "number" && tokenData.expires_in > 0
          ? Date.now() + tokenData.expires_in * 1000
          : null;
      const now = Date.now();

      if (stateRecord.mode === "link" || stateRecord.mode === "scopes") {
        const targetUsername = stateRecord.username!;
        const targetUserRecord = await getStoredUserRecord(
          redis,
          targetUsername
        );
        if (!targetUserRecord) {
          reply(404, {
            type: "ryos:google-oauth-result",
            status: "error",
            error: "Account not found.",
          });
          return;
        }
        if (isUserBanned(targetUserRecord)) {
          reply(403, {
            type: "ryos:google-oauth-result",
            status: "error",
            error: "This account has been banned.",
          });
          return;
        }

        const existingSubOwner = await getGoogleUsernameBySub(
          redis,
          userInfo.sub
        );
        if (existingSubOwner && existingSubOwner !== targetUsername) {
          reply(409, {
            type: "ryos:google-oauth-result",
            status: "error",
            error:
              "This Google account is already linked to another ryOS account.",
          });
          return;
        }

        const existingUserGoogle = await getLinkedGoogleAccountByUsername(
          redis,
          targetUsername
        );
        if (
          stateRecord.mode === "scopes" &&
          existingUserGoogle &&
          existingUserGoogle.sub !== userInfo.sub
        ) {
          reply(409, {
            type: "ryos:google-oauth-result",
            status: "error",
            error: existingUserGoogle.email
              ? `Please choose the linked Google account (${existingUserGoogle.email}), or disconnect it first.`
              : "Please choose the Google account already linked to your ryOS account.",
          });
          return;
        }

        const mergedScopes = existingUserGoogle
          ? normalizeScopeList([...existingUserGoogle.scopes, ...grantedScopes])
          : grantedScopes;
        const saved = await saveLinkedGoogleAccount(redis, {
          username: targetUsername,
          sub: userInfo.sub,
          email: userInfo.email,
          emailVerified: userInfo.emailVerified,
          name: userInfo.name,
          picture: userInfo.picture,
          accessToken: tokenData.access_token,
          refreshToken:
            tokenData.refresh_token || existingUserGoogle?.refreshToken || null,
          expiresAt,
          scopes: mergedScopes,
          linkedAt: existingUserGoogle?.linkedAt || now,
          updatedAt: now,
          calendarSyncToken: existingUserGoogle?.calendarSyncToken ?? null,
          calendarLastSyncedAt:
            existingUserGoogle?.calendarLastSyncedAt ?? null,
          contactsSyncToken: existingUserGoogle?.contactsSyncToken ?? null,
          contactsLastSyncedAt:
            existingUserGoogle?.contactsLastSyncedAt ?? null,
        });

        // Auto-populate verified recovery email if the user had none set yet.
        if (
          userInfo.email &&
          userInfo.emailVerified &&
          !targetUserRecord.email
        ) {
          const emailOwner = await getUsernameByEmail(redis, userInfo.email);
          if (!emailOwner) {
            await setStoredUserRecord(redis, targetUsername, {
              ...targetUserRecord,
              email: userInfo.email,
              emailVerified: true,
              emailUpdatedAt: now,
            });
            await setUserEmailIndex(redis, userInfo.email, targetUsername);
          }
        }

        reply(200, {
          type: "ryos:google-oauth-result",
          status: stateRecord.mode === "link" ? "linked" : "scopes_granted",
          username: targetUsername,
          account: toPublicGoogleAccount(saved),
        });
        return;
      }

      // mode === "signin"
      // 1. Check existing Google sub -> ryOS username mapping.
      const linkedUsername = await getGoogleUsernameBySub(redis, userInfo.sub);
      if (linkedUsername) {
        const linkedRecord = await getStoredUserRecord(redis, linkedUsername);
        if (!linkedRecord) {
          await redis.del(redisKeys.integration.googleUsernameBySub(userInfo.sub));
        } else {
          if (isUserBanned(linkedRecord)) {
            reply(403, {
              type: "ryos:google-oauth-result",
              status: "error",
              error: "This account has been banned.",
            });
            return;
          }

          const existingGoogle = await getLinkedGoogleAccountByUsername(
            redis,
            linkedUsername
          );
          const mergedScopes = existingGoogle
            ? normalizeScopeList([...existingGoogle.scopes, ...grantedScopes])
            : grantedScopes;
          const saved = await saveLinkedGoogleAccount(redis, {
            username: linkedUsername,
            sub: userInfo.sub,
            email: userInfo.email,
            emailVerified: userInfo.emailVerified,
            name: userInfo.name,
            picture: userInfo.picture,
            accessToken: tokenData.access_token,
            refreshToken:
              tokenData.refresh_token || existingGoogle?.refreshToken || null,
            expiresAt,
            scopes: mergedScopes,
            linkedAt: existingGoogle?.linkedAt || now,
            updatedAt: now,
            calendarSyncToken: existingGoogle?.calendarSyncToken ?? null,
            calendarLastSyncedAt: existingGoogle?.calendarLastSyncedAt ?? null,
            contactsSyncToken: existingGoogle?.contactsSyncToken ?? null,
            contactsLastSyncedAt: existingGoogle?.contactsLastSyncedAt ?? null,
          });

          await setStoredUserRecord(redis, linkedUsername, {
            ...linkedRecord,
            lastActive: now,
          });

          const sessionToken = generateAuthToken();
          await storeToken(redis, linkedUsername, sessionToken);
          prependSetCookie(res, buildSetAuthCookie(linkedUsername, sessionToken));

          reply(200, {
            type: "ryos:google-oauth-result",
            status: "authenticated",
            username: linkedUsername,
            account: toPublicGoogleAccount(saved),
          });
          return;
        }
      }

      // 2. Auto-link when Google's verified email matches an existing ryOS account's verified recovery email.
      if (userInfo.email && userInfo.emailVerified) {
        const matchedUsername = await getUsernameByEmail(redis, userInfo.email);
        if (matchedUsername) {
          const matchedUser = await getStoredUserRecord(redis, matchedUsername);
          if (
            matchedUser &&
            matchedUser.emailVerified &&
            normalizeEmail(matchedUser.email) === normalizeEmail(userInfo.email)
          ) {
            if (isUserBanned(matchedUser)) {
              reply(403, {
                type: "ryos:google-oauth-result",
                status: "error",
                error: "This account has been banned.",
              });
              return;
            }

            const existingGoogleOnMatched =
              await getLinkedGoogleAccountByUsername(redis, matchedUsername);
            if (
              !existingGoogleOnMatched ||
              existingGoogleOnMatched.sub === userInfo.sub
            ) {
              const saved = await saveLinkedGoogleAccount(redis, {
                username: matchedUsername,
                sub: userInfo.sub,
                email: userInfo.email,
                emailVerified: true,
                name: userInfo.name,
                picture: userInfo.picture,
                accessToken: tokenData.access_token,
                refreshToken:
                  tokenData.refresh_token ||
                  existingGoogleOnMatched?.refreshToken ||
                  null,
                expiresAt,
                scopes: existingGoogleOnMatched
                  ? normalizeScopeList([
                      ...existingGoogleOnMatched.scopes,
                      ...grantedScopes,
                    ])
                  : grantedScopes,
                linkedAt: existingGoogleOnMatched?.linkedAt || now,
                updatedAt: now,
                calendarSyncToken:
                  existingGoogleOnMatched?.calendarSyncToken ?? null,
                calendarLastSyncedAt:
                  existingGoogleOnMatched?.calendarLastSyncedAt ?? null,
                contactsSyncToken:
                  existingGoogleOnMatched?.contactsSyncToken ?? null,
                contactsLastSyncedAt:
                  existingGoogleOnMatched?.contactsLastSyncedAt ?? null,
              });

              await setStoredUserRecord(redis, matchedUsername, {
                ...matchedUser,
                lastActive: now,
              });

              const sessionToken = generateAuthToken();
              await storeToken(redis, matchedUsername, sessionToken);
              prependSetCookie(
                res,
                buildSetAuthCookie(matchedUsername, sessionToken)
              );

              reply(200, {
                type: "ryos:google-oauth-result",
                status: "authenticated",
                username: matchedUsername,
                autoLinked: true,
                account: toPublicGoogleAccount(saved),
              });
              return;
            }
          }
        }
      }

      // 3. Brand-new Google user -> issue short-lived pending signup token for username confirmation step.
      const suggestedUsername = await suggestAvailableGoogleUsername(redis, {
        email: userInfo.email,
        name: userInfo.name,
      });
      const pendingToken = await createPendingGoogleSignup(redis, {
        sub: userInfo.sub,
        email: userInfo.email,
        emailVerified: userInfo.emailVerified,
        name: userInfo.name,
        picture: userInfo.picture,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt,
        scopes: grantedScopes,
        suggestedUsername,
      });

      reply(200, {
        type: "ryos:google-oauth-result",
        status: "needs_username",
        pendingToken,
        suggestedUsername,
        profile: extractPendingProfile(userInfo),
      });
    } catch (error) {
      logger.error("Google OAuth callback failed", error);
      const message =
        error instanceof GoogleApiError
          ? error.message
          : "Google authentication failed. Please try again.";
      reply(400, {
        type: "ryos:google-oauth-result",
        status: "error",
        error: message,
      });
    }
  }
);
