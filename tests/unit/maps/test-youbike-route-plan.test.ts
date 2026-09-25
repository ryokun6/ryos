import { describe, expect, test } from "bun:test";
import { isInTaiwan } from "../../../src/apps/maps/youbike/geo";
import { DEFAULT_MAP_CENTER } from "../../../src/apps/maps/components/maps-app/mapsUiState";
import { pickNearestStation } from "../../../src/apps/maps/youbike/nearestStations";
import {
  isYouBikeRouteError,
  planYouBikeTrip,
} from "../../../src/apps/maps/youbike/routePlan";
import type { YouBikeStation } from "../../../src/apps/maps/youbike/types";

function station(
  id: string,
  latitude: number,
  longitude: number,
  extras: Partial<YouBikeStation> = {}
): YouBikeStation {
  return {
    id: `youbike:taipei:${id}`,
    stationId: id,
    city: "taipei",
    name: id,
    nameEn: id,
    address: "",
    addressEn: "",
    area: "",
    areaEn: "",
    latitude,
    longitude,
    bikesAvailable: 6,
    docksAvailable: 6,
    totalDocks: 12,
    isActive: true,
    updatedAt: null,
    source: "taipei",
    ...extras,
  };
}

const NEAR_ORIGIN = station("origin", 25.033, 121.565);
const NEAR_DEST = station("dest", 25.041, 121.56);
const EMPTY_ORIGIN = station("empty", 25.0331, 121.5651, { bikesAvailable: 0 });
const FULL_DEST = station("full", 25.0411, 121.5601, { docksAvailable: 0 });

describe("isInTaiwan", () => {
  test("accepts Taipei 101", () => {
    expect(isInTaiwan({ latitude: 25.03396, longitude: 121.56447 })).toBe(true);
  });

  test("rejects San Francisco", () => {
    expect(isInTaiwan({ latitude: 37.7749, longitude: -122.4194 })).toBe(false);
  });

  test("default map camera is in Taiwan", () => {
    expect(isInTaiwan(DEFAULT_MAP_CENTER)).toBe(true);
  });
});

describe("pickNearestStation", () => {
  test("prefers a station with bikes when required", () => {
    const hit = pickNearestStation(
      { latitude: 25.033, longitude: 121.565 },
      [EMPTY_ORIGIN, NEAR_ORIGIN],
      { requireBikes: true }
    );
    expect(hit?.station.stationId).toBe("origin");
  });

  test("returns null when nothing is in range", () => {
    const hit = pickNearestStation(
      { latitude: 24.0, longitude: 121.0 },
      [NEAR_ORIGIN],
      { maxDistanceMeters: 500 }
    );
    expect(hit).toBeNull();
  });
});

describe("planYouBikeTrip", () => {
  test("builds walk → bike → walk legs between distinct stations", () => {
    const plan = planYouBikeTrip({
      origin: { latitude: 25.0325, longitude: 121.5645 },
      destination: { latitude: 25.0415, longitude: 121.5595 },
      stations: [NEAR_ORIGIN, NEAR_DEST],
      originLabel: "Home",
      destinationLabel: "Work",
    });
    if (isYouBikeRouteError(plan)) {
      throw new Error(plan.error);
    }
    expect(plan.kind).toBe("youbike");
    expect(plan.originStation?.stationId).toBe("origin");
    expect(plan.destinationStation?.stationId).toBe("dest");
    expect(plan.legs.map((leg) => leg.mode)).toEqual(["walk", "bike", "walk"]);
    expect(plan.legs[1]?.path).toEqual([
      { latitude: NEAR_ORIGIN.latitude, longitude: NEAR_ORIGIN.longitude },
      { latitude: NEAR_DEST.latitude, longitude: NEAR_DEST.longitude },
    ]);
    expect(plan.totalDurationSeconds).toBeGreaterThan(0);
  });

  test("skips an empty start station when a stocked one is nearby", () => {
    const plan = planYouBikeTrip({
      origin: { latitude: 25.033, longitude: 121.565 },
      destination: { latitude: 25.0415, longitude: 121.5595 },
      stations: [EMPTY_ORIGIN, NEAR_ORIGIN, NEAR_DEST],
    });
    if (isYouBikeRouteError(plan)) {
      throw new Error(plan.error);
    }
    expect(plan.originStation?.stationId).toBe("origin");
  });

  test("prefers a dest station with docks", () => {
    const plan = planYouBikeTrip({
      origin: { latitude: 25.0325, longitude: 121.5645 },
      destination: { latitude: 25.041, longitude: 121.56 },
      stations: [NEAR_ORIGIN, FULL_DEST, NEAR_DEST],
    });
    if (isYouBikeRouteError(plan)) {
      throw new Error(plan.error);
    }
    expect(plan.destinationStation?.stationId).toBe("dest");
  });

  test("returns walk-only when origin and dest are the same block", () => {
    const plan = planYouBikeTrip({
      origin: { latitude: 25.033, longitude: 121.565 },
      destination: { latitude: 25.03305, longitude: 121.56505 },
      stations: [NEAR_ORIGIN, NEAR_DEST],
    });
    if (isYouBikeRouteError(plan)) {
      throw new Error(plan.error);
    }
    expect(plan.kind).toBe("walk");
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]?.mode).toBe("walk");
  });

  test("errors when no station is nearby", () => {
    const plan = planYouBikeTrip({
      origin: { latitude: 24.0, longitude: 121.0 },
      destination: { latitude: 24.01, longitude: 121.01 },
      stations: [NEAR_ORIGIN],
    });
    expect(isYouBikeRouteError(plan)).toBe(true);
    if (isYouBikeRouteError(plan)) {
      expect(plan.error).toBe("no_origin_station");
    }
  });
});
