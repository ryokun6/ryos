import { describe, expect, test } from "bun:test";
import type { YouBikeStation } from "../../../src/apps/maps/youbike/types";
import {
  YOUBIKE_COLOR_AVAILABLE,
  YOUBIKE_COLOR_EMPTY,
  YOUBIKE_COLOR_INACTIVE,
  YOUBIKE_COLOR_LOW,
  YOUBIKE_DOT_DIM_SIZE_PX,
  YOUBIKE_DOT_SELECTED_SIZE_PX,
  YOUBIKE_DOT_SIZE_PX,
  youbikeDotSizePx,
  youbikePinTitle,
  youbikeStationMarkerColor,
} from "../../../src/apps/maps/youbike/stationVisuals";

function station(overrides: Partial<YouBikeStation> = {}): YouBikeStation {
  return {
    id: "youbike:taipei:500101001",
    stationId: "500101001",
    city: "taipei",
    name: "捷運科技大樓站",
    nameEn: "MRT Technology Bldg. Sta.",
    address: "復興南路二段235號前",
    addressEn: "No.235, Sec. 2, Fuxing S. Rd.",
    area: "大安區",
    areaEn: "Daan Dist.",
    latitude: 25.02605,
    longitude: 121.5436,
    bikesAvailable: 12,
    docksAvailable: 16,
    totalDocks: 28,
    isActive: true,
    updatedAt: "2026-09-25T20:30:04",
    source: "taipei",
    ...overrides,
  };
}

describe("youbikePinTitle", () => {
  test("is the available bike count only", () => {
    expect(youbikePinTitle(station({ bikesAvailable: 12 }))).toBe("12");
    expect(youbikePinTitle(station({ bikesAvailable: 0 }))).toBe("0");
    expect(youbikePinTitle(station({ bikesAvailable: 3.7 }))).toBe("4");
  });

  test("never includes the station or dock name", () => {
    const title = youbikePinTitle(station({ name: "YouBike2.0_捷運科技大樓站" }));
    expect(title).toBe("12");
    expect(title).not.toContain("捷運");
    expect(title).not.toContain("YouBike");
    expect(title).not.toContain("Technology");
  });

  test("clamps non-finite and negative counts to 0", () => {
    expect(youbikePinTitle(station({ bikesAvailable: -2 }))).toBe("0");
    expect(youbikePinTitle(station({ bikesAvailable: Number.NaN }))).toBe("0");
  });
});

describe("youbikeStationMarkerColor", () => {
  test("maps availability to compact-dot colors", () => {
    expect(youbikeStationMarkerColor(station({ bikesAvailable: 12 }))).toBe(
      YOUBIKE_COLOR_AVAILABLE
    );
    expect(youbikeStationMarkerColor(station({ bikesAvailable: 3 }))).toBe(
      YOUBIKE_COLOR_LOW
    );
    expect(youbikeStationMarkerColor(station({ bikesAvailable: 0 }))).toBe(
      YOUBIKE_COLOR_EMPTY
    );
    expect(
      youbikeStationMarkerColor(station({ isActive: false, bikesAvailable: 8 }))
    ).toBe(YOUBIKE_COLOR_INACTIVE);
  });
});

describe("YouBike compact dots", () => {
  test("stay small enough for dense city zoom", () => {
    expect(YOUBIKE_DOT_SIZE_PX).toBeLessThanOrEqual(10);
    expect(YOUBIKE_DOT_SELECTED_SIZE_PX).toBeLessThanOrEqual(12);
    expect(YOUBIKE_DOT_SELECTED_SIZE_PX).toBeGreaterThan(YOUBIKE_DOT_SIZE_PX);
  });

  test("dim non-endpoint docks during an active route", () => {
    expect(youbikeDotSizePx("dimmed", false)).toBe(YOUBIKE_DOT_DIM_SIZE_PX);
    expect(YOUBIKE_DOT_DIM_SIZE_PX).toBeLessThan(YOUBIKE_DOT_SIZE_PX);
    expect(youbikeDotSizePx("endpoint", false)).toBe(YOUBIKE_DOT_SELECTED_SIZE_PX);
    expect(youbikeDotSizePx("dimmed", true)).toBe(YOUBIKE_DOT_SELECTED_SIZE_PX);
  });
});
