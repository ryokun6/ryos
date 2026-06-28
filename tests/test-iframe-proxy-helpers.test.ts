import { describe, expect, test } from "bun:test";
import {
  buildBrowserHeaders,
  getCookieHeaderForUrl,
  mergeProxyCookies,
  rewriteCssForProxy,
  rewriteHtmlForProxy,
} from "../api/_utils/iframe-proxy-helpers";

describe("iframe proxy helpers", () => {
  test("buildBrowserHeaders uses coherent resource-specific headers", () => {
    const documentHeaders = buildBrowserHeaders({
      targetUrl: "https://example.com/page",
      resourceType: "document",
      method: "GET",
    });
    const imageHeaders = buildBrowserHeaders({
      targetUrl: "https://example.com/image.png",
      resourceType: "image",
      referrerUrl: "https://example.com/page",
      method: "GET",
    });

    expect(documentHeaders["Sec-Fetch-Dest"]).toBe("document");
    expect(documentHeaders.Accept).toContain("text/html");
    expect(imageHeaders["Sec-Fetch-Dest"]).toBe("image");
    expect(imageHeaders.Accept).toContain("image/");
    expect(imageHeaders["User-Agent"]).toBe(documentHeaders["User-Agent"]);
  });

  test("rewriteHtmlForProxy proxies assets and avoids unsafe schemes", () => {
    const result = rewriteHtmlForProxy(
      `<html><head><link rel="stylesheet" href="/app.css"><script src="/app.js" integrity="sha256-x"></script></head><body><a href="javascript:alert(1)">x</a><img src="/logo.png" srcset="/logo@2x.png 2x"><form method="post" action="/submit"></form><style>.x{background:url('/x.png')}</style></body></html>`,
      {
        baseUrl: "https://example.com/page",
        proxyOrigin: "https://os.example",
        referrerUrl: "https://example.com/page",
        sessionId: "session_1",
      }
    );

    expect(result.html).toContain("https://os.example/api/iframe-check");
    expect(result.html).toContain("resource=style");
    expect(result.html).toContain("resource=script");
    expect(result.html).toContain("resource=image");
    expect(result.html).toContain("form=1");
    expect(result.html).toContain("javascript:alert(1)");
    expect(result.html).not.toContain("integrity=");
    expect(result.stats.htmlAttributes).toBeGreaterThanOrEqual(4);
    expect(result.stats.cssUrls).toBe(1);
  });

  test("rewriteCssForProxy proxies imports and url references", () => {
    const result = rewriteCssForProxy(
      `@import "/theme.css"; .hero{background:url(./hero.png)} .inline{background:url(data:image/png;base64,abc)}`,
      {
        baseUrl: "https://example.com/assets/app.css",
        proxyOrigin: "https://os.example",
        referrerUrl: "https://example.com/page",
      }
    );

    expect(result.css).toContain("resource=style");
    expect(result.css).toContain("resource=image");
    expect(result.css).toContain("data:image/png");
    expect(result.count).toBe(2);
  });

  test("mergeProxyCookies scopes cookies by host, domain, path, and secure flag", () => {
    const cookies = mergeProxyCookies(
      [],
      [
        "host_only=1; Path=/account; Max-Age=600",
        "domain_cookie=1; Domain=.example.com; Path=/; Max-Age=600",
        "secure_cookie=1; Path=/; Secure; Max-Age=600",
      ],
      "https://example.com/account/login",
      1_000
    );

    expect(getCookieHeaderForUrl(cookies, "https://example.com/account", 2_000))
      .toContain("host_only=1");
    expect(getCookieHeaderForUrl(cookies, "https://cdn.example.com/", 2_000))
      .toContain("domain_cookie=1");
    expect(getCookieHeaderForUrl(cookies, "https://example.com/other/page", 2_000))
      .toContain("domain_cookie=1");
    expect(getCookieHeaderForUrl(cookies, "https://cdn.example.com/", 2_000))
      .not.toContain("host_only=1");
    expect(getCookieHeaderForUrl(cookies, "http://example.com/", 2_000))
      .not.toContain("secure_cookie=1");
  });
});
