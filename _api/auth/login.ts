/**
 * POST /api/auth/login
 * 
 * Authenticate user with password (Node.js runtime for bcrypt)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { setCorsHeaders } from "../_utils/_cors.js";
import { executeAuthLoginCore } from "../cores/auth-login-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.headers["x-real-ip"] as string || "unknown";
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = req.headers.origin as string | undefined;
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  const ip = getClientIp(req);
  const result = await executeAuthLoginCore({
    body: req.body,
    redis,
    ip,
  });

  if (result.headers) {
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
  }
  res.status(result.status).json(result.body);
}
