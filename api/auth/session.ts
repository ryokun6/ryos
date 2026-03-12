/**
 * GET /api/auth/session
 *
 * Return the current session from the httpOnly auth cookie (or
 * Authorization header). Also refreshes the cookie if it came from the
 * header so that browser-based clients can migrate seamlessly.
 */

import { buildSetAuthCookie } from "../_utils/_cookie.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler(
  {
    methods: ["GET"],
    auth: "optional",
    allowExpiredAuth: true,
  },
  async ({ req: _req, res, logger, startTime, user }) => {
    if (!user) {
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ authenticated: false });
      return;
    }

    // Always refresh the cookie so the Max-Age stays current.
    // On migration (first load after upgrade), this converts the legacy
    // Authorization-header token into the httpOnly cookie.
    res.setHeader("Set-Cookie", buildSetAuthCookie(user.username, user.token));

    logger.info("Session restored", { username: user.username });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      authenticated: true,
      username: user.username,
      expired: user.expired,
    });
  }
);
