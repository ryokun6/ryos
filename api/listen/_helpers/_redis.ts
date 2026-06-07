/**
 * Redis client and helper functions for listen-together sessions
 */

import type { ListenSession } from "./_types.js";
import {
  createRedisClient,
  generateRandomHexId,
  getCurrentTimestamp,
  parseJSON,
} from "../../_utils/redis-helpers.js";
import {
  LISTEN_SESSION_PREFIX,
  LISTEN_SESSIONS_SET,
  LISTEN_SESSION_TTL_SECONDS,
} from "./_constants.js";

// ============================================================================
// Redis Client Factory
// ============================================================================

export { createRedisClient, getCurrentTimestamp, parseJSON };

// ============================================================================
// Helper Functions
// ============================================================================

export function generateSessionId(): string {
  return generateRandomHexId(12);
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
