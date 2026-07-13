/**
 * GET /api/kosync/healthcheck
 * KOReader sync server health probe — `{ state: "OK" }`.
 */

import { apiHandler } from "../_utils/api-handler.js";
import { KOSYNC_CORS_HEADERS } from "./_helpers/_types.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
    allowMissingOrigin: true,
    corsHeaders: KOSYNC_CORS_HEADERS,
  },
  async ({ res, logger, startTime }) => {
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ state: "OK" });
  }
);
