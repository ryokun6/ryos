import { describe, expect, test } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

describe("GET /api/geo", () => {
  test("OPTIONS preflight succeeds", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/geo`, {
      method: "OPTIONS",
      headers: makeRateLimitBypassHeaders(),
    });
    expect(res.status).toBe(204);
  });

  test("honours Cloudflare geo headers without an outbound lookup", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/geo`, {
      headers: {
        ...makeRateLimitBypassHeaders(),
        "CF-IPLatitude": "37.7749",
        "CF-IPLongitude": "-122.4194",
        "CF-IPCity": "San%20Francisco",
        "CF-IPCountry": "US",
      },
    });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      latitude?: number | null;
      longitude?: number | null;
      city?: string;
      country?: string;
      source?: string;
    };
    expect(data.source).toBe("ip");
    expect(data.latitude).toBeCloseTo(37.7749, 4);
    expect(data.longitude).toBeCloseTo(-122.4194, 4);
    expect(data.city).toBe("San Francisco");
    expect(data.country).toBe("US");
  });

  test("returns a geo payload or an explicit none fallback", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/geo`, {
      headers: makeRateLimitBypassHeaders(),
    });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      latitude?: number | null;
      longitude?: number | null;
      source?: string;
    };
    expect(data.source === "ip" || data.source === "none").toBe(true);
    if (data.source === "ip") {
      expect(typeof data.latitude).toBe("number");
      expect(typeof data.longitude).toBe("number");
    } else {
      expect(data.latitude).toBeNull();
      expect(data.longitude).toBeNull();
    }
  });
});
