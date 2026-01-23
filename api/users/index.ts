/**
 * GET /api/users
 * Search for users
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleGetUsers } from "../rooms/_helpers/_users.js";
import { initLogger } from "../_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function getEffectiveOrigin(req: VercelRequest): string | null {
  return (req.headers.origin as string) || null;
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const allowedOrigins = ["https://os.ryo.lu", "https://ryos.vercel.app", "http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"];
  return allowedOrigins.some((a) => origin.startsWith(a)) || origin.includes("vercel.app");
}

function setCorsHeaders(res: VercelResponse, origin: string | null): void {
  res.setHeader("Content-Type", "application/json");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/users", "users");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin);
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin);

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
