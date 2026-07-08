/**
 * Optional auth must not block anonymous clients that still send stale cookies.
 */

import { describe, expect, test } from "bun:test";
import type { ApiRequest } from "../../../api/_utils/api-types";
import type { Redis } from "../../../api/_utils/redis.js";
import { resolveRequestAuth } from "../../../api/_utils/request-auth.js";

function mockRequest(headers: Record<string, string>): ApiRequest {
  return { headers } as ApiRequest;
}

/** Minimal Redis stub — invalid tokens never match canonical/grace lookups. */
const redisStub = {
  exists: async () => 0,
  smembers: async () => [],
  get: async () => null,
  expire: async () => 1,
} as unknown as Redis;

describe("resolveRequestAuth", () => {
  test("invalid cookie on optional route resolves as anonymous", async () => {
    const result = await resolveRequestAuth(
      mockRequest({
        cookie: "ryos_auth=staleuser%3Anot-a-valid-session-token",
      }),
      redisStub,
      { required: false }
    );

    expect(result.error).toBeNull();
    expect(result.user).toBeNull();
  });

  test("invalid Authorization header on optional route resolves as anonymous", async () => {
    const result = await resolveRequestAuth(
      mockRequest({
        authorization: "Bearer not-a-valid-session-token",
        "x-username": "staleuser",
      }),
      redisStub,
      { required: false }
    );

    expect(result.error).toBeNull();
    expect(result.user).toBeNull();
  });

  test("partial Authorization header on optional route resolves as anonymous", async () => {
    const result = await resolveRequestAuth(
      mockRequest({
        authorization: "Bearer stale-session-token",
      }),
      redisStub,
      { required: false }
    );

    expect(result.error).toBeNull();
    expect(result.user).toBeNull();
  });

  test("partial credentials on required route return 400", async () => {
    const result = await resolveRequestAuth(
      mockRequest({
        authorization: "Bearer stale-session-token",
      }),
      redisStub,
      { required: true }
    );

    expect(result.error?.status).toBe(400);
    expect(result.error?.error).toContain("Both Authorization and X-Username");
    expect(result.user).toBeNull();
  });

  test("invalid credentials on required route returns 401", async () => {
    const result = await resolveRequestAuth(
      mockRequest({
        authorization: "Bearer not-a-valid-session-token",
        "x-username": "staleuser",
      }),
      redisStub,
      { required: true }
    );

    expect(result.error?.status).toBe(401);
    expect(result.error?.error).toContain("invalid token");
    expect(result.user).toBeNull();
  });
});
