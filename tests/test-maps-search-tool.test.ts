import { describe, expect, test } from "bun:test";
import { mapsSearchPlacesSchema } from "../api/chat/tools/schemas.js";

/**
 * Regression coverage for the Apple Maps Server API conflict that surfaced as
 * "cannot specify both searchRegion and searchLocation". The chat tool used
 * to expose both `near` (→ searchLocation) and `region` (→ searchRegion);
 * we simplified it to only accept `near` so the model can't accidentally
 * trigger that 400.
 */
describe("mapsSearchPlacesSchema", () => {
  test("accepts query-only input and applies the default limit", () => {
    const parsed = mapsSearchPlacesSchema.safeParse({ query: "coffee" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.query).toBe("coffee");
      expect(parsed.data.limit).toBe(5);
      expect("region" in parsed.data).toBe(false);
    }
  });

  test("preserves a point anchor passed as `near`", () => {
    const parsed = mapsSearchPlacesSchema.safeParse({
      query: "ramen",
      near: { latitude: 35.6595, longitude: 139.7005 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.near).toEqual({
        latitude: 35.6595,
        longitude: 139.7005,
      });
    }
  });

  test("silently strips a `region` payload from older callers", () => {
    const parsed = mapsSearchPlacesSchema.safeParse({
      query: "coffee",
      region: {
        northLatitude: 40,
        eastLongitude: -120,
        southLatitude: 35,
        westLongitude: -125,
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // `region` must not survive — otherwise the executor could combine it
      // with the IP-fallback `searchLocation` and Apple would reject the call.
      expect("region" in parsed.data).toBe(false);
      expect(parsed.data.query).toBe("coffee");
    }
  });

  test("rejects out-of-range coordinates so we don't waste an Apple call", () => {
    const parsed = mapsSearchPlacesSchema.safeParse({
      query: "coffee",
      near: { latitude: 200, longitude: -122 },
    });
    expect(parsed.success).toBe(false);
  });
});
