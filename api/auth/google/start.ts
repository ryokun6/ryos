import { z } from "zod";
import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { getAppPublicOrigin } from "../../_utils/runtime-config.js";
import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  getGoogleOAuthConfig,
  getLinkedGoogleAccountByUsername,
  hasGoogleScope,
  scopesForFeatures,
} from "../../_utils/google-oauth.js";
import type { GoogleSyncFeature } from "../../../src/shared/contracts/google.js";

const startBodySchema = z.object({
  mode: z.enum(["signin", "link", "scopes"]),
  features: z.array(z.enum(["calendar", "contacts"])).optional(),
  returnMode: z.enum(["popup", "redirect"]).optional(),
});

const START_RL_LIMIT = 30;
const START_RL_WINDOW_SECONDS = 10 * 60;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "optional",
    allowExpiredAuth: false,
    bodySchema: startBodySchema,
  },
  async ({ req, res, redis, logger, startTime, origin, user, body }) => {
    const config = getGoogleOAuthConfig(origin);
    if (!config) {
      logger.response(503, Date.now() - startTime);
      res.status(503).json({
        error: "Google Sign-In is not configured on this server.",
      });
      return;
    }

    const ip = RateLimit.getClientIp(req);
    try {
      const rl = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "auth", "google", "start", "ip", ip]),
        windowSeconds: START_RL_WINDOW_SECONDS,
        limit: START_RL_LIMIT,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "Too many Google sign-in attempts. Please try again later.",
        });
        return;
      }
    } catch (rlErr) {
      logger.warn("Google start rate limit check failed", rlErr);
    }

    const mode = body?.mode || "signin";
    const features: GoogleSyncFeature[] = body?.features || [];
    const returnMode = body?.returnMode || "popup";

    if ((mode === "link" || mode === "scopes") && !user?.username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (mode === "scopes" && features.length === 0) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "At least one sync feature is required" });
      return;
    }

    const scopes =
      mode === "scopes" ? scopesForFeatures(features) : scopesForFeatures([]);

    let forceOfflineConsent = false;
    let loginHint: string | null = null;
    if (mode === "scopes" && user?.username) {
      const existing = await getLinkedGoogleAccountByUsername(
        redis,
        user.username
      );
      if (existing) {
        loginHint = existing.email;
        const missingRequestedScope = scopes.some(
          (scope) => !hasGoogleScope(existing.scopes, scope)
        );
        forceOfflineConsent = !existing.refreshToken || missingRequestedScope;
      } else {
        forceOfflineConsent = true;
      }
    }

    const clientOrigin = origin || getAppPublicOrigin(origin);
    const { state, codeChallenge } = await createGoogleOAuthState(redis, {
      mode,
      username:
        mode === "link" || mode === "scopes"
          ? user!.username.toLowerCase()
          : null,
      scopes,
      clientOrigin,
      returnMode,
      redirectUri: config.redirectUri,
    });

    const authUrl = buildGoogleAuthorizationUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      codeChallenge,
      scopes,
      mode,
      forceOfflineConsent,
      loginHint,
    });

    logger.response(200, Date.now() - startTime);
    res.status(200).json({ authUrl });
  }
);
