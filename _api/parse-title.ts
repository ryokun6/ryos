import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import { executeParseTitleCore } from "./cores/parse-title-core.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/parse-title", "parse-title");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  const result = await executeParseTitleCore(
    {
      originAllowed: isAllowedOrigin(effectiveOrigin),
      body: req.body,
      ip: getClientIp(req),
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
