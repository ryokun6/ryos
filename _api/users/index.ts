/**
 * GET /api/users
 * Search for users
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { executeUsersSearchCore } from "../cores/users-search-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/users", "users");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });

  const originAllowed = isAllowedOrigin(origin);

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const searchQuery = (req.query.search as string) || "";
  const result = await executeUsersSearchCore({
    originAllowed,
    searchQuery,
  });

  if (result.status === 200) {
    const users = (result.body as { users?: unknown[] })?.users || [];
    logger.info("Users searched", { query: searchQuery, count: users.length });
  } else {
    logger.warn("Users search failed", { query: searchQuery, status: result.status });
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
