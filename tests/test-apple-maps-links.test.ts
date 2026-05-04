import { describe, expect, test } from "bun:test";
import { buildAppleMapsDrivingDirectionsUrl } from "../src/apps/maps/utils/appleMapsLinks";

describe("buildAppleMapsDrivingDirectionsUrl", () => {
  test("builds driving directions URL with daddr and dirflg", () => {
    const url = buildAppleMapsDrivingDirectionsUrl(37.3349, -122.009);
    expect(url).toBe(
      "https://maps.apple.com/?daddr=37.3349%2C-122.009&dirflg=d"
    );
  });
});
