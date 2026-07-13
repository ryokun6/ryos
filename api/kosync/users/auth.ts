/**
 * GET /api/kosync/users/auth
 * Validate `X-Auth-User` + `X-Auth-Key` kosync credentials.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { authorizeKosyncRequest } from "./_helpers/_auth.js";
import { KosyncErrorCode, sendKosyncError } from "./_helpers/_errors.js";
import { KOSYNC_CORS_HEADERS } from "./_helpers/_types.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
    allowMissingOrigin: true,
    corsHeaders: KOSYNC_CORS_HEADERS,
  },
  async ({ req, res, redis, logger, startTime }) => {
    try {
      const username = await authorizeKosyncRequest(req, redis);
      if (!username) {
        sendKosyncError(res, KosyncErrorCode.UNAUTHORIZED);
        return;
      }
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ authorized: "OK" });
    } catch (error) {
      logger.error("kosync auth failed", error);
      sendKosyncError(res, KosyncErrorCode.INTERNAL);
    }
  }
);
