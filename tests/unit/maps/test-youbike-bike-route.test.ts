import { describe, expect, test } from "bun:test";
import {
  buildOsrmBikeUrl,
  parseBikeRouteQuery,
  parseOsrmRoute,
  youbikeBikeRouteCacheKey,
} from "../../../src/apps/maps/youbike/bikeRoute";
import {
  extractMapKitRoutePath,
  resolveMapKitTransport,
} from "../../../src/apps/maps/youbike/mapKitRoute";

const TAIPEI_101 = { latitude: 25.03396, longitude: 121.56447 };
const MAIN_STATION = { latitude: 25.04792, longitude: 121.51708 };

describe("parseBikeRouteQuery", () => {
  test("accepts a Taipei hop", () => {
    const parsed = parseBikeRouteQuery({
      fromLat: String(TAIPEI_101.latitude),
      fromLng: String(TAIPEI_101.longitude),
      toLat: String(MAIN_STATION.latitude),
      toLng: String(MAIN_STATION.longitude),
    });
    expect(parsed).toEqual({ from: TAIPEI_101, to: MAIN_STATION });
  });

  test("rejects San Francisco and inverted junk", () => {
    expect(
      parseBikeRouteQuery({
        fromLat: "37.7749",
        fromLng: "-122.4194",
        toLat: "37.78",
        toLng: "-122.41",
      })
    ).toEqual({ error: "not_in_taiwan" });
    expect(parseBikeRouteQuery({ fromLat: "x" })).toEqual({
      error: "invalid_coordinates",
    });
  });
});

describe("parseOsrmRoute", () => {
  test("reads GeoJSON LineString bike geometry", () => {
    const coordinates = Array.from({ length: 12 }, (_, i) => [
      121.564 + i * 0.001,
      25.034 + i * 0.0004,
    ]);
    const parsed = parseOsrmRoute({
      code: "Ok",
      routes: [
        {
          distance: 2460,
          duration: 720,
          geometry: { type: "LineString", coordinates },
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.path).toHaveLength(12);
    expect(parsed!.path[0]).toEqual({ latitude: 25.034, longitude: 121.564 });
    expect(parsed!.distanceMeters).toBe(2460);
    expect(parsed!.durationSeconds).toBe(720);
    expect(parsed!.provider).toBe("osrm-bike");
  });

  test("rejects a 2-point geodesic hop", () => {
    expect(
      parseOsrmRoute({
        code: "Ok",
        routes: [
          {
            distance: 100,
            duration: 20,
            geometry: {
              type: "LineString",
              coordinates: [
                [121.56447, 25.03396],
                [121.51708, 25.04792],
              ],
            },
          },
        ],
      })
    ).toBeNull();
  });
});

describe("buildOsrmBikeUrl", () => {
  test("fills the FOSSGIS bike template", () => {
    const url = buildOsrmBikeUrl(TAIPEI_101, MAIN_STATION);
    expect(url).toContain("routed-bike");
    expect(url).toContain("121.56447,25.03396");
    expect(url).toContain("121.51708,25.04792");
    expect(url).toContain("geometries=geojson");
  });
});

describe("youbikeBikeRouteCacheKey", () => {
  test("rounds to 5 decimals", () => {
    expect(
      youbikeBikeRouteCacheKey(
        { latitude: 25.03396111, longitude: 121.56446999 },
        MAIN_STATION
      )
    ).toBe("cache:youbike:route:v1:25.03396,121.56447:25.04792,121.51708");
  });
});

describe("MapKit cycling directions", () => {
  test("resolves WWDC25 Transport.Cycling", () => {
    expect(
      resolveMapKitTransport(
        { Transport: { Walking: "Walking", Cycling: "Cycling" } },
        "Cycling"
      )
    ).toBe("Cycling");
    expect(resolveMapKitTransport({}, "Cycling")).toBe("Cycling");
  });

  test("reads path or WWDC polyline overlay points", () => {
    expect(
      extractMapKitRoutePath({
        path: [
          { latitude: 25.03, longitude: 121.56 },
          { latitude: 25.04, longitude: 121.55 },
        ],
      })
    ).toHaveLength(2);
    expect(
      extractMapKitRoutePath({
        polyline: {
          points: [
            { latitude: 25.03, longitude: 121.56 },
            { latitude: 25.031, longitude: 121.559 },
            { latitude: 25.04, longitude: 121.55 },
          ],
        },
      })
    ).toHaveLength(3);
  });
});
