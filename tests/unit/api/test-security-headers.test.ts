import { afterEach, describe, expect, test } from "bun:test";

import {
  applySecurityHeaders,
  getDocumentFrameAncestors,
} from "../../../api/_utils/_security-headers.js";

const ENV_KEYS = ["APP_HSTS", "APP_FRAME_ANCESTORS"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const RYO_WILDCARD = "https://*.ryo.lu"; // pragma: allowlist secret

describe("applySecurityHeaders", () => {
  test("adds nosniff, referrer policy and frame-ancestors", () => {
    const res = applySecurityHeaders(
      new Response("ok"),
      new Request("http://localhost:3000/")
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(res.headers.get("content-security-policy")).toBe(
      `frame-ancestors 'self' https://ryo.lu ${RYO_WILDCARD}`
    );
    expect(res.headers.get("x-frame-options")).toBeNull();
  });

  test("sends HSTS only for HTTPS requests unless overridden", () => {
    delete process.env.APP_HSTS;
    const plain = applySecurityHeaders(
      new Response("ok"),
      new Request("http://localhost:3000/")
    );
    expect(plain.headers.get("strict-transport-security")).toBeNull();

    const forwarded = applySecurityHeaders(
      new Response("ok"),
      new Request("http://localhost:3000/", {
        headers: { "x-forwarded-proto": "https" },
      })
    );
    expect(forwarded.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains"
    );

    process.env.APP_HSTS = "0";
    const disabled = applySecurityHeaders(
      new Response("ok"),
      new Request("https://os.ryo.lu/")
    );
    expect(disabled.headers.get("strict-transport-security")).toBeNull();
  });

  test("keeps a route's own CSP frame-ancestors and appends when missing", () => {
    const own = applySecurityHeaders(
      new Response("ok", {
        headers: { "Content-Security-Policy": "sandbox; frame-ancestors 'none'" },
      }),
      new Request("http://localhost:3000/")
    );
    expect(own.headers.get("content-security-policy")).toBe(
      "sandbox; frame-ancestors 'none'"
    );

    const appended = applySecurityHeaders(
      new Response("ok", {
        headers: { "Content-Security-Policy": "object-src 'none'" },
      }),
      new Request("http://localhost:3000/")
    );
    expect(appended.headers.get("content-security-policy")).toBe(
      `object-src 'none'; frame-ancestors 'self' https://ryo.lu ${RYO_WILDCARD}`
    );
  });

  test("does not override route-chosen nosniff / referrer values", () => {
    const res = applySecurityHeaders(
      new Response("ok", { headers: { "Referrer-Policy": "no-referrer" } }),
      new Request("http://localhost:3000/")
    );
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("handles immutable redirect responses", () => {
    const res = applySecurityHeaders(
      Response.redirect("https://os.ryo.lu/docs/overview", 302),
      new Request("http://localhost:3000/docs")
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://os.ryo.lu/docs/overview");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("getDocumentFrameAncestors", () => {
  test("accepts explicit extra origins and ignores wildcards-for-all", () => {
    process.env.APP_FRAME_ANCESTORS = "https://example.com, *, javascript:alert(1)";
    expect(getDocumentFrameAncestors()).toEqual([
      "'self'",
      "https://ryo.lu",
      RYO_WILDCARD,
      "https://example.com",
    ]);
  });
});
