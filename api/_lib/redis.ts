/**
 * Redis client singleton for API routes
 * Works in both Edge and Node.js runtimes
 */

import { Redis } from "@upstash/redis";

// Singleton instance
let redisInstance: Redis | null = null;

/**
 * Get the Redis client instance (singleton)
 */
export function getRedis(): Redis {
  if (!redisInstance) {
    const url = process.env.REDIS_KV_REST_API_URL;
    const token = process.env.REDIS_KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error("Redis configuration missing: REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN are required");
    }

    redisInstance = new Redis({ url, token });
  }

  return redisInstance;
}

/**
 * Create a new Redis client (for cases where singleton is not desired)
 */
export function createRedis(): Redis {
  const url = process.env.REDIS_KV_REST_API_URL;
  const token = process.env.REDIS_KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Redis configuration missing: REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN are required");
  }

  return new Redis({ url, token });
}

// Re-export Redis type for convenience
export { Redis };
