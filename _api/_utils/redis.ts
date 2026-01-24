/**
 * Redis client factory
 * 
 * Provides a consistent way to create Redis clients across all endpoints.
 * Works in both Node.js and Edge runtimes.
 */

import { Redis } from "@upstash/redis";

/**
 * Create a new Redis client using environment variables
 * 
 * @returns A configured Upstash Redis client
 * @throws If REDIS_KV_REST_API_URL or REDIS_KV_REST_API_TOKEN are not set
 */
export function createRedis(): Redis {
  const url = process.env.REDIS_KV_REST_API_URL;
  const token = process.env.REDIS_KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Redis configuration. Set REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN environment variables."
    );
  }

  return new Redis({ url, token });
}

/**
 * Type for Redis-like interface (for dependency injection in tests)
 */
export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  scan(
    cursor: number,
    options?: { match?: string; count?: number }
  ): Promise<[string | number, string[]]>;
  pipeline(): {
    set(key: string, value: unknown, options?: { ex?: number }): unknown;
    del(...keys: string[]): unknown;
    sadd(key: string, ...members: string[]): unknown;
    srem(key: string, ...members: string[]): unknown;
    exec(): Promise<unknown[]>;
  };
  smembers(key: string): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  ltrim(key: string, start: number, stop: number): Promise<string>;
  llen(key: string): Promise<number>;
  zadd(key: string, options: { score: number; member: string }): Promise<number>;
  zrangebyscore<T = string>(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<T[]>;
  zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number>;
  mget<T = unknown>(...keys: string[]): Promise<(T | null)[]>;
}

/**
 * Default export for convenience
 */
export default createRedis;
