import { describe, expect, test } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

describe("maps directions", () => {
  test("rejects missing coordinates", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/maps/directions`, {
      headers: makeRateLimitBypassHeaders(),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("invalid_coordinates");
  });

  test("rejects junk coordinates", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/maps/directions?fromLat=x&fromLng=1&toLat=2&toLng=3`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("invalid_coordinates");
  });

  test("OPTIONS preflight succeeds", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/maps/directions`, {
      method: "OPTIONS",
      headers: makeRateLimitBypassHeaders(),
    });
    expect([200, 204]).toContain(res.status);
  });
});
