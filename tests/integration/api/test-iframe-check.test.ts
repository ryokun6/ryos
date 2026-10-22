#!/usr/bin/env bun
/**
 * Tests for /api/iframe-check endpoint
 * Tests: check mode, proxy mode, AI cache mode, list-cache mode
 */

import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  getTokenFromAuthCookie,
} from "../../helpers/test-utils";

/** Admin session for the gated debug features; null when the env can't provide it. */
async function getAdminToken(): Promise<string | null> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ryo", password: "testtest" }),
  });
  if (!res.ok) return null;
  return getTokenFromAuthCookie(res);
}

const adminToken = await getAdminToken();

describe("iframe-check", () => {
  describe("Input Validation", () => {
    test("Missing URL parameter", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/iframe-check`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("url");
    });

    test("URL without protocol", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=example.com&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(true);
    });
  });

  describe("Check Mode", () => {
    test("Check mode - allowed site", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(true);
    });

    test("Check mode - auto-proxied site", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://youtube.com&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(false);
    });

    test("Check mode - auto-proxy domain", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://en.wikipedia.org&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(false);
      expect(data.reason).toContain("Auto-proxied");
    });
  });

  describe("Proxy Mode", () => {
    test("Proxy mode - success", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy`
      );
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("<base href=");
    });

    test("Proxy mode - title extraction", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy`
      );
      expect(res.status).toBe(200);
      const title = res.headers.get("X-Proxied-Page-Title");
      expect(title).not.toBeNull();
      expect(decodeURIComponent(title ?? "")).toContain("Example");
    });

    test("Proxy mode - theme parameter", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy&theme=macosx`
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      // The macosx theme suppresses the pixel-font override that other themes
      // inject (shouldInjectFontOverrides = theme !== "macosx").
      expect(html).not.toContain("Geneva-12");
    });

    test("Proxy mode - invalid URL", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://this-domain-does-not-exist-xyz123.com&mode=proxy`
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test("Default mode is proxy", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com`
      );
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type") || "";
      // Default mode is proxy, which streams the rewritten HTML document.
      expect(contentType).toContain("text/html");
    });

    test("Proxy mode - document is sandboxed and never same-origin", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&ieFrame=abcdefghijklmnopqrst.1761140000000`
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
      const csp = res.headers.get("content-security-policy") || "";
      expect(csp).toMatch(/(^|;\s*)sandbox [^;]*allow-scripts/);
      expect(csp).not.toContain("allow-same-origin");
      expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
      expect(csp).toContain("frame-ancestors 'self' https://ryo.lu https://*.ryo.lu"); // pragma: allowlist secret
      const html = await res.text();
      const nonce = csp.match(/'nonce-([A-Za-z0-9_-]+)'/)?.[1];
      expect(html).toContain(`<script nonce="${nonce}">`);
      expect(html).toContain('"abcdefghijklmnopqrst.1761140000000"');
    });

    test("Proxy mode - strips upstream scripts and inline handlers", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent("https://httpbin.org/")}`
      );
      expect(res.status).toBe(200);
      const csp = res.headers.get("content-security-policy") || "";
      const nonce = csp.match(/'nonce-([A-Za-z0-9_-]+)'/)?.[1];
      expect(nonce).toBeTruthy();
      const html = await res.text();
      const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
      expect(scriptTags.length).toBeGreaterThan(0);
      for (const tag of scriptTags) {
        expect(tag).toContain(`nonce="${nonce}"`);
      }
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(res.headers.get("x-ie-proxy") || "").toContain("scriptsStripped=1");
    });

    test("Proxy mode - iframe navigation errors are an HTML page that reports to the parent", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://this-domain-does-not-exist-xyz123.com&ieFrame=abcdefghijklmnopqrst.1`,
        { headers: { "Sec-Fetch-Dest": "iframe" } }
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.get("content-type") || "").toContain("text/html");
      const html = await res.text();
      expect(html).toContain('"type":"iframeProxyError"');
      expect(html).toContain('"ieFrame":"abcdefghijklmnopqrst.1"');
    });
  });

  describe("AI Cache Mode", () => {
    test("AI mode - missing year", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=ai`
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("year");
    });

    test("AI mode - invalid year", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=ai&year=invalid`
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("year");
    });

    test("AI mode - cache miss", async () => {
      const randomUrl = `https://example.com/test-${Date.now()}`;
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(randomUrl)}&mode=ai&year=2020`
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.aiCache).toBe(false);
    });
  });

  describe("List Cache Mode", () => {
    test("List cache mode", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=list-cache`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.years)).toBe(true);
    });
  });

  describe("Raw Sub-resource Proxy", () => {
    test("raw=1 returns upstream untouched (no interceptor/base injection)", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?raw=1&url=https://example.com`
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      // Raw mode must NOT inject our <base> tag or navigation interceptor.
      expect(html).toContain("Example Domain");
      expect(html).not.toContain("<base href=");
      expect(html).not.toContain("Save real parent reference");
    });

    test("raw=1 never reflects active upstream content types", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?raw=1&url=https://example.com`
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const csp = res.headers.get("content-security-policy") || "";
      expect(csp).toContain("sandbox");
      expect(csp).not.toContain("allow-same-origin");
      expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
      await res.text();
    });

    test("raw proxy forwards POST body to upstream", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?raw=1&url=${encodeURIComponent(
          "https://httpbin.org/post"
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ryos: "test" }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      // httpbin echoes the raw body back under `data`.
      expect(data.data).toContain("ryos");
    });
  });

  describe("Embed Cache", () => {
    test("check mode exposes embed cache header and warms on repeat", async () => {
      // The verdict is cached per host, so prime it then assert the repeat
      // is served from cache (first call may already be warm from prior tests).
      const url = "https://example.com";
      const first = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          url
        )}&mode=check`
      );
      expect(first.status).toBe(200);
      expect(["HIT", "MISS"]).toContain(first.headers.get("x-embed-cache"));

      const second = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          url
        )}&mode=check`
      );
      expect(second.status).toBe(200);
      // Same host → embeddability verdict is served from cache.
      expect(second.headers.get("x-embed-cache")).toBe("HIT");
    });
  });

  describe("Proxy diagnostics + session gating", () => {
    test("proxy response exposes X-IE-Proxy diagnostics header", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com"
        )}`
      );
      expect(res.status).toBe(200);
      const diag = res.headers.get("x-ie-proxy");
      expect(diag).toBeTruthy();
      // Shape: cookies=N;headless=0|1;status=NNN;blocked=0|1;scriptsStripped=0|1;lite=0|1
      expect(diag).toContain("cookies=");
      expect(diag).toContain("headless=");
      expect(diag).toContain("status=");
      expect(diag).toContain("scriptsStripped=");
      expect(diag).toContain("lite=");
      // example.com is small, so lite mode stays off. Scripts are stripped
      // whenever the page has any (same-origin proxy mode).
      expect(diag).toMatch(/scriptsStripped=[01]/);
      expect(diag).toContain("lite=0");
    });

    test("does not arm proxy sessions without env/admin/debug opt-in", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com"
        )}`
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).not.toContain("ie_psid=");
    });

    test("does not arm sessions with dbg=1 unless sessions are requested", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?dbg=1&url=${encodeURIComponent(
          "https://example.com"
        )}`
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).not.toContain("ie_psid=");
    });

    test("dbg=1 no longer grants debug features to anonymous callers", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?ieSessions=1&dbg=1&url=${encodeURIComponent(
          "https://example.com"
        )}`
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).not.toContain("ie_psid=");
    });

    test("does not arm sessions for a signed-in non-admin user", async () => {
      const username = `iesess_${Date.now()}`;
      const token = await ensureUserAuth(username, "testpassword123");
      expect(token).toBeTruthy();
      const res = await fetchWithAuth(
        `${BASE_URL}/api/iframe-check?ieSessions=1&url=${encodeURIComponent(
          "https://example.com"
        )}`,
        username,
        token as string
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).not.toContain("ie_psid=");
    });

    test.skipIf(!adminToken)(
      "arms proxy sessions on a top-level GET when the ryo admin opts in",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/iframe-check?ieSessions=1&url=${encodeURIComponent(
            "https://example.com"
          )}`,
          "ryo",
          adminToken as string
        );
        expect(res.status).toBe(200);
        const setCookie = res.headers.get("set-cookie") || "";
        expect(setCookie).toContain("ie_psid=");
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("Path=/api");
      }
    );

    test("does not arm sessions for raw sub-resource requests even when opted in", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?raw=1&ieSessions=1&url=${encodeURIComponent(
          "https://example.com"
        )}`
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).not.toContain("ie_psid=");
    });
  });
});
