/**
 * POST /api/analytics/events
 *
 * First-party product analytics ingestion endpoint. The endpoint intentionally
 * opts out of request analytics so batched client events do not inflate API
 * traffic metrics.
 */

import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import {
  recordProductAnalyticsEvents,
  type ProductAnalyticsBatch,
} from "../_utils/_analytics.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { getHeader } from "../_utils/request-helpers.js";
import { resolveIpGeolocation } from "../_utils/_geolocation.js";

// Permissive on purpose: the only hard requirement is that `events` is an
// array. Individual events are validated/sanitized per-event downstream
// (`recordProductAnalyticsEvents` drops malformed events and caps the batch),
// so a single bad event never rejects the whole batch.
const AnalyticsBatchSchema = z.object({
  events: z.array(z.unknown()),
}) as unknown as z.ZodType<ProductAnalyticsBatch>;

export default apiHandler<ProductAnalyticsBatch>(
  {
    methods: ["POST"],
    auth: "optional",
    allowExpiredAuth: true,
    parseJsonBody: true,
    analytics: false,
    bodySchema: AnalyticsBatchSchema,
  },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    // Body is validated at the handler boundary via `bodySchema`.
    const ip = getClientIp(req);

    // Resolve a coarse country bucket for the request so the admin
    // dashboard can show a top-countries breakdown. We never persist the
    // raw IP, only the resolved country code/name. Uses the cached IP-geo
    // provider (24h cache) so this stays fast and rate-limit-friendly.
    let country: string | null = null;
    try {
      const resolved = await resolveIpGeolocation({ ip, redis });
      country = resolved?.country ?? null;
    } catch {
      country = null;
    }

    recordProductAnalyticsEvents(redis, body!, {
      ip,
      username: user?.username,
      userAgent: getHeader(req, "user-agent"),
      country,
    });

    logger.response(204, Date.now() - startTime);
    res.status(204).end();
  }
);
