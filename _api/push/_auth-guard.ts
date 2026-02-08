import type { VercelResponse } from "@vercel/node";
import type { IncomingHttpHeaders } from "node:http";
import type { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { extractAuthFromHeaders } from "./_shared.js";

interface PushAuthLoggerLike {
  response: (statusCode: number, duration?: number) => void;
}

export interface PushAuthCredentials {
  username: string;
  token: string;
}

export function extractPushAuthCredentialsOrRespond(
  headers: IncomingHttpHeaders,
  res: VercelResponse,
  logger: PushAuthLoggerLike,
  startTime: number
): PushAuthCredentials | null {
  const { username, token } = extractAuthFromHeaders(headers);
  if (!username || !token) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return null;
  }

  return { username, token };
}

export async function validatePushAuthOrRespond(
  redis: Redis,
  credentials: PushAuthCredentials,
  res: VercelResponse,
  logger: PushAuthLoggerLike,
  startTime: number
): Promise<boolean> {
  const authResult = await validateAuth(redis, credentials.username, credentials.token, {
    allowExpired: false,
  });

  if (!authResult.valid || authResult.expired) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized - invalid token" });
    return false;
  }

  return true;
}
