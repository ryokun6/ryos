import { describe, expect, test } from "bun:test";
import {
  isDistinctFrom,
  pickDirectionsOrigin,
} from "../../../src/apps/maps/directions/origin";

const DEST = { latitude: 25.03396, longitude: 121.56447 };
const HOME = { latitude: 25.04, longitude: 121.5 };
const CENTER = { latitude: 25.05, longitude: 121.52 };

describe("pickDirectionsOrigin", () => {
  test("prefers live user location over Home", () => {
    const user = { latitude: 25.0479, longitude: 121.517 };
    expect(
      pickDirectionsOrigin({
        userLocation: user,
        home: HOME,
        destination: DEST,
      })
    ).toEqual(user);
  });

  test("falls back to Home then Work", () => {
    expect(
      pickDirectionsOrigin({
        home: HOME,
        work: { latitude: 25.06, longitude: 121.51 },
        destination: DEST,
      })
    ).toEqual(HOME);
  });

  test("uses a distinct map center when nothing else is available", () => {
    expect(
      pickDirectionsOrigin({
        mapCenter: CENTER,
        destination: DEST,
      })
    ).toEqual(CENTER);
  });

  test("rejects a map center that is the destination pin", () => {
    expect(
      pickDirectionsOrigin({
        mapCenter: DEST,
        destination: DEST,
      })
    ).toEqual({ error: "no_origin" });
  });

  test("returns no_origin when every candidate is missing", () => {
    expect(pickDirectionsOrigin({ destination: DEST })).toEqual({
      error: "no_origin",
    });
  });
});

describe("isDistinctFrom", () => {
  test("treats tiny deltas as the same point", () => {
    expect(
      isDistinctFrom(DEST, {
        latitude: DEST.latitude + 0.0005,
        longitude: DEST.longitude,
      })
    ).toBe(false);
    expect(isDistinctFrom(DEST, CENTER)).toBe(true);
  });
});
