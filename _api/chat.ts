import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { initLogger } from "./_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { getRequestGeolocation } from "./_utils/_geolocation.js";
import { executeChatCore } from "./cores/chat-core.js";

// Node.js runtime configuration
export const runtime = "nodejs";
export const maxDuration = 80;

// Helper functions for Node.js runtime
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  // Check origin before processing request
  const effectiveOrigin = getEffectiveOrigin(req);
  
  logger.request(req.method || "POST", req.url || "/api/chat", "chat");
  
  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { origin: effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  // At this point origin is guaranteed to be a valid string
  const validOrigin = effectiveOrigin as string;

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    setCorsHeaders(res, validOrigin, { methods: ["POST", "OPTIONS"] });
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  // Create Redis client for auth validation
  const redis = createRedis();

  try {
    const result = await executeChatCore({
      url: req.url,
      body: req.body,
      headers: req.headers as Record<string, string | string[] | undefined>,
      origin: validOrigin,
      requestGeo: getRequestGeolocation(req),
      redis,
      logger,
    });

    res.setHeader("Access-Control-Allow-Origin", validOrigin);
    if (result.kind === "response") {
      logger.response(result.response.status, Date.now() - startTime);
      if (result.responseType === "text") {
        res.status(result.response.status).send(
          typeof result.response.body === "string"
            ? result.response.body
            : JSON.stringify(result.response.body)
        );
        return;
      }
      res.status(result.response.status).json(result.response.body);
      return;
    }

    logger.response(200, Date.now() - startTime);
    result.stream.pipeUIMessageStreamToResponse(res, { status: 200 });
  } catch (error) {
    logger.error("Chat wrapper error", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
