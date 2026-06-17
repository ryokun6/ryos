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

  expire(key: string, seconds: number): this {
    this.operations.push(() => this.redis.expireSync(key, seconds));
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
  /** Sorted sets: key → (member → score). */
  readonly zsets = new Map<string, Map<string, number>>();
  /** Recorded TTLs (seconds); FakeRedis never actually expires keys. */
  readonly ttls = new Map<string, number>();

  allKeys(): string[] {
    return [
      ...new Set([
        ...this.kv.keys(),
        ...this.sets.keys(),
        ...this.hashes.keys(),
        ...this.lists.keys(),
        ...this.zsets.keys(),
      ]),
    ];
  }

  private hasKey(key: string): boolean {
    return (
      this.kv.has(key) ||
      this.sets.has(key) ||
      this.hashes.has(key) ||
      this.lists.has(key) ||
      this.zsets.has(key)
    );
  }

  // --- sync helpers ---------------------------------------------------------

  setSync(key: string, value: unknown, options?: FakeRedisSetOptions): unknown {
    if (options?.nx && this.kv.has(key)) {
      return null;
    }
    this.kv.set(key, serialize(value));
    if (options?.ex) {
      this.ttls.set(key, options.ex);
    } else {
      this.ttls.delete(key);
    }
    return "OK";
  }

  delSync(...keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.kv.delete(key)) deleted += 1;
      if (this.sets.delete(key)) deleted += 1;
      if (this.hashes.delete(key)) deleted += 1;
      if (this.lists.delete(key)) deleted += 1;
      if (this.zsets.delete(key)) deleted += 1;
      this.ttls.delete(key);
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

  expireSync(key: string, seconds: number): number {
    if (!this.hasKey(key)) return 0;
    this.ttls.set(key, seconds);
    return 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.expireSync(key, seconds);
  }

  async persist(key: string): Promise<number> {
    if (!this.ttls.has(key)) return 0;
    this.ttls.delete(key);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    if (!this.hasKey(key)) return -2;
    return this.ttls.get(key) ?? -1;
  }

  async type(key: string): Promise<string> {
    if (this.kv.has(key)) return "string";
    if (this.sets.has(key)) return "set";
    if (this.hashes.has(key)) return "hash";
    if (this.lists.has(key)) return "list";
    if (this.zsets.has(key)) return "zset";
    return "none";
  }

  async scan(
    cursor: number | string,
    options?: { match?: string; count?: number }
  ): Promise<[string, string[]]> {
    const all = this.allKeys().sort();
    const pattern = options?.match
      ? new RegExp(
          `^${options.match.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
        )
      : null;
    const start = Number.parseInt(String(cursor), 10) || 0;
    const count = options?.count ?? 10;
    const window = all.slice(start, start + count);
    const matched = pattern ? window.filter((key) => pattern.test(key)) : window;
    const next = start + count >= all.length ? "0" : String(start + count);
    return [next, matched];
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

  // --- sorted sets ----------------------------------------------------------

  /** Members ordered by score ascending, ties broken lexicographically. */
  private zsorted(key: string): string[] {
    const zset = this.zsets.get(key);
    if (!zset) return [];
    return [...zset.entries()]
      .sort((a, b) => (a[1] - b[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([member]) => member);
  }

  async zadd(
    key: string,
    entry: { score: number; member: string }
  ): Promise<number> {
    const zset = this.zsets.get(key) || new Map<string, number>();
    const isNew = !zset.has(entry.member);
    zset.set(entry.member, entry.score);
    this.zsets.set(key, zset);
    return isNew ? 1 : 0;
  }

  async zrem(key: string, member: string): Promise<number> {
    const zset = this.zsets.get(key);
    if (!zset) return 0;
    const removed = zset.delete(member) ? 1 : 0;
    if (zset.size === 0) this.zsets.delete(key);
    return removed;
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: { withScores?: boolean }
  ): Promise<string[]> {
    const ordered = this.zsorted(key);
    const normalizedStart = start < 0 ? Math.max(0, ordered.length + start) : start;
    const normalizedStop = stop < 0 ? ordered.length + stop : stop;
    const members = ordered.slice(normalizedStart, normalizedStop + 1);
    if (!options?.withScores) {
      return members;
    }
    const zset = this.zsets.get(key) || new Map<string, number>();
    return members.flatMap((member) => [member, String(zset.get(member) ?? 0)]);
  }

  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number> {
    const zset = this.zsets.get(key);
    if (!zset) return 0;
    const lo = min === "-inf" ? -Infinity : Number(min);
    const hi = max === "+inf" ? Infinity : Number(max);
    let removed = 0;
    for (const [member, score] of [...zset.entries()]) {
      if (score >= lo && score <= hi) {
        zset.delete(member);
        removed += 1;
      }
    }
    if (zset.size === 0) this.zsets.delete(key);
    return removed;
  }

  pipeline(): FakeRedisPipeline {
    return new FakeRedisPipeline(this);
  }
}
