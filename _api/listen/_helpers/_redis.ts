/**
 * Redis client and helper functions for listen-together sessions
 * Node.js runtime - uses Upstash Redis client
 */

import { createRedis, generateId, parseJSON } from "../../_utils/redis.js";
import type { ListenSession } from "./_types.js";
import {
  LISTEN_SESSION_PREFIX,
  LISTEN_SESSIONS_SET,
  LISTEN_SESSION_TTL_SECONDS,
} from "./_constants.js";

// Re-export shared Redis client and helpers
export {
  createRedis as createRedisClient,
  getCurrentTimestamp,
  parseJSON,
} from "../../_utils/redis.js";
export const generateSessionId = (): string => generateId(12);

export function parseSessionData(data: unknown): ListenSession | null {
  return parseJSON<ListenSession>(data);
}

// ============================================================================
// Session Operations
// ============================================================================

export async function getSession(sessionId: string): Promise<ListenSession | null> {
  const client = createRedis();
  const data = await client.get(`${LISTEN_SESSION_PREFIX}${sessionId}`);
  return parseSessionData(data);
}

export async function setSession(
  sessionId: string,
  session: ListenSession
): Promise<void> {
  const client = createRedis();
  await client.set(`${LISTEN_SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
    ex: LISTEN_SESSION_TTL_SECONDS,
  });
  await client.sadd(LISTEN_SESSIONS_SET, sessionId);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const client = createRedis();
  const pipeline = client.pipeline();
  pipeline.del(`${LISTEN_SESSION_PREFIX}${sessionId}`);
  pipeline.srem(LISTEN_SESSIONS_SET, sessionId);
  await pipeline.exec();
}

export async function touchSession(sessionId: string): Promise<void> {
  const client = createRedis();
  await client.expire(
    `${LISTEN_SESSION_PREFIX}${sessionId}`,
    LISTEN_SESSION_TTL_SECONDS
  );
}

export async function getActiveSessionIds(): Promise<string[]> {
  const client = createRedis();
  const sessionIds = await client.smembers<string[]>(LISTEN_SESSIONS_SET);
  return sessionIds || [];
}
