import { afterAll, afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as actualRedis from "../../../api/_utils/redis.js";
import { FakeRedis } from "../../helpers/fake-redis";
import * as RateLimit from "../../../api/_utils/_rate-limit.js";
import handler from "../../../api/link-preview.js";
import type { ApiRequest, ApiResponse } from "../../../api/_utils/api-types.js";

// CI has no Redis: hand the handler an in-memory client. Bun module mocks are
// global across files in a run and patch the imported namespace in place, so
// restore from a copy taken before mocking.
const realRedis = { ...actualRedis };
mock.module("../../../api/_utils/redis.js", () => ({
  ...realRedis,
  getRedisBackend: () => "upstash-rest",
  createRedis: () => new FakeRedis(),
}));

afterAll(() => {
  mock.module("../../../api/_utils/redis.js", () => realRedis);
});

function makeReq(url: string): ApiRequest {
  return {
    method: "GET",
    url: `/api/link-preview?url=${encodeURIComponent(url)}`,
    headers: { origin: "http://localhost:3000" },
    query: { url },
    cookies: {},
    body: undefined,
    socket: { remoteAddress: "203.0.113.7" },
  } as unknown as ApiRequest;
}

function makeRes() {
  const state: { status: number; body: unknown; headers: Record<string, string> } = {
    status: 200,
    body: undefined,
    headers: {},
  };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return state.headers[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete state.headers[name.toLowerCase()];
    },
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    send(body: unknown) {
      state.body = body;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res: res as unknown as ApiResponse, state };
}

describe("link-preview rate limiter failure", () => {
  afterEach(() => {
    (RateLimit.checkCounterLimit as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  test("returns 503 instead of fetching when the limiter throws", async () => {
    const spy = spyOn(RateLimit, "checkCounterLimit").mockRejectedValue(
      new Error("redis unavailable")
    );
    const { res, state } = makeRes();

    await handler(makeReq("https://example.com/"), res);

    expect(spy).toHaveBeenCalled();
    expect(state.status).toBe(503);
    expect(state.body).toMatchObject({ error: "rate_limit_unavailable" });
  });

  test("an unparseable url still reaches the limiter and then fails validation", async () => {
    spyOn(RateLimit, "checkCounterLimit").mockResolvedValue({
      allowed: true,
      count: 1,
      limit: 10,
      remaining: 9,
      windowSeconds: 60,
      resetSeconds: 60,
    } as Awaited<ReturnType<typeof RateLimit.checkCounterLimit>>);
    const { res, state } = makeRes();

    await handler(makeReq("not a url"), res);

    expect(state.status).toBe(400);
  });
});
