/**
 * GET /api/auth/session
 *
 * Return the current session and refresh the httpOnly auth cookie.
 */

import {
  buildClearAuthCookie,
  buildSetAuthCookie,
  parseAuthCookie,
} from "../_utils/_cookie.js";
import { apiHandler } from "../_utils/api-handler.js";
import {
  getStoredUserRecord,
  getStoredUserTimeZone,
} from "../_utils/auth/_user-record.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "optional",
    allowExpiredAuth: true,
  },
  async ({ req, res, logger, startTime, user, redis }) => {
    if (!user) {
      // Drop stale cookies so anonymous clients stop sending invalid credentials.
      if (parseAuthCookie(req.headers.cookie)) {
        res.setHeader("Set-Cookie", buildClearAuthCookie());
      }
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ authenticated: false });
      return;
    }

    // Always refresh the cookie so the Max-Age stays current.
    res.setHeader("Set-Cookie", buildSetAuthCookie(user.username, user.token));

    logger.info("Session restored", { username: user.username });
    const [timeZone, userRecord] = await Promise.all([
      getStoredUserTimeZone(redis, user.username),
      getStoredUserRecord(redis, user.username),
    ]);
    const createdAt =
      typeof userRecord?.createdAt === "number" ? userRecord.createdAt : undefined;
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      authenticated: true,
      username: user.username,
      expired: user.expired,
      ...(timeZone ? { timeZone } : {}),
      ...(createdAt !== undefined ? { createdAt } : {}),
    });
  }
);
