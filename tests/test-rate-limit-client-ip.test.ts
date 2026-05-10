/**
 * Unit tests for the trust-aware client IP resolver used by rate limiting.
 *
 * These cover the regression that motivated the change:
 *   - Self-hosted (non-Vercel, non-Cloudflare) deployments must NOT trust
 *     client-supplied X-Forwarded-For unless TRUSTED_PROXY_COUNT is set,
 *     otherwise an attacker can rotate spoofed IPs to defeat rate limits.
 *   - Vercel and Cloudflare-managed headers stay authoritative.
 *   - The standalone Bun server's PEER_IP_HEADER is trusted unconditionally.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { getClientIp, PEER_IP_HEADER } from "../api/_utils/_rate-limit.js";

type Headers = Record<string, string | string[] | undefined>;
const reqWith = (headers: Headers) => ({ headers });

const ORIGINAL_TRUSTED_PROXY_COUNT = process.env.TRUSTED_PROXY_COUNT;
function setTrustedProxyCount(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.TRUSTED_PROXY_COUNT;
  } else {
    process.env.TRUSTED_PROXY_COUNT = value;
  }
}

afterEach(() => {
  setTrustedProxyCount(ORIGINAL_TRUSTED_PROXY_COUNT);
});

describe("getClientIp", () => {
  test("trusts x-vercel-forwarded-for unconditionally", () => {
    const ip = getClientIp(
      reqWith({
        "x-vercel-forwarded-for": "203.0.113.42",
        // attacker-controlled values are ignored when Vercel header is present
        "x-forwarded-for": "1.2.3.4",
      })
    );
    expect(ip).toBe("203.0.113.42");
  });

  test("trusts the standalone-server peer IP header", () => {
    const ip = getClientIp(
      reqWith({
        [PEER_IP_HEADER]: "198.51.100.7",
        "x-forwarded-for": "1.2.3.4",
      })
    );
    expect(ip).toBe("198.51.100.7");
  });

  test("trusts cf-connecting-ip when no Vercel/peer header is present", () => {
    const ip = getClientIp(
      reqWith({
        "cf-connecting-ip": "203.0.113.50",
        "x-forwarded-for": "1.2.3.4",
      })
    );
    expect(ip).toBe("203.0.113.50");
  });

  test("ignores client-controlled x-forwarded-for by default", () => {
    setTrustedProxyCount(undefined);
    const ip = getClientIp(
      reqWith({
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "5.6.7.8",
      })
    );
    expect(ip).toBe("untrusted-shared-ip");
  });

  test("with TRUSTED_PROXY_COUNT=1 reads the right-most XFF entry", () => {
    setTrustedProxyCount("1");
    const ip = getClientIp(
      reqWith({
        "x-forwarded-for": "client.real, proxy.last",
      })
    );
    expect(ip).toBe("proxy.last");
  });

  test("with TRUSTED_PROXY_COUNT=2 skips one trusted hop", () => {
    setTrustedProxyCount("2");
    const ip = getClientIp(
      reqWith({
        "x-forwarded-for": "client.real, hop1, hop2",
      })
    );
    expect(ip).toBe("hop1");
  });

  test("with TRUSTED_PROXY_COUNT > 0, X-Forwarded-For wins over peer header", () => {
    // When operator explicitly says they're behind a proxy chain, the
    // socket peer is just the proxy — XFF is the truth.
    setTrustedProxyCount("1");
    const ip = getClientIp(
      reqWith({
        "x-forwarded-for": "real.client.ip",
        [PEER_IP_HEADER]: "127.0.0.1",
      })
    );
    expect(ip).toBe("real.client.ip");
  });

  test("returns shared bucket when no trusted source is present", () => {
    setTrustedProxyCount(undefined);
    const ip = getClientIp(reqWith({}));
    expect(ip).toBe("untrusted-shared-ip");
  });

  test("normalizes loopback IPs to localhost-dev", () => {
    expect(getClientIp(reqWith({ [PEER_IP_HEADER]: "::1" }))).toBe(
      "localhost-dev"
    );
    expect(getClientIp(reqWith({ [PEER_IP_HEADER]: "127.0.0.1" }))).toBe(
      "localhost-dev"
    );
  });

  test("does NOT collapse a real upstream IP just because origin is localhost", () => {
    // Test runner scenario: requests come from `Origin: http://localhost`
    // but include a trusted X-Forwarded-For with a real-looking IP. We
    // must honour the IP so per-IP rate limits actually buckets requests.
    setTrustedProxyCount("1");
    const ip = getClientIp(
      reqWith({
        origin: "http://localhost:3000",
        "x-forwarded-for": "10.99.1.1",
        [PEER_IP_HEADER]: "127.0.0.1",
      })
    );
    expect(ip).toBe("10.99.1.1");
  });

  test("strips IPv4-mapped IPv6 prefix", () => {
    const ip = getClientIp(
      reqWith({
        [PEER_IP_HEADER]: "::ffff:8.8.8.8",
      })
    );
    expect(ip).toBe("8.8.8.8");
  });

  test("two attackers spoofing different X-Forwarded-For values share one bucket", () => {
    setTrustedProxyCount(undefined);
    const a = getClientIp(reqWith({ "x-forwarded-for": "1.1.1.1" }));
    const b = getClientIp(reqWith({ "x-forwarded-for": "2.2.2.2" }));
    expect(a).toBe(b);
    expect(a).toBe("untrusted-shared-ip");
  });
});
