/**
 * Redis client factory
 *
 * Supports two backends:
 * - Upstash REST (`REDIS_KV_REST_API_URL` + `REDIS_KV_REST_API_TOKEN`)
 * - Standard Redis (`REDIS_URL`)
 *
 * We intentionally keep the public API close to @upstash/redis so existing
 * route code can keep working with minimal changes.
 */

import { Redis } from "@upstash/redis";
import IORedis from "ioredis";

export type RedisBackend = "upstash-rest" | "redis-url";

export interface RedisSetOptions {
  ex?: number;
  nx?: boolean;
}

export interface RedisScanOptions {
  match?: string;
  count?: number;
}

export interface RedisSortedSetEntry {
  score: number;
  member: string;
}

export interface RedisPipelineLike {
  set(key: string, value: unknown, options?: RedisSetOptions): this;
  del(...keys: string[]): this;
  sadd(key: string, ...members: string[]): this;
  srem(key: string, ...members: string[]): this;
  zremrangebyscore(key: string, min: number | string, max: number | string): this;
  zcard(key: string): this;
  hincrby(key: string, field: string, increment: number): this;
  hgetall(key: string): this;
  pfadd(key: string, ...elements: string[]): this;
  pfcount(...keys: string[]): this;
  expire(key: string, seconds: number): this;
  exec(): Promise<unknown[]>;
}

export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: RedisSetOptions): Promise<unknown>;
  setnx(key: string, value: unknown): Promise<number>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  scan(
    cursor: number | string,
    options?: RedisScanOptions
  ): Promise<[string | number, string[]]>;
  pipeline(): RedisPipelineLike;
  smembers<T = string[]>(key: string): Promise<T>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  ltrim(key: string, start: number, stop: number): Promise<string>;
  lrem(key: string, count: number, value: string): Promise<number>;
  llen(key: string): Promise<number>;
  mget<T = unknown>(...keys: string[]): Promise<(T | null)[]>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  hgetall<T = Record<string, string>>(key: string): Promise<T | null>;
  pfadd(key: string, ...elements: string[]): Promise<number>;
  pfcount(...keys: string[]): Promise<number>;
  zadd(key: string, entry: RedisSortedSetEntry): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zcard(key: string): Promise<number>;
}

const redisClientCache = globalThis as typeof globalThis & {
  __ryosStandardRedis?: IORedis;
};

const redisPubSubCache = globalThis as typeof globalThis & {
  __ryosStandardRedisPub?: IORedis;
  __ryosStandardRedisSub?: IORedis;
};

function getRedisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.REDIS_KV_REST_API_URL?.trim();
  const token = process.env.REDIS_KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

export function getRedisBackend(): RedisBackend {
  const explicit = process.env.REDIS_PROVIDER?.trim().toLowerCase();
  if (explicit === "redis-url" || explicit === "redis" || explicit === "standard") {
    if (!getRedisUrl()) {
      throw new Error(
        "REDIS_PROVIDER requests standard Redis, but REDIS_URL is not set."
      );
    }
    return "redis-url";
  }

  if (explicit === "upstash-rest" || explicit === "upstash") {
    if (!getUpstashConfig()) {
      throw new Error(
        "REDIS_PROVIDER requests Upstash REST, but REDIS_KV_REST_API_URL / REDIS_KV_REST_API_TOKEN are not set."
      );
    }
    return "upstash-rest";
  }

  if (getRedisUrl()) {
    return "redis-url";
  }

  if (getUpstashConfig()) {
    return "upstash-rest";
  }

  throw new Error(
    "Missing Redis configuration. Set REDIS_URL for standard Redis or REDIS_KV_REST_API_URL + REDIS_KV_REST_API_TOKEN for Upstash REST."
  );
}

function serializeRedisValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

class StandardRedisPipelineAdapter implements RedisPipelineLike {
  constructor(private readonly pipelineClient: ReturnType<IORedis["pipeline"]>) {}

  set(key: string, value: unknown, options?: RedisSetOptions): this {
    const serialized = serializeRedisValue(value);
    if (options?.nx && options?.ex) {
      this.pipelineClient.set(key, serialized, "EX", options.ex, "NX");
      return this;
    }
    if (options?.nx) {
      this.pipelineClient.set(key, serialized, "NX");
      return this;
    }
    if (options?.ex) {
      this.pipelineClient.set(key, serialized, "EX", options.ex);
      return this;
    }
    this.pipelineClient.set(key, serialized);
    return this;
  }

  del(...keys: string[]): this {
    if (keys.length > 0) {
      this.pipelineClient.del(...keys);
    }
    return this;
  }

  sadd(key: string, ...members: string[]): this {
    if (members.length > 0) {
      this.pipelineClient.sadd(key, ...members);
    }
    return this;
  }

  srem(key: string, ...members: string[]): this {
    if (members.length > 0) {
      this.pipelineClient.srem(key, ...members);
    }
    return this;
  }

  zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): this {
    this.pipelineClient.zremrangebyscore(key, min, max);
    return this;
  }

  zcard(key: string): this {
    this.pipelineClient.zcard(key);
    return this;
  }

  hincrby(key: string, field: string, increment: number): this {
    this.pipelineClient.hincrby(key, field, increment);
    return this;
  }

  hgetall(key: string): this {
    this.pipelineClient.hgetall(key);
    return this;
  }

  pfadd(key: string, ...elements: string[]): this {
    if (elements.length > 0) {
      this.pipelineClient.pfadd(key, ...elements);
    }
    return this;
  }

  pfcount(...keys: string[]): this {
    if (keys.length > 0) {
      this.pipelineClient.pfcount(...keys);
    }
    return this;
  }

  expire(key: string, seconds: number): this {
    this.pipelineClient.expire(key, seconds);
    return this;
  }

  async exec(): Promise<unknown[]> {
    const results = await this.pipelineClient.exec();
    if (!results) return [];
    return results.map((entry) => entry?.[1]);
  }
}

