import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import { executeLinkPreviewCore } from "./cores/link-preview-core.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);
  
  logger.request(req.method || "GET", req.url || "/api/link-preview", "link-preview");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });

  const result = await executeLinkPreviewCore({
    originAllowed: isAllowedOrigin(effectiveOrigin),
    method: req.method,
    urlParam: req.query.url as string | undefined,
    ip: getClientIp(req),
  });

  if (result.headers) {
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
  }

  if (typeof result.body === "string") {
    logger.response(result.status, Date.now() - startTime);
    res.status(result.status).send(result.body);
    return;
  }

  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}