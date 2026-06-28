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

const SESSION_LOCK_TTL_SECONDS = 10;
const SESSION_LOCK_RETRY_MS = 20;
const SESSION_LOCK_ATTEMPTS = 250;
const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const RENEW_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end';

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

/**
 * Serialize a session read-modify-write cycle across server instances.
 * The random ownership token prevents a delayed holder from deleting a lock
 * that expired and was acquired by another request.
 */
export async function withSessionMutationLock<T>(
  sessionId: string,
  client: Redis,
  mutation: () => Promise<T>
): Promise<T> {
  const lockKey = redisKeys.session.listenLock(sessionId);
  const owner = crypto.randomUUID();

  for (let attempt = 0; attempt < SESSION_LOCK_ATTEMPTS; attempt += 1) {
    const acquired = await client.set(lockKey, owner, {
      nx: true,
      ex: SESSION_LOCK_TTL_SECONDS,
    });
    if (acquired) {
      const renewal = setInterval(() => {
        void client
          .eval(RENEW_LOCK_SCRIPT, [lockKey], [owner, SESSION_LOCK_TTL_SECONDS])
          .catch(() => {
            // The mutation will finish or fail; ownership-safe release still
            // prevents deleting a successor's lock.
          });
      }, (SESSION_LOCK_TTL_SECONDS * 1000) / 3);
      try {
        return await mutation();
      } finally {
        clearInterval(renewal);
        await client.eval(RELEASE_LOCK_SCRIPT, [lockKey], [owner]);
      }
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SESSION_LOCK_RETRY_MS);
    });
  }

  throw new Error(`Timed out acquiring listen session lock: ${sessionId}`);
}
