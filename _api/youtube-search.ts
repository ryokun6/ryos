import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import { executeYoutubeSearchCore } from "./cores/youtube-search-core.js";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Main handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/youtube-search", "youtube-search");
  logger.info("Request details", { 
    method: req.method, 
    effectiveOrigin,
    youtubeKeyCount: [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean).length,
    runtimeEnv: process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "development"
  });

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.error("Method not allowed");
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });

  const result = await executeYoutubeSearchCore(
    {
      originAllowed: isAllowedOrigin(effectiveOrigin),
      body: req.body,
      ip: getClientIp(req),
      apiKeys: [
        process.env.YOUTUBE_API_KEY,
        process.env.YOUTUBE_API_KEY_2,
      ].filter((key): key is string => !!key),
    },
    logger
  );

  if (result.headers) {
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
  }

  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
