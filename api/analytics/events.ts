/**
 * POST /api/analytics/events
 *
 * First-party product analytics ingestion endpoint. The endpoint intentionally
 * opts out of request analytics so batched client events do not inflate API
 * traffic metrics.
 */

import { apiHandler } from "../_utils/api-handler.js";
import {
  recordProductAnalyticsEvents,
  type ProductAnalyticsBatch,
} from "../_utils/_analytics.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { getHeader } from "../_utils/request-helpers.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler<ProductAnalyticsBatch>(
  {
    methods: ["POST"],
    auth: "optional",
    allowExpiredAuth: true,
    parseJsonBody: true,
    analytics: false,
  },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    if (!body || !Array.isArray(body.events)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid analytics event batch" });
      return;
    }

    recordProductAnalyticsEvents(redis, body, {
      ip: getClientIp(req),
      username: user?.username,
      userAgent: getHeader(req, "user-agent"),
    });

    logger.response(204, Date.now() - startTime);
    res.status(204).end();
  }
);
