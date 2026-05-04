import { describe, expect, test } from "bun:test";
import {
  buildAppleMapsDirectionsUrl,
  buildAppleMapsDrivingDirectionsUrl,
} from "../src/apps/maps/utils/appleMapsLinks";

describe("buildAppleMapsDrivingDirectionsUrl", () => {
  test("builds driving directions URL with daddr and dirflg", () => {
    const url = buildAppleMapsDrivingDirectionsUrl(37.3349, -122.009);
    expect(url).toBe(
      "https://maps.apple.com/?daddr=37.3349%2C-122.009&dirflg=d"
    );
  });
});

describe("buildAppleMapsDirectionsUrl", () => {
  test("adds saddr when origin coordinates are provided", () => {
    const url = buildAppleMapsDirectionsUrl({
      destinationLatitude: 10,
      destinationLongitude: 20,
      originLatitude: 1,
      originLongitude: 2,
      travelMode: "driving",
    });
    expect(url).toContain("saddr=1%2C2");
    expect(url).toContain("daddr=10%2C20");
    expect(url).toContain("dirflg=d");
  });

  test("uses walking dirflg", () => {
    const url = buildAppleMapsDirectionsUrl({
      destinationLatitude: 0,
      destinationLongitude: 0,
      originLatitude: 1,
      originLongitude: -1,
      travelMode: "walking",
    });
    expect(url).toContain("dirflg=w");
  });
});
