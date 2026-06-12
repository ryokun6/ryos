/**
 * In-memory Redis double for unit tests, covering the command subset used
 * by the Cloud Sync v2 core (hashes, lists, locks) and the song service
 * (strings, sets). Values are stored as strings, matching ioredis-style
 * semantics; JSON parsing is left to the code under test.
 */

export interface FakeRedisSetOptions {
  ex?: number;
  nx?: boolean;
}

function serialize(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export class FakeRedisPipeline {
  private operations: Array<() => unknown> = [];

  constructor(private readonly redis: FakeRedis) {}

  set(key: string, value: unknown, options?: FakeRedisSetOptions): this {
    this.operations.push(() => this.redis.setSync(key, value, options));
    return this;
  }

  del(...keys: string[]): this {
    this.operations.push(() => this.redis.delSync(...keys));
    return this;
  }

  expire(_key: string, _seconds: number): this {
    this.operations.push(() => 1);
    return this;
  }

  sadd(key: string, ...members: string[]): this {
    this.operations.push(() => this.redis.saddSync(key, ...members));
    return this;
  }

  srem(key: string, ...members: string[]): this {
    this.operations.push(() => this.redis.sremSync(key, ...members));
    return this;
  }

  hgetall(key: string): this {
    this.operations.push(() => this.redis.hgetallSync(key));
    return this;
  }

  async exec(): Promise<unknown[]> {
    return this.operations.map((operation) => operation());
  }
}

export class FakeRedis {
  readonly kv = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  readonly hashes = new Map<string, Map<string, string>>();
  readonly lists = new Map<string, string[]>();

  // --- sync helpers ---------------------------------------------------------

  setSync(key: string, value: unknown, options?: FakeRedisSetOptions): unknown {
    if (options?.nx && this.kv.has(key)) {
      return null;
    }
    this.kv.set(key, serialize(value));
    return "OK";
  }

  delSync(...keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.kv.delete(key)) deleted += 1;
      if (this.sets.delete(key)) deleted += 1;
      if (this.hashes.delete(key)) deleted += 1;
      if (this.lists.delete(key)) deleted += 1;
    }
    return deleted;
  }

  saddSync(key: string, ...members: string[]): number {
    const set = this.sets.get(key) || new Set<string>();
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added += 1;
      }
    }
    this.sets.set(key, set);
    return added;
  }

  sremSync(key: string, ...members: string[]): number {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed += 1;
    }
    if (set.size === 0) this.sets.delete(key);
    return removed;
  }

  hgetallSync(key: string): Record<string, string> | null {
    const hash = this.hashes.get(key);
    if (!hash || hash.size === 0) return null;
    return Object.fromEntries(hash);
  }

  // --- async API ------------------------------------------------------------

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.kv.get(key) as T | undefined) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    options?: FakeRedisSetOptions
  ): Promise<unknown> {
    return this.setSync(key, value, options);
  }

  async setnx(key: string, value: unknown): Promise<number> {
    return this.setSync(key, value, { nx: true }) === "OK" ? 1 : 0;
  }

  async del(...keys: string[]): Promise<number> {
    return this.delSync(...keys);
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.some(
      (key) =>
        this.kv.has(key) ||
        this.sets.has(key) ||
        this.hashes.has(key) ||
        this.lists.has(key)
    )
      ? 1
      : 0;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }

  async ttl(_key: string): Promise<number> {
    return -1;
  }

  async incr(key: string): Promise<number> {
    const current = Number.parseInt(this.kv.get(key) || "0", 10) || 0;
    const next = current + 1;
    this.kv.set(key, String(next));
    return next;
  }

  async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
    return keys.map((key) => (this.kv.get(key) as T | undefined) ?? null);
  }

  async smembers<T = string[]>(key: string): Promise<T> {
    return Array.from(this.sets.get(key) || []) as T;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.saddSync(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.sremSync(key, ...members);
  }

  async hset(key: string, fields: Record<string, unknown>): Promise<number> {
    const hash = this.hashes.get(key) || new Map<string, string>();
    let added = 0;
    for (const [field, value] of Object.entries(fields)) {
      if (!hash.has(field)) added += 1;
      hash.set(field, serialize(value));
    }
    this.hashes.set(key, hash);
    return added;
  }

  async hget<T = unknown>(key: string, field: string): Promise<T | null> {
    return (this.hashes.get(key)?.get(field) as T | undefined) ?? null;
  }

  async hmget<T = unknown>(key: string, ...fields: string[]): Promise<(T | null)[]> {
    const hash = this.hashes.get(key);
    return fields.map((field) => (hash?.get(field) as T | undefined) ?? null);
  }

  async hgetall<T = Record<string, string>>(key: string): Promise<T | null> {
    return this.hgetallSync(key) as T | null;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let removed = 0;
    for (const field of fields) {
      if (hash.delete(field)) removed += 1;
    }
    return removed;
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const hash = this.hashes.get(key) || new Map<string, string>();
    const next = (Number.parseInt(hash.get(field) || "0", 10) || 0) + increment;
    hash.set(field, String(next));
    this.hashes.set(key, hash);
    return next;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) || [];
    list.push(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) || [];
    list.unshift(...values.reverse());
    this.lists.set(key, list);
    return list.length;
  }

  async lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]> {
    const list = this.lists.get(key) || [];
    const normalizedStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normalizedStop = stop < 0 ? list.length + stop : stop;
    return list.slice(normalizedStart, normalizedStop + 1) as T[];
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    const list = this.lists.get(key) || [];
    const normalizedStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normalizedStop = stop < 0 ? list.length + stop : stop;
    this.lists.set(key, list.slice(normalizedStart, normalizedStop + 1));
    return "OK";
  }

  async llen(key: string): Promise<number> {
    return (this.lists.get(key) || []).length;
  }

  pipeline(): FakeRedisPipeline {
    return new FakeRedisPipeline(this);
  }
}
