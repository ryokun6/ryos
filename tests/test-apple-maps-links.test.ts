import { describe, expect, test } from "bun:test";
import {
  buildAppleMapsDrivingDirectionsUrl,
  buildAppleMapsPlaceUrl,
} from "../src/apps/maps/utils/appleMapsLinks";

describe("buildAppleMapsDrivingDirectionsUrl", () => {
  test("builds driving directions URL with daddr and dirflg", () => {
    const url = buildAppleMapsDrivingDirectionsUrl(37.3349, -122.009);
    expect(url).toBe(
      "https://maps.apple.com/?daddr=37.3349%2C-122.009&dirflg=d"
    );
  });
});

describe("buildAppleMapsPlaceUrl", () => {
  test("includes ll, q, and place-id when provided", () => {
    const url = buildAppleMapsPlaceUrl({
      latitude: 37.78,
      longitude: -122.42,
      name: "  Ferry Building  ",
      placeId: "I123",
    });
    expect(url).toBe(
      "https://maps.apple.com/?ll=37.78%2C-122.42&q=Ferry+Building&place-id=I123"
    );
  });
});
