import { afterEach, describe, expect, test } from "bun:test";
import {
  MAPS_GEO_ENDPOINT,
  fetchApproximateCityLocation,
  parseApproximateCityResponse,
  peekApproximateCityLocation,
  resetApproximateCityLocationCache,
} from "../../../src/apps/maps/utils/ipGeolocation";

afterEach(() => {
  resetApproximateCityLocationCache();
});

describe("parseApproximateCityResponse", () => {
  test("reads a successful /api/geo payload", () => {
    expect(
      parseApproximateCityResponse({
        latitude: 51.5074,
        longitude: -0.1278,
        city: "London",
        source: "ip",
      })
    ).toEqual({
      latitude: 51.5074,
      longitude: -0.1278,
      city: "London",
    });
  });

  test("rejects none / Null Island / incomplete payloads", () => {
    expect(
      parseApproximateCityResponse({
        latitude: null,
        longitude: null,
        source: "none",
      })
    ).toBeNull();
    expect(
      parseApproximateCityResponse({ latitude: 0, longitude: 0, source: "ip" })
    ).toBeNull();
    expect(parseApproximateCityResponse({})).toBeNull();
  });
});

describe("fetchApproximateCityLocation", () => {
  test("caches the first successful lookup for the session", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          latitude: 35.6762,
          longitude: 139.6503,
          city: "Tokyo",
          source: "ip",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const first = await fetchApproximateCityLocation(fetchImpl);
    const second = await fetchApproximateCityLocation(fetchImpl);
    expect(first).toEqual({
      latitude: 35.6762,
      longitude: 139.6503,
      city: "Tokyo",
    });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    expect(peekApproximateCityLocation()).toEqual(first);
  });

  test("treats HTTP errors as no hint so Maps can keep the Taipei fallback", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
        status: 429,
      })) as unknown as typeof fetch;
    expect(await fetchApproximateCityLocation(fetchImpl)).toBeNull();
    expect(peekApproximateCityLocation()).toBeNull();
  });

  test("requests the shared GeoIP endpoint", () => {
    expect(MAPS_GEO_ENDPOINT).toBe("/api/geo");
  });
});
