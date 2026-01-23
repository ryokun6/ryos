/**
 * GET /api/auth/tokens
 * List all active tokens for the authenticated user
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { getUserTokens, validateAuth } from "../_utils/auth/index.js";
import { initLogger } from "../_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Username");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/auth/tokens", "tokens");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin);
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin);

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const redis = createRedis();
  const authHeader = req.headers.authorization;
  const usernameHeader = req.headers["x-username"] as string | undefined;
  const currentToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = usernameHeader || null;

  if (!username || !currentToken) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const authResult = await validateAuth(redis, username, currentToken, { allowExpired: true });
  if (!authResult.valid) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized - invalid token" });
    return;
  }

  const tokens = await getUserTokens(redis, username.toLowerCase());
  const tokenList = tokens.map((t) => ({
    maskedToken: `...${t.token.slice(-8)}`,
    createdAt: t.createdAt,
    isCurrent: t.token === currentToken,
  }));

  logger.info("Listed tokens", { username, count: tokenList.length });
  logger.response(200, Date.now() - startTime);
  res.status(200).json({ tokens: tokenList, count: tokenList.length });
}
