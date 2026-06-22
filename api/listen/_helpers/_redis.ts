/**
 * Redis client and helper functions for listen-together sessions
 */

import type { ListenSession } from "./_types.js";
import type { Redis } from "../../_utils/redis.js";
import {
  createRedisClient,
  generateRandomHexId,
  getCurrentTimestamp,
  parseJSON,
} from "../../_utils/redis-helpers.js";
import { LISTEN_SESSION_TTL_SECONDS } from "./_constants.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";

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

export async function getSession(
  sessionId: string,
  client: Redis = createRedisClient()
): Promise<ListenSession | null> {
  const data = await client.get(redisKeys.session.listen(sessionId));
  return parseSessionData(data);
}

export async function setSession(
  sessionId: string,
  session: ListenSession,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.set(redisKeys.session.listen(sessionId), JSON.stringify(session), {
    ex: LISTEN_SESSION_TTL_SECONDS,
  });
  await client.sadd(redisKeys.session.listenIds(), sessionId);
}

export async function deleteSession(
  sessionId: string,
  client: Redis = createRedisClient()
): Promise<void> {
  const pipeline = client.pipeline();
  pipeline.del(redisKeys.session.listen(sessionId));
  pipeline.srem(redisKeys.session.listenIds(), sessionId);
  await pipeline.exec();
}

export async function touchSession(
  sessionId: string,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.expire(
    redisKeys.session.listen(sessionId),
    LISTEN_SESSION_TTL_SECONDS
  );
}

export async function getActiveSessionIds(
  client: Redis = createRedisClient()
): Promise<string[]> {
  return (await client.smembers<string[]>(redisKeys.session.listenIds())) || [];
}
