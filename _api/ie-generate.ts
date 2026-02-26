import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { initLogger } from "./_utils/_logging.js";
import { executeIeGenerateCore } from "./cores/ie-generate-core.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  logger.request(req.method || "POST", req.url || "/api/ie-generate");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  const result = await executeIeGenerateCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    query: {
      model: req.query.model as string | undefined,
      url: req.query.url as string | undefined,
      year: req.query.year as string | undefined,
    },
    body: req.body,
    clientIp: getClientIp(req),
  });

  if (result.kind === "stream") {
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    logger.response(200, Date.now() - startTime);
    result.stream.pipeUIMessageStreamToResponse(res);
    return;
  }

  if (result.response.headers) {
    Object.entries(result.response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  if (result.response.status === 403) {
    logger.warn("Unauthorized origin", { origin });
  } else if (result.response.status === 405) {
    logger.warn("Method not allowed", { method: req.method });
  } else if (result.response.status === 429) {
    const body = result.response.body as { scope?: string; limit?: number };
    logger.warn("IE generate rate limit exceeded", {
      scope: body.scope,
      limit: body.limit,
    });
  } else if (result.response.status >= 500) {
    logger.error("IE generation failed");
  }

  logger.response(result.response.status, Date.now() - startTime);
  if (result.bodyType === "text") {
    return res.status(result.response.status).send(result.response.body as string);
  }
  return res.status(result.response.status).json(result.response.body);
}
