/**
 * Shared Redis-backed realtime session helpers.
 *
 * Features:
 * - Generic typed sessions
 * - Namespaced keys per feature (listen/live desktop/etc.)
 * - TTL refresh on writes/touches
 */

import { Redis } from "@upstash/redis";

export interface RealtimeSessionCoreOptions {
  sessionPrefix: string;
  sessionsSetKey: string;
  sessionTtlSeconds: number;
}

export interface RealtimeSessionCore<TSession> {
  generateSessionId: () => string;
  getCurrentTimestamp: () => number;
  parseJSON: <T>(data: unknown) => T | null;
  getSession: (sessionId: string) => Promise<TSession | null>;
  setSession: (sessionId: string, session: TSession) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  touchSession: (sessionId: string) => Promise<void>;
  getActiveSessionIds: () => Promise<string[]>;
}

function createRedisClient(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export function generateRealtimeSessionId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getRealtimeSessionTimestamp(): number {
  return Date.now();
}

export function parseRealtimeJSON<T>(data: unknown): T | null {
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

export function createRealtimeSessionCore<TSession>(
  options: RealtimeSessionCoreOptions
): RealtimeSessionCore<TSession> {
  const { sessionPrefix, sessionsSetKey, sessionTtlSeconds } = options;

  const getSessionKey = (sessionId: string) => `${sessionPrefix}${sessionId}`;

  return {
    generateSessionId: generateRealtimeSessionId,
    getCurrentTimestamp: getRealtimeSessionTimestamp,
    parseJSON: parseRealtimeJSON,

    getSession: async (sessionId: string) => {
      const client = createRedisClient();
      const data = await client.get(getSessionKey(sessionId));
      return parseRealtimeJSON<TSession>(data);
    },

    setSession: async (sessionId: string, session: TSession) => {
      const client = createRedisClient();
      await client.set(getSessionKey(sessionId), JSON.stringify(session), {
        ex: sessionTtlSeconds,
      });
      await client.sadd(sessionsSetKey, sessionId);
    },

    deleteSession: async (sessionId: string) => {
      const client = createRedisClient();
      const pipeline = client.pipeline();
      pipeline.del(getSessionKey(sessionId));
      pipeline.srem(sessionsSetKey, sessionId);
      await pipeline.exec();
    },

    touchSession: async (sessionId: string) => {
      const client = createRedisClient();
      await client.expire(getSessionKey(sessionId), sessionTtlSeconds);
    },

    getActiveSessionIds: async () => {
      const client = createRedisClient();
      const sessionIds = await client.smembers<string[]>(sessionsSetKey);
      return sessionIds || [];
    },
  };
}
