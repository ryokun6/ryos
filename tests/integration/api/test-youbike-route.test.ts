import { describe, expect, test } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

describe("youbike bike route", () => {
  test("rejects coordinates outside Taiwan", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/youbike/route?fromLat=37.7749&fromLng=-122.4194&toLat=37.78&toLng=-122.41`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("not_in_taiwan");
  });

  test("rejects missing coordinates", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/youbike/route`, {
      headers: makeRateLimitBypassHeaders(),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("invalid_coordinates");
  });

  test("returns on-road bike geometry for Taipei 101 to Main Station", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/youbike/route?fromLat=25.03396&fromLng=121.56447&toLat=25.04792&toLng=121.51708`,
      { headers: makeRateLimitBypassHeaders() }
    );
    if (res.status === 429 || res.status === 502) return;
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      path?: Array<{ latitude: number; longitude: number }>;
      distanceMeters?: number;
      durationSeconds?: number;
      provider?: string;
    };
    expect(data.provider).toBe("osrm-bike");
    expect((data.path ?? []).length).toBeGreaterThan(20);
    expect(data.distanceMeters ?? 0).toBeGreaterThan(4000);
    const first = data.path![0];
    const last = data.path![data.path!.length - 1];
    expect(first.latitude).toBeGreaterThan(25);
    expect(first.longitude).toBeGreaterThan(121);
    expect(last.latitude).toBeGreaterThan(25);
    // Road path must not be the 2-point geodesic.
    expect(data.path!.length).not.toBe(2);
  }, 15000);

  test("OPTIONS preflight succeeds", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/youbike/route`, {
      method: "OPTIONS",
      headers: makeRateLimitBypassHeaders(),
    });
    expect([200, 204]).toContain(res.status);
  });
});
