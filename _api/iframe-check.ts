import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import { executeIframeCheckCore } from "./cores/iframe-check-core.js";

export const runtime = "nodejs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();

  const effectiveOrigin = getEffectiveOrigin(req);
  logger.request(req.method || "GET", req.url || "/api/iframe-check");

  const result = await executeIframeCheckCore({
    originAllowed: isAllowedOrigin(effectiveOrigin),
    query: req.query as Record<string, string | string[] | undefined>,
    effectiveOrigin,
    clientIp: getClientIp(req),
  });

  if (result.response.headers) {
    Object.entries(result.response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  if (result.response.status === 403) {
    logger.warn("Unauthorized origin", { effectiveOrigin });
  } else if (result.response.status === 429) {
    logger.warn("iframe-check rate limit exceeded");
  } else if (result.response.status >= 500) {
    logger.error("iframe-check error");
  }

  logger.response(result.response.status, Date.now() - startTime);

  if (result.bodyType === "binary") {
    return res.status(result.response.status).send(Buffer.from(result.response.body as Uint8Array));
  }
  if (result.bodyType === "text") {
    return res.status(result.response.status).send(result.response.body as string);
  }
  return res.status(result.response.status).json(result.response.body);
}
