/**
 * Song List/Batch API Endpoint
 *
 * Wrapper around runtime-agnostic songs index core.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { initLogger } from "../_utils/_logging.js";
import { executeSongsIndexCore } from "../cores/songs-index-core.js";

export const runtime = "nodejs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();

  const effectiveOrigin = getEffectiveOrigin(req);
  setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "POST", "DELETE", "OPTIONS"] });
  logger.request(req.method || "GET", req.url || "/api/songs");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  const result = await executeSongsIndexCore({
    originAllowed: isAllowedOrigin(effectiveOrigin),
    method: req.method,
    query: req.query as Record<string, string | string[] | undefined>,
    body: req.body,
    authHeader: req.headers.authorization as string | undefined,
    usernameHeader: req.headers["x-username"] as string | undefined,
    clientIp: getClientIp(req),
  });

  if (result.headers) {
    Object.entries(result.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  if (result.status === 403) {
    if (typeof result.body === "string") {
      logger.warn("Unauthorized origin", { effectiveOrigin });
    } else {
      logger.warn("Forbidden songs action");
    }
  } else if (result.status === 401) {
    logger.warn("Unauthorized - authentication required");
  } else if (result.status === 429) {
    logger.warn("Song endpoint rate limit exceeded", { method: req.method });
  } else if (result.status >= 500) {
    logger.error("Song list API error");
  }

  logger.response(result.status, Date.now() - startTime);

  if (typeof result.body === "string") {
    return res.status(result.status).send(result.body);
  }
  return res.status(result.status).json(result.body);
}
