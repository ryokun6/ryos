import { describe, expect, test } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

describe("youbike stations", () => {
  test("rejects an inverted bbox", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/youbike/stations?south=25.1&north=25.0&west=121.5&east=121.6`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("invalid_bbox");
  });

  test("returns stations inside a Taipei bbox", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/youbike/stations?south=25.02&west=121.53&north=25.04&east=121.56`,
      { headers: makeRateLimitBypassHeaders() }
    );
    if (res.status === 429) return;
    if (res.status === 502) return;
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      stations?: Array<{
        id: string;
        latitude: number;
        longitude: number;
        bikesAvailable: number;
      }>;
      sources?: Array<{ id: string; ok: boolean }>;
    };
    expect(Array.isArray(data.stations)).toBe(true);
    expect((data.stations ?? []).length).toBeGreaterThan(0);
    const first = data.stations![0];
    expect(first.id.startsWith("youbike:")).toBe(true);
    expect(first.latitude).toBeGreaterThan(25);
    expect(first.longitude).toBeGreaterThan(121);
    expect(typeof first.bikesAvailable).toBe("number");
    expect(data.sources?.some((source) => source.id === "taipei" && source.ok)).toBe(
      true
    );
  }, 20000);

  test("returns stations inside a Taichung bbox from the national dump", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/youbike/stations?south=24.12&west=120.64&north=24.16&east=120.70`,
      { headers: makeRateLimitBypassHeaders() }
    );
    if (res.status === 429) return;
    if (res.status === 502) return;
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      stations?: Array<{
        id: string;
        city?: string;
        latitude: number;
        longitude: number;
        bikesAvailable: number;
      }>;
      sources?: Array<{ id: string; ok: boolean; count?: number }>;
    };
    expect(Array.isArray(data.stations)).toBe(true);
    expect((data.stations ?? []).length).toBeGreaterThan(0);
    const first = data.stations![0];
    expect(first.id.startsWith("youbike:")).toBe(true);
    expect(first.latitude).toBeGreaterThan(24);
    expect(first.latitude).toBeLessThan(24.3);
    expect(first.longitude).toBeGreaterThan(120.5);
    expect(first.longitude).toBeLessThan(120.8);
    expect(typeof first.bikesAvailable).toBe("number");
    expect(
      data.sources?.some((source) => source.id === "national" && source.ok)
    ).toBe(true);
  }, 30000);

  test("OPTIONS preflight succeeds", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/youbike/stations`, {
      method: "OPTIONS",
      headers: makeRateLimitBypassHeaders(),
    });
    expect([200, 204]).toContain(res.status);
  });
});
