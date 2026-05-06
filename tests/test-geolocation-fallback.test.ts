import { afterEach, describe, expect, mock, test } from "bun:test";
import { __INTERNAL, resolveIpGeolocation } from "../api/_utils/_geolocation.js";

const { isPrivateOrLocalIp, parseProviderResponse, getProviderUrl } = __INTERNAL;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("geolocation fallback", () => {
  describe("isPrivateOrLocalIp", () => {
    test("flags loopback and unknown sentinels", () => {
      expect(isPrivateOrLocalIp("127.0.0.1")).toBe(true);
      expect(isPrivateOrLocalIp("::1")).toBe(true);
      expect(isPrivateOrLocalIp("0.0.0.0")).toBe(true);
      expect(isPrivateOrLocalIp("localhost-dev")).toBe(true);
      expect(isPrivateOrLocalIp("unknown-ip")).toBe(true);
      expect(isPrivateOrLocalIp("")).toBe(true);
    });

    test("flags RFC1918 ranges", () => {
      expect(isPrivateOrLocalIp("10.0.0.5")).toBe(true);
      expect(isPrivateOrLocalIp("192.168.1.1")).toBe(true);
      expect(isPrivateOrLocalIp("172.16.0.1")).toBe(true);
      expect(isPrivateOrLocalIp("172.31.255.255")).toBe(true);
      expect(isPrivateOrLocalIp("172.15.0.1")).toBe(false);
      expect(isPrivateOrLocalIp("172.32.0.1")).toBe(false);
    });

    test("flags carrier-grade NAT and link-local", () => {
      expect(isPrivateOrLocalIp("100.64.0.1")).toBe(true);
      expect(isPrivateOrLocalIp("100.127.255.255")).toBe(true);
      expect(isPrivateOrLocalIp("100.63.0.1")).toBe(false);
      expect(isPrivateOrLocalIp("169.254.169.254")).toBe(true);
    });

    test("flags IPv6 unique-local + link-local", () => {
      expect(isPrivateOrLocalIp("fc00::1")).toBe(true);
      expect(isPrivateOrLocalIp("fd00::1")).toBe(true);
      expect(isPrivateOrLocalIp("fe80::1")).toBe(true);
    });

    test("flags reserved, documentation, benchmark, and multicast ranges", () => {
      expect(isPrivateOrLocalIp("192.0.2.10")).toBe(true);
      expect(isPrivateOrLocalIp("198.18.0.1")).toBe(true);
      expect(isPrivateOrLocalIp("198.51.100.10")).toBe(true);
      expect(isPrivateOrLocalIp("203.0.113.10")).toBe(true);
      expect(isPrivateOrLocalIp("224.0.0.1")).toBe(true);
      expect(isPrivateOrLocalIp("240.0.0.1")).toBe(true);
      expect(isPrivateOrLocalIp("255.255.255.255")).toBe(true);
    });

    test("flags IPv6 documentation, multicast, and private IPv4-mapped addresses", () => {
      expect(isPrivateOrLocalIp("2001:db8::1")).toBe(true);
      expect(isPrivateOrLocalIp("2001:0db8::1")).toBe(true);
      expect(isPrivateOrLocalIp("ff02::1")).toBe(true);
      expect(isPrivateOrLocalIp("::ffff:192.168.1.1")).toBe(true);
      expect(isPrivateOrLocalIp("::ffff:c0a8:0101")).toBe(true);
      expect(isPrivateOrLocalIp("::ffff:8.8.8.8")).toBe(false);
    });

    test("does not flag public IPs", () => {
      expect(isPrivateOrLocalIp("8.8.8.8")).toBe(false);
      expect(isPrivateOrLocalIp("1.1.1.1")).toBe(false);
      expect(isPrivateOrLocalIp("2606:4700:4700::1111")).toBe(false);
    });
  });

  describe("parseProviderResponse", () => {
    test("parses ipwho.is shape", () => {
      const parsed = parseProviderResponse({
        success: true,
        city: "San Francisco",
        country: "United States",
        country_code: "US",
        region: "California",
        latitude: 37.7749,
        longitude: -122.4194,
      });
      expect(parsed).toEqual({
        latitude: "37.7749",
        longitude: "-122.4194",
        city: "San Francisco",
        region: "California",
        country: "US",
      });
    });

    test("parses ip-api shape (lat/lon, regionName)", () => {
      const parsed = parseProviderResponse({
        status: "success",
        city: "Tokyo",
        country: "Japan",
        countryCode: "JP",
        regionName: "Tokyo",
        lat: "35.6762",
        lon: "139.6503",
      });
      expect(parsed).toEqual({
        latitude: "35.6762",
        longitude: "139.6503",
        city: "Tokyo",
        region: "Tokyo",
        country: "JP",
      });
    });

    test("parses nested location object", () => {
      const parsed = parseProviderResponse({
        city: "Berlin",
        country_code: "DE",
        location: {
          latitude: 52.52,
          longitude: 13.405,
        },
      });
      expect(parsed).toEqual({
        latitude: "52.52",
        longitude: "13.405",
        city: "Berlin",
        country: "DE",
      });
    });

    test("returns null when provider explicitly failed", () => {
      expect(parseProviderResponse({ success: false, message: "rate limit" })).toBeNull();
    });

    test("returns null for empty/garbage payloads", () => {
      expect(parseProviderResponse(null)).toBeNull();
      expect(parseProviderResponse({})).toBeNull();
      expect(parseProviderResponse({ unrelated: "field" })).toBeNull();
    });

    test("ignores unparseable lat/lng but keeps city/country", () => {
      const parsed = parseProviderResponse({
        city: "Paris",
        country_code: "FR",
        latitude: "not-a-number",
      });
      expect(parsed).toEqual({ city: "Paris", country: "FR" });
    });
  });

  describe("getProviderUrl", () => {
    test("uses default ipwho.is when no template configured", () => {
      const previous = process.env.IP_GEOLOCATION_URL_TEMPLATE;
      delete process.env.IP_GEOLOCATION_URL_TEMPLATE;
      try {
        expect(getProviderUrl("8.8.8.8")).toBe("https://ipwho.is/8.8.8.8");
      } finally {
        if (previous !== undefined) {
          process.env.IP_GEOLOCATION_URL_TEMPLATE = previous;
        }
      }
    });

    test("substitutes {ip} with URL-encoded IP", () => {
      const previous = process.env.IP_GEOLOCATION_URL_TEMPLATE;
      process.env.IP_GEOLOCATION_URL_TEMPLATE =
        "https://api.example.com/lookup?ip={ip}&format=json";
      try {
        expect(getProviderUrl("2606:4700:4700::1111")).toBe(
          "https://api.example.com/lookup?ip=2606%3A4700%3A4700%3A%3A1111&format=json"
        );
      } finally {
        if (previous !== undefined) {
          process.env.IP_GEOLOCATION_URL_TEMPLATE = previous;
        } else {
          delete process.env.IP_GEOLOCATION_URL_TEMPLATE;
        }
      }
    });
  });

  describe("resolveIpGeolocation", () => {
    test("returns existing geo when it already has useful data", async () => {
      const existing = {
        city: "Paris",
        country: "FR",
        latitude: "48.8566",
        longitude: "2.3522",
      };
      const result = await resolveIpGeolocation({
        ip: "8.8.8.8",
        existing,
      });
      expect(result).toEqual(existing);
    });

    test("skips outbound lookups for private IPs", async () => {
      const result = await resolveIpGeolocation({
        ip: "192.168.1.1",
        existing: {},
      });
      expect(result).toEqual({});
    });

    test("skips outbound lookups for reserved IPs", async () => {
      const fetchMock = mock(async (): Promise<Response> => {
        return new Response(JSON.stringify({ city: "Should Not Fetch" }));
      });
      globalThis.fetch = fetchMock as typeof fetch;

      const result = await resolveIpGeolocation({
        ip: "203.0.113.10",
        existing: {},
      });

      expect(result).toEqual({});
      expect(fetchMock).toHaveBeenCalledTimes(0);
    });

    test("respects the disable flag", async () => {
      const previous = process.env.IP_GEOLOCATION_DISABLED;
      process.env.IP_GEOLOCATION_DISABLED = "1";
      try {
        const result = await resolveIpGeolocation({
          ip: "8.8.8.8",
          existing: {},
        });
        expect(result).toEqual({});
      } finally {
        if (previous !== undefined) {
          process.env.IP_GEOLOCATION_DISABLED = previous;
        } else {
          delete process.env.IP_GEOLOCATION_DISABLED;
        }
      }
    });
  });
});
