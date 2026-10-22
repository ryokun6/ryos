import { afterEach, describe, expect, test } from "bun:test";

import {
  SsrfBlockedError,
  fetchPinned,
  validatePublicTarget,
  validatePublicUrl,
} from "../../../api/_utils/_ssrf.js";

describe("SSRF URL validation", () => {
  test("allows public IPv6 literals without DNS lookup", async () => {
    const parsed = await validatePublicUrl("https://[2606:4700:4700::1111]/status");

    expect(parsed.hostname).toBe("[2606:4700:4700::1111]");
    expect(parsed.pathname).toBe("/status");
  });

  test("blocks private IPv6 literals", async () => {
    await expect(validatePublicUrl("http://[::1]/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  test("blocks hex-form private IPv4-mapped IPv6 literals", async () => {
    await expect(
      validatePublicUrl("http://[::ffff:c0a8:0101]/")
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  test("blocks NAT64 literals that embed private IPv4 targets", async () => {
    await expect(
      validatePublicUrl("http://[64:ff9b::a9fe:a9fe]/latest/meta-data")
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  test("rejects credentials before outbound validation", async () => {
    await expect(
      validatePublicUrl("https://user:pass@example.com/")
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  test("IP literal targets carry no separate pinned addresses", async () => {
    const target = await validatePublicTarget("http://8.8.8.8/x");
    expect(target.addresses).toEqual([]);
  });
});

describe("SSRF pinned fetch", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const captureFetch = (fail: Set<string> = new Set()) => {
    const calls: Array<{ url: string; init: RequestInit & { tls?: { serverName?: string } } }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: (init ?? {}) as RequestInit });
      if ([...fail].some((addr) => url.includes(addr))) {
        throw new TypeError("connect failed");
      }
      return new Response("ok");
    }) as typeof fetch;
    return calls;
  };

  test("connects to the validated address with the original Host and SNI", async () => {
    const calls = captureFetch();
    await fetchPinned(
      { url: new URL("https://example.com:8443/a?b=1"), addresses: ["93.184.215.14"] },
      { headers: { Accept: "text/html" } }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://93.184.215.14:8443/a?b=1");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("host")).toBe("example.com:8443");
    expect(headers.get("accept")).toBe("text/html");
    expect(calls[0].init.tls?.serverName).toBe("example.com");
  });

  test("brackets IPv6 addresses and omits TLS options for plain HTTP", async () => {
    const calls = captureFetch();
    await fetchPinned(
      { url: new URL("http://example.com/"), addresses: ["2606:2800:21f:cb07:6820:80da:af6b:8b2c"] },
      {}
    );

    expect(calls[0].url).toBe("http://[2606:2800:21f:cb07:6820:80da:af6b:8b2c]/");
    expect(calls[0].init.tls).toBeUndefined();
  });

  test("falls back to the next validated address on connect failure", async () => {
    const calls = captureFetch(new Set(["1.2.3.4"]));
    const res = await fetchPinned(
      { url: new URL("https://example.com/"), addresses: ["1.2.3.4", "5.6.7.8"] },
      {}
    );

    expect(await res.text()).toBe("ok");
    expect(calls.map((c) => c.url)).toEqual([
      "https://1.2.3.4/",
      "https://5.6.7.8/",
    ]);
  });
});
