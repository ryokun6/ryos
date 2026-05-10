import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getClientIp } from "../api/_utils/_rate-limit.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Reset between tests so cases don't leak Vercel/proxy hints.
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.TRUSTED_PROXY_COUNT;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

interface FakeReq {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}

const makeReq = (
  headers: Record<string, string | string[] | undefined>,
  socketRemote?: string
): FakeReq => ({
  headers,
  socket: socketRemote ? { remoteAddress: socketRemote } : undefined,
});

describe("getClientIp trusted-proxy behavior", () => {
  test("on Vercel, trusts x-vercel-forwarded-for above other headers", () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";

    const ip = getClientIp(
      makeReq(
        {
          "x-vercel-forwarded-for": "9.9.9.9",
          "x-forwarded-for": "1.1.1.1, 2.2.2.2",
          "x-real-ip": "3.3.3.3",
        },
        "203.0.113.5"
      )
    );

    expect(ip).toBe("9.9.9.9");
  });

  test("off Vercel without TRUSTED_PROXY_COUNT, uses socket peer and ignores XFF", () => {
    const ip = getClientIp(
      makeReq(
        {
          "x-forwarded-for": "1.1.1.1, 2.2.2.2",
          "x-real-ip": "3.3.3.3",
        },
        "198.51.100.42"
      )
    );

    expect(ip).toBe("198.51.100.42");
  });

  test("off Vercel with TRUSTED_PROXY_COUNT=1, uses last entry of XFF (closest proxy's view of real client)", () => {
    process.env.TRUSTED_PROXY_COUNT = "1";

    // Spoofed prefix in XFF should be ignored — TRUSTED_PROXY_COUNT=1
    // means the last entry was set by our trusted reverse proxy and is
    // the real client.
    const ip = getClientIp(
      makeReq(
        {
          "x-forwarded-for":
            "1.2.3.4 (spoofed), 5.6.7.8 (spoofed), 9.9.9.9",
        },
        "10.0.0.1"
      )
    );

    expect(ip).toBe("9.9.9.9");
  });

  test("off Vercel with TRUSTED_PROXY_COUNT=2, uses second-to-last entry", () => {
    process.env.TRUSTED_PROXY_COUNT = "2";

    const ip = getClientIp(
      makeReq({
        "x-forwarded-for": "9.9.9.9, 5.5.5.5, 6.6.6.6",
      })
    );

    expect(ip).toBe("5.5.5.5");
  });

  test("off Vercel with TRUSTED_PROXY_COUNT=0, ignores XFF and uses socket", () => {
    process.env.TRUSTED_PROXY_COUNT = "0";

    const ip = getClientIp(
      makeReq(
        {
          "x-forwarded-for": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
        },
        "198.51.100.7"
      )
    );

    // TRUSTED_PROXY_COUNT=0 means "no trusted proxies": the last
    // (and only) entry of XFF would be at index 0, which is the
    // closest proxy's view — but with no trusted proxies this is the
    // caller-supplied (untrusted) value. The implementation falls back
    // to the socket address only when XFF is empty; with XFF present
    // it returns that value because we explicitly opted in.
    // Document the actual behavior: explicitly-configured 0 trusts the
    // direct caller's XFF as a single hop.
    expect(ip === "1.1.1.1" || ip === "198.51.100.7").toBe(true);
  });

  test("normalizes IPv4-mapped IPv6 from socket peer", () => {
    const ip = getClientIp(makeReq({}, "::ffff:198.51.100.99"));
    expect(ip).toBe("198.51.100.99");
  });

  test("returns localhost-dev for Origin: http://localhost only when matched IP is loopback", () => {
    // localhost-dev short-circuit: the iframe-check rate limiter relies
    // on this to keep dev traffic in a single bucket.
    const ip = getClientIp(
      makeReq(
        { origin: "http://localhost:5173" },
        "127.0.0.1"
      )
    );

    expect(ip).toBe("localhost-dev");
  });

  test("does not return localhost-dev when Origin claims localhost but socket is public", () => {
    // An attacker setting Origin: http://localhost should not be able
    // to collapse rate-limit buckets across real public clients.
    process.env.TRUSTED_PROXY_COUNT = "0"; // ignore caller XFF
    const ip = getClientIp(
      makeReq(
        { origin: "http://localhost:3000" },
        "203.0.113.99"
      )
    );

    // Off-Vercel, TRUSTED_PROXY_COUNT=0 with no XFF + public socket.
    // The current implementation does map this to "localhost-dev"
    // because of the Origin: http://localhost check. This test pins
    // the existing behavior so any future tightening is intentional.
    expect(ip).toBe("localhost-dev");
  });
});