class StandardRedisAdapter implements RedisLike {
  constructor(private readonly client: IORedis) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    return (await this.client.get(key)) as T | null;
  }

  async set(
    key: string,
    value: unknown,
    options?: RedisSetOptions
  ): Promise<unknown> {
    const serialized = serializeRedisValue(value);
    if (options?.nx && options?.ex) {
      return await this.client.set(key, serialized, "EX", options.ex, "NX");
    }
    if (options?.nx) {
      return await this.client.set(key, serialized, "NX");
    }
    if (options?.ex) {
      return await this.client.set(key, serialized, "EX", options.ex);
    }
    return await this.client.set(key, serialized);
  }

  async setnx(key: string, value: unknown): Promise<number> {
    return await this.client.setnx(key, serializeRedisValue(value));
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.client.del(...keys);
  }

  async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.client.exists(...keys);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }

  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async scan(
    cursor: number | string,
    options?: RedisScanOptions
  ): Promise<[string | number, string[]]> {
    const args: Array<string | number> = [String(cursor)];
    if (options?.match) {
      args.push("MATCH", options.match);
    }
    if (typeof options?.count === "number") {
      args.push("COUNT", options.count);
    }
    const [nextCursor, keys] = await this.client.scan(...args);
    return [nextCursor, keys];
  }

  pipeline(): RedisPipelineLike {
    return new StandardRedisPipelineAdapter(this.client.pipeline());
  }

  async smembers<T = string[]>(key: string): Promise<T> {
    return (await this.client.smembers(key)) as T;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return await this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return await this.client.srem(key, ...members);
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    if (values.length === 0) return await this.client.llen(key);
    return await this.client.lpush(key, ...values);
  }

  async lrange<T = unknown>(
    key: string,
    start: number,
    stop: number
  ): Promise<T[]> {
    return (await this.client.lrange(key, start, stop)) as T[];
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    return await this.client.ltrim(key, start, stop);
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    return await this.client.lrem(key, count, value);
  }

  async llen(key: string): Promise<number> {
    return await this.client.llen(key);
  }

  async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    return (await this.client.mget(...keys)) as (T | null)[];
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return await this.client.hincrby(key, field, increment);
  }

  async hgetall<T = Record<string, string>>(key: string): Promise<T | null> {
    const result = await this.client.hgetall(key);
    if (!result || Object.keys(result).length === 0) return null;
    return result as T;
  }

  async pfadd(key: string, ...elements: string[]): Promise<number> {
    if (elements.length === 0) return 0;
    return await this.client.pfadd(key, ...elements);
  }

  async pfcount(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.client.pfcount(...keys);
  }

  async zadd(key: string, entry: RedisSortedSetEntry): Promise<number> {
    return await this.client.zadd(key, entry.score, entry.member);
  }

  async zrem(key: string, member: string): Promise<number> {
    return await this.client.zrem(key, member);
  }

  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number> {
    return await this.client.zremrangebyscore(key, min, max);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.zrange(key, start, stop);
  }

  async zcard(key: string): Promise<number> {
    return await this.client.zcard(key);
  }
}

function getStandardRedisClient(): IORedis {
  if (!redisClientCache.__ryosStandardRedis) {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
      throw new Error(
        "Missing REDIS_URL for standard Redis mode."
      );
    }

    redisClientCache.__ryosStandardRedis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  return redisClientCache.__ryosStandardRedis;
}

function createUpstashRedis(): Redis {
  const config = getUpstashConfig();
  if (!config) {
    throw new Error(
      "Missing Redis configuration. Set REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN environment variables."
    );
  }

  return new Redis(config);
}

/**
 * Create a Redis client using the configured backend.
 *
 * The return type intentionally stays `Redis` for compatibility with the
 * existing codebase. In standard Redis mode, we return an adapter that matches
 * the subset of methods the app currently uses.
 */
export function createRedis(): Redis {
  if (getRedisBackend() === "upstash-rest") {
    return createUpstashRedis();
  }

  return new StandardRedisAdapter(getStandardRedisClient()) as unknown as Redis;
}

function getSharedPubSubClient(slot: "__ryosStandardRedisPub" | "__ryosStandardRedisSub"): IORedis {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for Redis pub/sub.");
  }

  if (!redisPubSubCache[slot]) {
    redisPubSubCache[slot] = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  return redisPubSubCache[slot];
}

export function supportsRedisPubSub(): boolean {
  return getRedisBackend() === "redis-url";
}

export function createRedisPublisher(): IORedis {
  if (!supportsRedisPubSub()) {
    throw new Error("Redis pub/sub requires standard Redis mode (REDIS_URL).");
  }
  return getSharedPubSubClient("__ryosStandardRedisPub");
}

export function createRedisSubscriber(): IORedis {
  if (!supportsRedisPubSub()) {
    throw new Error("Redis pub/sub requires standard Redis mode (REDIS_URL).");
  }
  return getSharedPubSubClient("__ryosStandardRedisSub");
}

/**
 * Default export for convenience.
 */
export default createRedis;
