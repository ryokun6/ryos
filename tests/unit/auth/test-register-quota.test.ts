import { describe, expect, test } from "bun:test";
import {
  consumeRegistrationAttempt,
  consumeRegistrationCreate,
  REGISTER_ATTEMPT_BLOCK_SECONDS,
  REGISTER_ATTEMPT_LIMIT,
  REGISTER_DEVICE_CREATE_BLOCK_SECONDS,
  REGISTER_DEVICE_CREATE_LIMIT,
  REGISTER_IP_CREATE_BLOCK_SECONDS,
  REGISTER_IP_CREATE_LIMIT,
  type RegisterQuotaRedis,
} from "../../../api/_utils/auth/_register-quota";
import {
  buildSetDeviceCookie,
  createDeviceId,
  parseDeviceCookie,
  prependSetCookie,
} from "../../../api/_utils/_cookie";

type Entry = { value: string; expiresAt: number | null };

function memoryRedis(): RegisterQuotaRedis & {
    clearCounters(): void;
  } {
  const store = new Map<string, Entry>();
  const live = (key: string): Entry | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async get(key) {
      return live(key)?.value ?? null;
    },
    async incr(key) {
      const entry = live(key);
      const next = entry ? Number(entry.value) + 1 : 1;
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },
    async expire(key, seconds) {
      const entry = live(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    async set(key, value, options) {
      store.set(key, {
        value,
        expiresAt: Date.now() + options.ex * 1000,
      });
      return "OK";
    },
    async ttl(key) {
      const entry = live(key);
      if (!entry?.expiresAt) return -1;
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    },
    clearCounters() {
      for (const [key, entry] of store) {
        if (entry.value !== "1") store.delete(key);
      }
    },
  };
}

describe("registration attempt quota", () => {
  test("blocks for a day after the 6-hour attempt window is exceeded", async () => {
    const redis = memoryRedis();
    for (let i = 0; i < REGISTER_ATTEMPT_LIMIT; i++) {
      expect((await consumeRegistrationAttempt(redis, "1.2.3.4")).allowed).toBe(
        true
      );
    }
    const blocked = await consumeRegistrationAttempt(redis, "1.2.3.4");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfter).toBe(REGISTER_ATTEMPT_BLOCK_SECONDS);
    }
  });

  test("keeps the block after the short attempt counter expires", async () => {
    const redis = memoryRedis();
    for (let i = 0; i < REGISTER_ATTEMPT_LIMIT + 1; i++) {
      await consumeRegistrationAttempt(redis, "1.2.3.4");
    }
    redis.clearCounters();
    const stillBlocked = await consumeRegistrationAttempt(redis, "1.2.3.4");
    expect(stillBlocked.allowed).toBe(false);
  });
});

describe("registration create quota", () => {
  test("allows one account per device and two per IP, then blocks", async () => {
    const redis = memoryRedis();
    const deviceA = createDeviceId();
    const deviceB = createDeviceId();
    const deviceC = createDeviceId();

    expect(
      (await consumeRegistrationCreate(redis, "9.9.9.9", deviceA)).allowed
    ).toBe(true);
    const sameDevice = await consumeRegistrationCreate(redis, "8.8.8.8", deviceA);
    expect(sameDevice.allowed).toBe(false);
    if (!sameDevice.allowed) {
      expect(sameDevice.retryAfter).toBe(REGISTER_DEVICE_CREATE_BLOCK_SECONDS);
    }

    expect(
      (await consumeRegistrationCreate(redis, "9.9.9.9", deviceB)).allowed
    ).toBe(true);
    expect(REGISTER_IP_CREATE_LIMIT).toBe(2);
    const thirdIp = await consumeRegistrationCreate(redis, "9.9.9.9", deviceC);
    expect(thirdIp.allowed).toBe(false);
    if (!thirdIp.allowed) {
      expect(thirdIp.retryAfter).toBe(REGISTER_IP_CREATE_BLOCK_SECONDS);
    }
    expect(REGISTER_DEVICE_CREATE_LIMIT).toBe(1);
  });
});

describe("device cookie", () => {
  test("round-trips a device id and ignores a forged value", () => {
    const id = createDeviceId();
    const header = buildSetDeviceCookie(id);
    expect(parseDeviceCookie(header)).toBe(id);
    expect(parseDeviceCookie("ryos_device=not-a-real-id")).toBeNull();
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/api");
  });

  test("prepends the auth cookie ahead of the device cookie", () => {
    const headers: string[] = [];
    const res = {
      getHeader(): string | string[] | undefined {
        return headers.length === 0 ? undefined : [...headers];
      },
      setHeader(_name: string, value: string | string[]) {
        headers.splice(0, headers.length, ...(Array.isArray(value) ? value : [value]));
      },
    };
    const device = buildSetDeviceCookie(createDeviceId());
    res.setHeader("Set-Cookie", device);
    prependSetCookie(res, "ryos_auth=alice:token");
    expect(headers[0]).toBe("ryos_auth=alice:token");
    expect(headers[1]).toBe(device);
  });
});
