#!/usr/bin/env bun
/**
 * Production shape behind Cloudflare + Traefik: both hosts reach the same
 * server with their Host header intact. os.ryo.lu bounces proxy navigations
 * to the isolated host, the isolated host only renders proxied pages, every
 * proxy response is sandboxed and framable by ryOS origins only, and without
 * IE_PROXY_ORIGIN nothing redirects.
 */
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import * as RateLimit from "../../../api/_utils/_rate-limit.js";
import handler from "../../../api/iframe-check.js";
import { buildSetAuthCookie } from "../../../api/_utils/_cookie.js";
import { buildClientRuntimeConfig } from "../../../api/_utils/runtime-config.js";
import type { ApiRequest, ApiResponse } from "../../../api/_utils/api-types.js";

const ENV_KEYS = [
  "API_RUNTIME_ENV",
  "API_ALLOWED_ORIGINS",
  "APP_PUBLIC_ORIGIN",
  "IE_PROXY_ORIGIN",
] as const;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function setProduction(proxyOrigin: string | null) {
  process.env.API_RUNTIME_ENV = "production";
  process.env.API_ALLOWED_ORIGINS = "*.ryo.lu,https://ryo.lu"; // pragma: allowlist secret
  process.env.APP_PUBLIC_ORIGIN = "https://os.ryo.lu";
  if (proxyOrigin) process.env.IE_PROXY_ORIGIN = proxyOrigin;
  else delete process.env.IE_PROXY_ORIGIN;
}

const FRAME = "abcdefghijklmnopqrst.1761140000000";
const PROXY_PATH = `/api/iframe-check?url=${encodeURIComponent(
  "https://example.com/"
)}&theme=macosx&ieFrame=${FRAME}`;

function makeReq(
  host: string,
  url: string,
  headers: Record<string, string> = {}
): ApiRequest {
  const query = Object.fromEntries(new URL(url, "http://x").searchParams.entries());
  return {
    method: "GET",
    url,
    headers: { host, "sec-fetch-dest": "iframe", ...headers },
    query,
    cookies: {},
    body: undefined,
    socket: { remoteAddress: "203.0.113.9" },
  } as unknown as ApiRequest;
}

