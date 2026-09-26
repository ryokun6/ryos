import { describe, expect, test } from "bun:test";
import {
  buildAppleMapsDirectionsUrl,
  buildAppleMapsDrivingDirectionsUrl,
  buildAppleMapsPlaceUrl,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPlaceUrl,
} from "../../../src/apps/maps/directions/externalMapsLinks";

const DEST = { latitude: 37.3349, longitude: -122.009 };
const ORIGIN = { latitude: 37.7749, longitude: -122.4194 };

describe("buildAppleMapsDrivingDirectionsUrl", () => {
  test("builds driving directions URL with daddr and dirflg", () => {
    const url = buildAppleMapsDrivingDirectionsUrl(37.3349, -122.009);
    expect(url).toBe(
      "https://maps.apple.com/?daddr=37.3349%2C-122.009&dirflg=d"
    );
  });
});

describe("external maps links", () => {
  test("Apple driving URL can include an origin", () => {
    expect(
      buildAppleMapsDirectionsUrl({
        destination: DEST,
        origin: ORIGIN,
        mode: "drive",
      })
    ).toBe(
      "https://maps.apple.com/?daddr=37.3349%2C-122.009&dirflg=d&saddr=37.7749%2C-122.4194"
    );
  });

  test("Apple transit URL uses dirflg=r", () => {
    expect(
      buildAppleMapsDirectionsUrl({ destination: DEST, mode: "transit" })
    ).toBe("https://maps.apple.com/?daddr=37.3349%2C-122.009&dirflg=r");
  });

  test("Apple place URL uses ll and optional q", () => {
    expect(
      buildAppleMapsPlaceUrl({
        latitude: DEST.latitude,
        longitude: DEST.longitude,
        name: "Apple Park",
      })
    ).toBe("https://maps.apple.com/?ll=37.3349%2C-122.009&q=Apple+Park");
  });

  test("Google directions include travelmode and optional origin", () => {
    expect(
      buildGoogleMapsDirectionsUrl({
        destination: DEST,
        origin: ORIGIN,
        mode: "transit",
      })
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=37.3349%2C-122.009&travelmode=transit&origin=37.7749%2C-122.4194"
    );
  });

  test("Google place URL uses query lat,lng", () => {
    expect(
      buildGoogleMapsPlaceUrl({
        latitude: DEST.latitude,
        longitude: DEST.longitude,
      })
    ).toBe("https://www.google.com/maps/search/?api=1&query=37.3349%2C-122.009");
  });
});
