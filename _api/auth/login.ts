/**
 * POST /api/auth/login
 *
 * Authenticate user with password (Node.js runtime for bcrypt)
 */

import type { VercelRequest } from "@vercel/node";
import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../_utils/auth/index.js";
import { verifyPassword, getUserPasswordHash } from "../_utils/auth/_password.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface LoginRequest {
  username: string;
  password: string;
  oldToken?: string;
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return (req.headers["x-real-ip"] as string) || "unknown";
}

export default apiHandler(
  { methods: ["POST"], auth: "none", parseJsonBody: true },
  async (ctx) => {
    const { req, res, redis } = ctx;
    const body = ctx.body as LoginRequest | null;
    const { username: rawUsername, password, oldToken } = body || {};

    // Rate limiting: 10/min per IP
    const ip = getClientIp(req);
    const rlKey = `rl:auth:login:ip:${ip}`;
    const current = await redis.incr(rlKey);
    if (current === 1) {
      await redis.expire(rlKey, 60);
    }
    if (current > 10) {
      res.status(429).json({
        error: "Too many login attempts. Please try again later.",
      });
      return;
    }

    if (!rawUsername || typeof rawUsername !== "string") {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    const username = rawUsername.toLowerCase();
    const userKey = `${CHAT_USERS_PREFIX}${username}`;

    // Check if user exists
    const userData = await redis.get(userKey);
    if (!userData) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Get and verify password
    const passwordHash = await getUserPasswordHash(redis, username);
    if (!passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordValid = await verifyPassword(password, passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Handle old token if provided (rotation)
    if (oldToken) {
      await storeLastValidToken(
        redis,
        username,
        oldToken,
        Date.now(),
        TOKEN_GRACE_PERIOD
      );
      await deleteToken(redis, oldToken);
    }

    // Generate new token
    const token = generateAuthToken();
    await storeToken(redis, username, token);

    res.status(200).json({ token, username });
  }
);
