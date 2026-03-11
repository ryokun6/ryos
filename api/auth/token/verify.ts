/**
 * POST /api/auth/token/verify
 *
 * Verify a token and set the httpOnly auth cookie on success.
 * Accepts { username, token } in the request body (cookie-only clients
 * cannot send arbitrary tokens via headers).
 *
 * Also supports the legacy Authorization-header path so the
 * middleware-based extraction still works during migration.
 */

import { isProfaneUsername } from "../../_utils/_validation.js";
import { validateAuth } from "../../_utils/auth/index.js";
import { apiHandler } from "../../_utils/api-handler.js";
import { buildSetAuthCookie } from "../../_utils/_cookie.js";

export const runtime = "nodejs";

interface VerifyRequest {
  username: string;
  token: string;
}

export default apiHandler<VerifyRequest>(
  {
    methods: ["POST"],
    auth: "optional",
    allowExpiredAuth: true,
    parseJsonBody: true,
  },
  async ({ res, redis, logger, startTime, user, body }) => {
    // Prefer body params (cookie-only clients); fall back to middleware-extracted user
    const username = (body?.username || user?.username || "").toLowerCase();
    const token = body?.token || user?.token || "";

    if (!username || !token) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Username and token are required" });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.warn("Profane username detected", { username });
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }

    // When credentials came from the body (not the middleware), validate manually
    const isBodyAuth = Boolean(body?.username && body?.token);
    let expired = user?.expired ?? false;

    if (isBodyAuth) {
      const result = await validateAuth(redis, username, token, {
        allowExpired: true,
      });
      if (!result.valid) {
        logger.response(401, Date.now() - startTime);
        res.status(401).json({ error: "Invalid authentication token" });
        return;
      }
      expired = !!result.expired;
    }

    res.setHeader("Set-Cookie", buildSetAuthCookie(username, token));

    if (expired) {
      logger.info("Token within grace period", { username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        valid: true,
        username,
        expired: true,
        message: "Token is within grace period",
      });
      return;
    }

    logger.info("Token verified successfully", { username });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      valid: true,
      username,
      message: "Token is valid",
    });
  }
);
