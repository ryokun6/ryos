#!/usr/bin/env bun
/**
 * Proxied IE content must never run with the ryOS app origin: active HTML is
 * stripped, proxy responses carry a CSP sandbox, active upstream content
 * types are not reflected, and the parent only trusts frame messages that
 * echo its per-navigation frame id.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { stripActiveHtml, isDangerousUrlAttribute } from "../../../api/_utils/_ie-html.ts";
import {
  IE_PROXY_SANDBOX_TOKENS,
  buildIeNavigationInterceptorScript,
  buildIeProxyCsp,
  buildIeProxyErrorDocument,
  classifyProxiedContentType,
  getIeProxyIsolatedOrigin,
  isIeProxyIsolatedHostHeader,
  isIeProxyIsolatedPathAllowed,
  sanitizeFrameToken,
  toInlineScriptJson,
} from "../../../api/_utils/_ie-proxy.ts";
import {
  IE_PROXY_IFRAME_SANDBOX,
  buildIeFrameId,
  createIeFrameInstanceToken,
  getIeIframeSandbox,
  parseIeFrameMessage,
  withIeFrameId,
} from "../../../src/apps/internet-explorer/utils/ieFrameMessaging.ts";

describe("stripActiveHtml", () => {
  test("removes script, plugin and base elements", () => {
    const { html, removed } = stripActiveHtml(
      `<html><head><base href="https://evil.example/"><script src="/a.js"></script></head><body><p>ok</p><object data="x.swf"></object><embed src="x"><script>alert(1)</script></body></html>`
    );
    expect(html).not.toMatch(/<script|<object|<embed|<base/i);
    expect(html).toContain("<p>ok</p>");
    expect(removed).toBeGreaterThanOrEqual(5);
  });

  test("removes inline event handlers and srcdoc", () => {
    const { html } = stripActiveHtml(
      `<img src="a.png" onerror="alert(1)"><body onload=alert(1)><div OnClick="x()">t</div><iframe srcdoc="<script>alert(1)</script>"></iframe><svg><circle onmouseover="x()"/></svg>`
    );
    expect(html).not.toMatch(/onerror|onload|onclick|onmouseover|srcdoc/i);
    expect(html).toContain('src="a.png"');
  });

  test("removes javascript: and active data: URLs, including obfuscated forms", () => {
    const { html } = stripActiveHtml(
      [
        `<a href="javascript:alert(1)">a</a>`,
        `<a href=" JaVaScRiPt:alert(1)">b</a>`,
        `<a href="java&#x09;script:alert(1)">c</a>`,
        `<a href="javascript&colon;alert(1)">d</a>`,
        `<a href="&#106;avascript:alert(1)">e</a>`,
        `<form action="javascript:alert(1)"><button formaction="vbscript:x">f</button></form>`,
        `<iframe src="data:text/html,<script>alert(1)</script>"></iframe>`,
        `<a href="data:image/svg+xml;base64,PHN2Zz4=">g</a>`,
        `<svg><a xlink:href="javascript:alert(1)">h</a></svg>`,
      ].join("")
    );
    expect(html.toLowerCase()).not.toContain("javascript");
    expect(html.toLowerCase()).not.toContain("vbscript");
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("data:image/svg+xml");
    expect(html).toContain(">a</a>");
  });

  test("keeps passive URLs", () => {
    const { html, removed } = stripActiveHtml(
      `<a href="https://example.com/">x</a><img src="data:image/png;base64,AAAA"><a href="/rel?q=1">y</a>`
    );
    expect(removed).toBe(0);
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  test("removes blocking meta http-equiv and SVG href animations", () => {
    const { html } = stripActiveHtml(
      `<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><meta http-equiv="Content-Security-Policy" content="x"><meta charset="utf-8"><svg><a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="xlink:href" to="javascript:alert(1)"/>t</a></svg>`
    );
    expect(html).not.toMatch(/http-equiv|<animate|<set/i);
    expect(html).toContain('charset="utf-8"');
  });

  test("unwraps noscript and sanitizes its content", () => {
    const { html } = stripActiveHtml(
      `<noscript><p>fallback</p><img src="x" onerror="alert(1)"></noscript>`
    );
    expect(html).toContain("<p>fallback</p>");
    expect(html).not.toContain("noscript");
    expect(html).not.toContain("onerror");
  });

  test("isDangerousUrlAttribute only flags data: documents where they render", () => {
    expect(isDangerousUrlAttribute("img", "src", "data:image/svg+xml,<svg/>")).toBe(false);
    expect(isDangerousUrlAttribute("iframe", "src", "data:image/svg+xml,<svg/>")).toBe(true);
    expect(isDangerousUrlAttribute("a", "href", "data:text/html,x")).toBe(true);
    expect(isDangerousUrlAttribute("img", "src", "https://x")).toBe(false);
  });
});

describe("IE proxy response policy", () => {
  test("CSP sandbox never grants same-origin", () => {
    const csp = buildIeProxyCsp();
    expect(csp).toContain(`sandbox ${IE_PROXY_SANDBOX_TOKENS}`);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("object-src 'none'");
    expect(IE_PROXY_SANDBOX_TOKENS).not.toContain("allow-same-origin");
  });

  test("CSP frame-ancestors only lists ryOS origins", () => {
    const csp = buildIeProxyCsp();
    const frameAncestors = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("frame-ancestors"));
    expect(frameAncestors).toBeDefined();
    expect(frameAncestors).toContain("'self'");
    expect(frameAncestors).toContain("https://ryo.lu");
    expect(frameAncestors).toContain("https://*.ryo.lu"); // pragma: allowlist secret
    expect(frameAncestors!.split(/\s+/)).not.toContain("*");
  });

  test("nonce CSP restricts scripts to the injected nonce", () => {
    const csp = buildIeProxyCsp({ scriptNonce: "abc123" });
    expect(csp).toContain("script-src 'nonce-abc123'");
    expect(csp).toContain("worker-src 'none'");
    expect(csp).not.toContain("unsafe-inline");
  });

  test.each([
    ["text/html; charset=utf-8", "text/plain; charset=utf-8"],
    ["application/xhtml+xml", "text/plain; charset=utf-8"],
    ["image/svg+xml", "text/plain; charset=utf-8"],
    ["application/javascript", "text/plain; charset=utf-8"],
    ["text/xml", "text/plain; charset=utf-8"],
    ["", "text/plain; charset=utf-8"],
  ])("rewrites active type %p", (input, expected) => {
    const decision = classifyProxiedContentType(input);
    expect(decision.contentType).toBe(expected);
    expect(decision.rewritten).toBe(true);
  });

  test.each([
    "image/png",
    "image/jpeg",
    "font/woff2",
    "text/css; charset=utf-8",
    "application/json",
    "video/mp4",
  ])("passes passive type %p", (input) => {
    const decision = classifyProxiedContentType(input);
    expect(decision.contentType).toBe(input);
    expect(decision.rewritten).toBe(false);
    expect(decision.contentDisposition).toBeUndefined();
  });

  test("forces unknown binary types to download", () => {
    const decision = classifyProxiedContentType("application/pdf");
    expect(decision.contentType).toBe("application/octet-stream");
    expect(decision.contentDisposition).toBe("attachment");
  });

  test("frame tokens are validated strictly", () => {
    expect(sanitizeFrameToken("abcdefghijklmnop.1761140000000")).toBe(
      "abcdefghijklmnop.1761140000000"
    );
    expect(sanitizeFrameToken("short.1")).toBeNull();
    expect(sanitizeFrameToken("abcdefghijklmnop.12x")).toBeNull();
    expect(sanitizeFrameToken('abcdefghijklmnop.1"><script>')).toBeNull();
    expect(sanitizeFrameToken(["abcdefghijklmnop.1"])).toBeNull();
  });

  test("inline script JSON cannot break out of the script element", () => {
    const json = toInlineScriptJson({ t: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
  });

  test("error document reports over postMessage with a nonce", () => {
    const doc = buildIeProxyErrorDocument(
      { error: true, type: "http_error", status: 404, message: "<b>Not found</b>" },
      { nonce: "n0nce", frameToken: "abcdefghijklmnop.1", parentOrigin: "https://os.ryo.lu" }
    );
    expect(doc).toContain('<script nonce="n0nce">');
    expect(doc).toContain('"type":"iframeProxyError"');
    expect(doc).toContain('"ieFrame":"abcdefghijklmnop.1"');
    expect(doc).toContain('"https://os.ryo.lu"');
    expect(doc).toContain("&lt;b&gt;Not found&lt;/b&gt;");
  });

  test("interceptor posts to the parent origin with the frame id", () => {
    const script = buildIeNavigationInterceptorScript({
      nonce: "n0nce",
      frameToken: "abcdefghijklmnop.1",
      parentOrigin: "https://os.ryo.lu",
    });
    expect(script).toContain('<script nonce="n0nce">');
    expect(script).toContain('var frameToken = "abcdefghijklmnop.1"');
    expect(script).toContain('var parentOrigin = "https://os.ryo.lu"');
    expect(script).toContain("realParent.postMessage(message, parentOrigin)");
    expect(script).toContain("type: 'iframeLoaded'");
  });
});

describe("isolated proxy origin config", () => {
  const original = process.env.IE_PROXY_ORIGIN;
  afterEach(() => {
    if (original === undefined) delete process.env.IE_PROXY_ORIGIN;
    else process.env.IE_PROXY_ORIGIN = original;
  });

  test("defaults to same-origin mode", () => {
    delete process.env.IE_PROXY_ORIGIN;
    expect(getIeProxyIsolatedOrigin()).toBeNull();
    expect(isIeProxyIsolatedHostHeader("os.ryo.lu")).toBe(false);
  });

  test("recognizes the configured isolated host", () => {
    process.env.IE_PROXY_ORIGIN = "https://ieproxy.ryo.lu/";
    expect(getIeProxyIsolatedOrigin()).toBe("https://ieproxy.ryo.lu");
    expect(isIeProxyIsolatedHostHeader("ieproxy.ryo.lu")).toBe(true);
    expect(isIeProxyIsolatedHostHeader("IEPROXY.ryo.lu")).toBe(true);
    expect(isIeProxyIsolatedHostHeader("os.ryo.lu")).toBe(false);
  });

  test("ignores invalid values", () => {
    process.env.IE_PROXY_ORIGIN = "javascript:alert(1)";
    expect(getIeProxyIsolatedOrigin()).toBeNull();
  });

  test("isolated host only serves the proxy route and fonts", () => {
    expect(isIeProxyIsolatedPathAllowed("/api/iframe-check")).toBe(true);
    expect(isIeProxyIsolatedPathAllowed("/fonts/fonts.css")).toBe(true);
    expect(isIeProxyIsolatedPathAllowed("/health")).toBe(true);
    expect(isIeProxyIsolatedPathAllowed("/")).toBe(false);
    expect(isIeProxyIsolatedPathAllowed("/api/auth/session")).toBe(false);
    expect(isIeProxyIsolatedPathAllowed("/api/iframe-check/../auth")).toBe(false);
  });
});

describe("IE client frame messaging", () => {
  const appOrigin = "https://os.ryo.lu";

  test("proxy iframes never get allow-same-origin", () => {
    expect(IE_PROXY_IFRAME_SANDBOX).not.toContain("allow-same-origin");
    expect(getIeIframeSandbox("/api/iframe-check?url=x", appOrigin)).toBe(
      IE_PROXY_IFRAME_SANDBOX
    );
    expect(
      getIeIframeSandbox("https://os.ryo.lu/api/iframe-check?url=x", appOrigin)
    ).toBe(IE_PROXY_IFRAME_SANDBOX);
    expect(getIeIframeSandbox(null, appOrigin)).toBe(IE_PROXY_IFRAME_SANDBOX);
    expect(getIeIframeSandbox("javascript:alert(1)", appOrigin)).toBe(
      IE_PROXY_IFRAME_SANDBOX
    );
  });

  test("direct embeds keep their own origin", () => {
    expect(getIeIframeSandbox("https://ryo.lu/", appOrigin)).toContain(
      "allow-same-origin"
    );
  });

  test("frame ids are appended to proxy URLs only", () => {
    const token = createIeFrameInstanceToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(withIeFrameId("/api/iframe-check?url=a", token, 42)).toBe(
      `/api/iframe-check?url=a&ieFrame=${token}.42`
    );
    expect(withIeFrameId("https://ryo.lu", token, 42)).toBe("https://ryo.lu");
    expect(sanitizeFrameToken(buildIeFrameId(token, Date.now()))).not.toBeNull();
  });

  test("accepts only messages from the iframe window with the current frame id", () => {
    const iframeWindow = {} as Window;
    const otherWindow = {} as Window;
    const frameId = "abcdefghijklmnop.7";
    const nav = { type: "iframeNavigation", url: "https://example.com/", ieFrame: frameId };

    expect(parseIeFrameMessage({ data: nav, source: iframeWindow }, iframeWindow, frameId)).toEqual({
      type: "iframeNavigation",
      url: "https://example.com/",
    });
    expect(parseIeFrameMessage({ data: nav, source: otherWindow }, iframeWindow, frameId)).toBeNull();
    expect(
      parseIeFrameMessage(
        { data: { ...nav, ieFrame: "abcdefghijklmnop.6" }, source: iframeWindow },
        iframeWindow,
        frameId
      )
    ).toBeNull();
    expect(
      parseIeFrameMessage(
        { data: { ...nav, url: "javascript:alert(1)" }, source: iframeWindow },
        iframeWindow,
        frameId
      )
    ).toBeNull();
  });

  test("parses load and error reports", () => {
    const iframeWindow = {} as Window;
    const frameId = "abcdefghijklmnop.7";
    expect(
      parseIeFrameMessage(
        { data: { type: "iframeLoaded", title: "Hi", blankSpa: true, ieFrame: frameId }, source: iframeWindow },
        iframeWindow,
        frameId
      )
    ).toEqual({ type: "iframeLoaded", title: "Hi", blankSpa: true });
    expect(
      parseIeFrameMessage(
        {
          data: {
            type: "iframeProxyError",
            ieFrame: frameId,
            error: { error: true, type: "http_error", status: 404, message: "nope" },
          },
          source: iframeWindow,
        },
        iframeWindow,
        frameId
      )
    ).toEqual({
      type: "iframeProxyError",
      error: {
        error: true,
        type: "http_error",
        status: 404,
        message: "nope",
        statusText: undefined,
        details: undefined,
      },
    });
  });
});
