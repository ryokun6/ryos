/**
 * GET /api/users
 * Search for users
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleGetUsers } from "../rooms/_helpers/_users.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";

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

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const searchQuery = (req.query.search as string) || "";

  try {
    const response = await handleGetUsers("users-search", searchQuery);
    const data = await response.json();
    
    logger.info("Users searched", { query: searchQuery, count: data.users?.length || 0 });
    logger.response(response.status, Date.now() - startTime);
    res.status(response.status).json(data);
  } catch (error) {
    logger.error("Error searching users", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to search users" });
  }
}
