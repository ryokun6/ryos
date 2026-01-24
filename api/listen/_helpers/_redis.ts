/**
 * Redis client and helper functions for listen-together sessions
 * Node.js runtime - uses Upstash Redis client
 */

import { Redis } from "@upstash/redis";
import type { ListenSession } from "./_types.js";
import {
  LISTEN_SESSION_PREFIX,
  LISTEN_SESSIONS_SET,
  LISTEN_SESSION_TTL_SECONDS,
} from "./_constants.js";

// ============================================================================
// Redis Client Factory
// ============================================================================

function createRedisClient(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export { createRedisClient };

// ============================================================================
// Helper Functions
// ============================================================================

export function generateSessionId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getCurrentTimestamp(): number {
  return Date.now();
}

export function parseJSON<T>(data: unknown): T | null {
  if (!data) return null;
  if (typeof data === "object") return data as T;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export function parseSessionData(data: unknown): ListenSession | null {
  return parseJSON<ListenSession>(data);
}

// ============================================================================
// Session Operations
// ============================================================================

export async function getSession(sessionId: string): Promise<ListenSession | null> {
  const client = createRedisClient();
  const data = await client.get(`${LISTEN_SESSION_PREFIX}${sessionId}`);
  return parseSessionData(data);
}

export async function setSession(
  sessionId: string,
  session: ListenSession
): Promise<void> {
  const client = createRedisClient();
  await client.set(`${LISTEN_SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
    ex: LISTEN_SESSION_TTL_SECONDS,
  });
  await client.sadd(LISTEN_SESSIONS_SET, sessionId);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const client = createRedisClient();
  const pipeline = client.pipeline();
  pipeline.del(`${LISTEN_SESSION_PREFIX}${sessionId}`);
  pipeline.srem(LISTEN_SESSIONS_SET, sessionId);
  await pipeline.exec();
}

export async function touchSession(sessionId: string): Promise<void> {
  const client = createRedisClient();
  await client.expire(
    `${LISTEN_SESSION_PREFIX}${sessionId}`,
    LISTEN_SESSION_TTL_SECONDS
  );
}

export async function getActiveSessionIds(): Promise<string[]> {
  const client = createRedisClient();
  const sessionIds = await client.smembers<string[]>(LISTEN_SESSIONS_SET);
  return sessionIds || [];
}
