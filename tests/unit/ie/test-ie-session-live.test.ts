#!/usr/bin/env bun
/**
 * Unit tests for the optional, env-gated IE proxy helpers:
 *   - `api/_utils/_ie-live.ts`    — "live browser" capability + URL builder
 *   - `api/_utils/_ie-session.ts` — cookie/session passthrough jar
 *
 * Pure config / parsing / jar logic; no API server or real Redis required.
 */
import { describe, test, expect, afterEach } from "bun:test";
import type { ApiRequest, ApiResponse } from "../../../api/_utils/api-types";
import type { Redis } from "../../../api/_utils/redis.ts";
import {
  isIeLiveBrowserConfigured,
  buildLiveViewUrl,
} from "../../../api/_utils/_ie-live.ts";
import {
  areIeProxySessionsEnabled,
  readIeSessionId,
  ensureIeSessionCookie,
  loadIeCookieHeader,
  saveIeCookies,
} from "../../../api/_utils/_ie-session.ts";

const LIVE_ENV = ["IE_LIVE_BROWSER", "IE_LIVE_VIEW_URL_TEMPLATE"];
const SESSION_ENV = ["IE_PROXY_SESSIONS"];

function clearEnv(keys: string[]) {
  for (const key of keys) delete process.env[key];
}

/** Minimal in-memory Redis double supporting just get/set (object values). */
function makeFakeRedis(): Redis {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => (store.has(key) ? store.get(key) : null),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    },
  } as unknown as Redis;
}

function makeReq(cookieHeader?: string): ApiRequest {
  return {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  } as unknown as ApiRequest;
}

function makeRes() {
  const headers = new Map<string, string | string[]>();
  const res = {
    getHeader: (name: string) => headers.get(name),
    setHeader: (name: string, value: string | string[]) => {
      headers.set(name, value);
    },
  } as unknown as ApiResponse;
  return { res, headers };
}

describe("ie-live config", () => {
  afterEach(() => clearEnv(LIVE_ENV));

  test("not configured by default", () => {
    clearEnv(LIVE_ENV);
    expect(isIeLiveBrowserConfigured()).toBe(false);
    expect(buildLiveViewUrl("https://example.com")).toBeNull();
  });

  test("flag without template stays disabled", () => {
    clearEnv(LIVE_ENV);
    process.env.IE_LIVE_BROWSER = "1";
    expect(isIeLiveBrowserConfigured()).toBe(false);
  });

  test("flag + template enables and substitutes placeholders", () => {
    clearEnv(LIVE_ENV);
    process.env.IE_LIVE_BROWSER = "true";
    process.env.IE_LIVE_VIEW_URL_TEMPLATE =
      "https://live.test/view?u={url}&raw={rawUrl}";
    expect(isIeLiveBrowserConfigured()).toBe(true);
    const built = buildLiveViewUrl("https://example.com/a b");
    expect(built).toBe(
      "https://live.test/view?u=" +
        encodeURIComponent("https://example.com/a b") +
        "&raw=https://example.com/a b"
    );
  });
});

describe("ie-session config + cookie parsing", () => {
  afterEach(() => clearEnv(SESSION_ENV));

  test("disabled by default", () => {
    clearEnv(SESSION_ENV);
    expect(areIeProxySessionsEnabled()).toBe(false);
  });

  test("enabled via env flag", () => {
    process.env.IE_PROXY_SESSIONS = "1";
    expect(areIeProxySessionsEnabled()).toBe(true);
  });

  test("readIeSessionId parses a valid id and rejects malformed ones", () => {
    const valid = "abcdefgh-1234-5678";
    expect(readIeSessionId(makeReq(`ie_psid=${valid}; other=x`))).toBe(valid);
    // too short / contains illegal chars => rejected
    expect(readIeSessionId(makeReq("ie_psid=short"))).toBeNull();
    expect(readIeSessionId(makeReq("ie_psid=has space here xx"))).toBeNull();
    expect(readIeSessionId(makeReq())).toBeNull();
  });

  test("ensureIeSessionCookie reuses existing id, else mints + sets cookie", () => {
    const existing = "existing-session-id-1234";
    const { res } = makeRes();
    expect(ensureIeSessionCookie(makeReq(`ie_psid=${existing}`), res)).toBe(
      existing
    );

    const { res: res2, headers } = makeRes();
    const minted = ensureIeSessionCookie(makeReq(), res2);
    expect(minted).toMatch(/^[a-f0-9-]{8,}$/);
    const setCookie = headers.get("Set-Cookie");
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toContain(`ie_psid=${minted}`);
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("Path=/api");
    expect(cookieStr).toContain("SameSite=Lax");
  });
});

describe("ie-session cookie jar round-trip", () => {
  test("save then load returns Cookie header scoped to host", async () => {
    const redis = makeFakeRedis();
    const psid = "round-trip-session-id";
    const url = "https://app.example.com/login";

    expect(await loadIeCookieHeader(redis, psid, url)).toBeNull();

    await saveIeCookies(redis, psid, url, [
      "sid=abc123; Path=/; HttpOnly",
      "theme=dark; Path=/",
    ]);

    const header = await loadIeCookieHeader(redis, psid, url);
    expect(header).toContain("sid=abc123");
    expect(header).toContain("theme=dark");

    // A different host must NOT see the first host's cookies.
    expect(
      await loadIeCookieHeader(redis, psid, "https://other.example.org/")
    ).toBeNull();
  });

  test("expired Set-Cookie removes the cookie from the jar", async () => {
    const redis = makeFakeRedis();
    const psid = "expiry-session-id";
    const url = "https://shop.example.com/";

    await saveIeCookies(redis, psid, url, ["sid=keepme; Path=/"]);
    expect(await loadIeCookieHeader(redis, psid, url)).toContain("sid=keepme");

    await saveIeCookies(redis, psid, url, [
      "sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
    expect(await loadIeCookieHeader(redis, psid, url)).toBeNull();
  });
});
