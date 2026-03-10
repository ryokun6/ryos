/**
 * POST /api/auth/token/verify
 * 
 * Verify if a token is valid
 */

import { isProfaneUsername } from "../../_utils/_validation.js";
import { apiHandler } from "../../_utils/api-handler.js";
import { buildSetAuthCookie } from "../../_utils/_cookie.js";

export const runtime = "nodejs";

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: true,
  },
  async ({ res, logger, startTime, user }) => {
    const username = user?.username || "";

    // Additional hardening check: profane usernames are treated as invalid auth.
    if (isProfaneUsername(username)) {
      logger.warn("Profane username detected", { username });
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }

    // Set httpOnly cookie so the browser retains the session
    res.setHeader("Set-Cookie", buildSetAuthCookie(username, user?.token || ""));

    if (user?.expired) {
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
