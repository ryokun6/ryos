import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";

interface PushRequestLoggerLike {
  request: (method: string, url: string) => void;
  response: (statusCode: number, duration?: number) => void;
}

export function handlePushPostRequestGuards(
  req: VercelRequest,
  res: VercelResponse,
  logger: PushRequestLoggerLike,
  startTime: number,
  endpointPath: string
): boolean {
  const origin = getEffectiveOrigin(req);
  const method = (req.method || "POST").toUpperCase();
  logger.request(method, req.url || endpointPath);

  if (method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Unauthorized" });
      return true;
    }

    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return true;
  }

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return true;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }

  return false;
}