function makeRes() {
  const state: { status: number; body: unknown; headers: Record<string, string> } = {
    status: 200,
    body: undefined,
    headers: {},
  };
  const res = {
    setHeader(name: string, value: string | string[]) {
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

function frameAncestors(csp: string | undefined): string[] {
  const directive = (csp || "")
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("frame-ancestors"));
  return directive ? directive.split(/\s+/).slice(1) : [];
}

/** Stops the handler right after the redirect decision, before any fetch. */
function stubLimiterDenied() {
  return spyOn(RateLimit, "checkCounterLimit").mockResolvedValue({
    allowed: false,
    count: 999,
    limit: 1,
    remaining: 0,
    windowSeconds: 60,
    resetSeconds: 60,
  } as Awaited<ReturnType<typeof RateLimit.checkCounterLimit>>);
}

afterEach(() => {
  (RateLimit.checkCounterLimit as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe("IE proxy behind Cloudflare + Traefik", () => {
  test("os.ryo.lu redirects proxy navigations to the isolated host", async () => {
    setProduction("https://ieproxy.ryo.lu");
    const { res, state } = makeRes();
    await handler(
      makeReq("os.ryo.lu", PROXY_PATH, { referer: "https://os.ryo.lu/" }),
      res
    );
    expect(state.status).toBe(302);
    expect(state.headers.location).toBe(`https://ieproxy.ryo.lu${PROXY_PATH}`);
    expect(state.headers["content-security-policy"]).toContain("sandbox allow-scripts");
    expect(state.headers["content-security-policy"]).not.toContain("allow-same-origin");
  });

  test("the isolated host renders the proxy without redirecting, sandboxed", async () => {
    setProduction("https://ieproxy.ryo.lu");
    stubLimiterDenied();
    const { res, state } = makeRes();
    await handler(
      makeReq("ieproxy.ryo.lu", PROXY_PATH, { referer: "https://os.ryo.lu/" }),
      res
    );
    expect(state.status).toBe(429);
    expect(state.headers.location).toBeUndefined();
    const csp = state.headers["content-security-policy"];
    expect(csp).toContain("sandbox allow-scripts allow-forms allow-popups allow-pointer-lock");
    expect(csp).not.toContain("allow-same-origin");
    const ancestors = frameAncestors(csp);
    expect(ancestors).toContain("https://os.ryo.lu");
    expect(ancestors).toContain("https://*.ryo.lu"); // pragma: allowlist secret
    expect(ancestors).toContain("https://ryo.lu");
    expect(ancestors).not.toContain("*");
    // Only the trusted app may read isolated-host responses; never a wildcard.
    expect(state.headers["access-control-allow-origin"]).toBe("https://os.ryo.lu");
  });

  test("dev and preview parents are framing-allowed on the isolated host", async () => {
    setProduction("https://ieproxy.ryo.lu");
    stubLimiterDenied();
    for (const parent of ["https://dev.ryo.lu", "https://pr-7-preview.os.ryo.lu"]) { // pragma: allowlist secret
      const { res, state } = makeRes();
      await handler(makeReq("ieproxy.ryo.lu", PROXY_PATH, { referer: `${parent}/` }), res);
      expect(state.status).toBe(429);
      // A CSP wildcard host-source matches subdomains at any depth.
      expect(frameAncestors(state.headers["content-security-policy"])).toContain(
        "https://*.ryo.lu" // pragma: allowlist secret
      );
    }
  });

  test("the isolated host refuses non-proxy modes", async () => {
    setProduction("https://ieproxy.ryo.lu");
    for (const mode of ["check", "ai", "list-cache"]) {
      const { res, state } = makeRes();
      await handler(
        makeReq(
          "ieproxy.ryo.lu",
          `/api/iframe-check?mode=${mode}&url=${encodeURIComponent("https://example.com")}`,
          { origin: "null" }
        ),
        res
      );
      expect([mode, state.status]).toEqual([mode, 404]);
    }
  });

  test("requests from the isolated origin to os.ryo.lu are rejected", async () => {
    setProduction("https://ieproxy.ryo.lu");
    const { res, state } = makeRes();
    await handler(
      makeReq("os.ryo.lu", `/api/iframe-check?mode=check&url=${encodeURIComponent("https://example.com")}`, {
        origin: "https://ieproxy.ryo.lu",
      }),
      res
    );
    expect(state.status).toBe(403);
  });

  test("without IE_PROXY_ORIGIN, os.ryo.lu serves the stripped proxy itself", async () => {
    setProduction(null);
    stubLimiterDenied();
    const { res, state } = makeRes();
    await handler(
      makeReq("os.ryo.lu", PROXY_PATH, { referer: "https://os.ryo.lu/" }),
      res
    );
    expect(state.status).toBe(429);
    expect(state.headers.location).toBeUndefined();
    expect(state.headers["content-security-policy"]).toContain("sandbox allow-scripts");
  });

  test("runtime config exposes the isolated origin, or null when unset", () => {
    setProduction("https://ieproxy.ryo.lu/");
    expect(buildClientRuntimeConfig().ieProxyOrigin).toBe("https://ieproxy.ryo.lu");
    setProduction(null);
    expect(buildClientRuntimeConfig().ieProxyOrigin).toBeNull();
  });

  test("ryos_auth is host-only, so the isolated host never receives it", () => {
    setProduction("https://ieproxy.ryo.lu");
    const cookie = buildSetAuthCookie("alice", "token");
    expect(cookie).toStartWith("ryos_auth=");
    expect(cookie.toLowerCase()).not.toContain("domain=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api");
    expect(cookie).toContain("Secure");
  });
});
