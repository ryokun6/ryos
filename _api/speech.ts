import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { Redis } from "@upstash/redis";
import { initLogger } from "./_utils/_logging.js";
import { executeSpeechCore } from "./cores/speech-core.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Helper functions for Node.js runtime
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();

  logger.request(req.method || "POST", req.url || "/api/speech", "speech");

  const effectiveOrigin = getEffectiveOrigin(req);

  // Handle CORS pre-flight request
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.error("Unauthorized origin", effectiveOrigin);
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"] });

  const redis = createRedis();
  const authHeaderInitial = req.headers.authorization;
  const headerAuthToken =
    authHeaderInitial && authHeaderInitial.startsWith("Bearer ")
      ? authHeaderInitial.substring(7)
      : null;
  const headerUsername = req.headers["x-username"] as string | undefined;

  const username = headerUsername || null;
  const authToken: string | undefined = headerAuthToken || undefined;
  const result = await executeSpeechCore({
    originAllowed: isAllowedOrigin(effectiveOrigin),
    method: req.method,
    body: req.body,
    redis,
    username,
    authToken,
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

  if (Buffer.isBuffer(result.body) || result.body instanceof Uint8Array) {
    logger.response(result.status, Date.now() - startTime);
    res.status(result.status).send(result.body);
    return;
  }

  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
