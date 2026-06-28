import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import { withSessionMutationLock } from "../api/listen/_helpers/_redis";
import { redisKeys } from "../src/shared/redisKeys";

function createLockRedis(): {
  redis: Redis;
  replaceLock: (key: string, owner: string) => void;
  readLock: (key: string) => string | undefined;
} {
  const values = new Map<string, string>();
  const redis = {
    async set(
      key: string,
      value: unknown,
      options?: { nx?: boolean; ex?: number }
    ): Promise<unknown> {
      if (options?.nx && values.has(key)) return null;
      values.set(key, String(value));
      return "OK";
    },
    async eval(
      _script: string,
      keys: string[],
      args: Array<string | number>
    ): Promise<number> {
      const key = keys[0];
      if (key && values.get(key) === String(args[0])) {
        values.delete(key);
        return 1;
      }
      return 0;
    },
  } as unknown as Redis;
  return {
    redis,
    replaceLock: (key, owner) => values.set(key, owner),
    readLock: (key) => values.get(key),
  };
}

describe("listen session mutation lock", () => {
  test("serializes concurrent whole-session mutations", async () => {
    const { redis } = createLockRedis();
    const state = { count: 0 };

    await Promise.all(
      Array.from({ length: 25 }, () =>
        withSessionMutationLock("session-a", redis, async () => {
          const previous = state.count;
          await new Promise<void>((resolve) => setTimeout(resolve, 2));
          state.count = previous + 1;
        })
      )
    );

    expect(state.count).toBe(25);
  });

  test("never releases a successor's lock", async () => {
    const lockRedis = createLockRedis();
    const lockKey = redisKeys.session.listenLock("session-b");

    await withSessionMutationLock("session-b", lockRedis.redis, async () => {
      lockRedis.replaceLock(lockKey, "successor");
    });

    expect(lockRedis.readLock(lockKey)).toBe("successor");
  });
});
