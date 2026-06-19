/**
 * POST /api/auth/email/remove
 *
 * Remove the recovery email from the authenticated user's account, clearing
 * the reverse index and any pending verification code. Requires a fresh
 * (non-grace) token.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  getStoredUserRecord,
  setStoredUserRecord,
  deleteUserEmailIndex,
} from "../../_utils/auth/_user-record.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: false,
  },
  async ({ res, redis, logger, startTime, user }) => {
    const username = user?.username || "";
    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const record = await getStoredUserRecord(redis, username);
    if (record?.email) {
      await deleteUserEmailIndex(redis, record.email);
      const { email: _email, emailVerified: _verified, emailUpdatedAt: _updated, ...rest } =
        record;
      await setStoredUserRecord(redis, username, rest);
    }
    await redis.del(redisKeys.auth.emailVerify(username));

    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  }
);
