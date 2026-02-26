/**
 * POST /api/presence/switch
 * Switch between rooms (leave previous, join next)
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { executePresenceSwitchCore } from "../cores/presence-switch-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/presence/switch", "switch");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });

  const originAllowed = isAllowedOrigin(origin);

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const result = await executePresenceSwitchCore({
    originAllowed,
    body: req.body,
  });

  if (result.status === 200) {
    const payload = req.body as { username?: string; previousRoomId?: string; nextRoomId?: string } | undefined;
    logger.info("Room switched", {
      username: payload?.username?.toLowerCase(),
      previousRoomId: payload?.previousRoomId,
      nextRoomId: payload?.nextRoomId,
    });
  } else {
    logger.warn("switchRoom failed", { status: result.status });
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
