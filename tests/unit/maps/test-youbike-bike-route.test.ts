import { describe, expect, test } from "bun:test";
import {
  buildOsrmBikeUrl,
  parseBikeRouteQuery,
  parseOsrmRoute,
  youbikeBikeRouteCacheKey,
} from "../../../src/apps/maps/youbike/bikeRoute";
import {
  extractMapKitRoutePath,
  extractMapKitRouteSteps,
  resolveMapKitTransport,
} from "../../../src/apps/maps/youbike/mapKitRoute";
import {
  formatYouBikeStepLabel,
  localizeYouBikeStepLabel,
  youbikeNextStepIndex,
  youbikeStepFocusRegion,
} from "../../../src/apps/maps/youbike/routeSteps";
import type { YouBikeRouteStep } from "../../../src/apps/maps/youbike/types";

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
    expect(parsed!.steps).toEqual([]);
  });

  test("reads turn-by-turn street names from OSRM steps", () => {
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
          legs: [
            {
              steps: [
                {
                  name: "",
                  distance: 0,
                  duration: 0,
                  maneuver: { type: "depart", modifier: "east" },
                },
                {
                  name: "信義路三段",
                  distance: 180,
                  duration: 40,
                  maneuver: {
                    type: "turn",
                    modifier: "right",
                    location: [121.565, 25.0344],
                  },
                  geometry: {
                    coordinates: [
                      [121.565, 25.0344],
                      [121.566, 25.0348],
                      [121.567, 25.0352],
                    ],
                  },
                },
                {
                  name: "",
                  distance: 0,
                  duration: 0,
                  maneuver: { type: "notification" },
                },
                {
                  name: "",
                  distance: 0,
                  duration: 0,
                  maneuver: { type: "arrive" },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(parsed!.steps.map((step) => `${step.instruction}|${step.streetName}`)).toEqual([
      "Head east|",
      "Turn right|信義路三段",
      "Arrive|",
    ]);
    expect(parsed!.steps[1]?.distanceMeters).toBe(180);
    expect(parsed!.steps[1]?.location).toEqual({
      latitude: 25.0344,
      longitude: 121.565,
    });
    expect(parsed!.steps[1]?.path).toHaveLength(3);
    expect(parsed!.steps[1]?.maneuver).toEqual({ type: "turn", modifier: "right" });
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
    expect(url).toContain("steps=true");
  });
});

describe("youbikeBikeRouteCacheKey", () => {
  test("rounds to 5 decimals", () => {
    expect(
      youbikeBikeRouteCacheKey(
        { latitude: 25.03396111, longitude: 121.56446999 },
        MAIN_STATION
      )
    ).toBe("cache:youbike:route:v3:25.03396,121.56447:25.04792,121.51708");
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

  test("reads turn instructions and keeps street names that are already in the text", () => {
    const steps = extractMapKitRouteSteps({
      steps: [
        { instructions: "Turn right onto Ren'ai Road", distance: 240, name: "Ren'ai Road" },
        { instructions: "Continue", distance: 80 },
        { instructions: "  ", distance: 0 },
      ],
    });
    expect(steps).toEqual([
      {
        instruction: "Turn right onto Ren'ai Road",
        streetName: "Ren'ai Road",
        distanceMeters: 240,
      },
      { instruction: "Continue", streetName: "", distanceMeters: 80 },
    ]);
    expect(formatYouBikeStepLabel(steps[0]!)).toBe("Turn right onto Ren'ai Road");
    expect(
      formatYouBikeStepLabel({ instruction: "Turn right", streetName: "信義路三段" })
    ).toBe("Turn right · 信義路三段");
  });

  test("reads the maneuver coordinate so a step can move the map", () => {
    const steps = extractMapKitRouteSteps({
      steps: [
        {
          instructions: "Turn right onto Ren'ai Road",
          distance: 240,
          path: [
            { latitude: 25.033, longitude: 121.543 },
            { latitude: 25.034, longitude: 121.545 },
          ],
        },
      ],
    });
    expect(steps[0]?.location).toEqual({ latitude: 25.033, longitude: 121.543 });
    expect(steps[0]?.path).toHaveLength(2);
    const focus = youbikeStepFocusRegion({
      location: steps[0]?.location,
      path: steps[0]?.path,
    });
    expect(focus).not.toBeNull();
    expect(focus!.center.latitude).toBeLessThan(25.0335);
    expect(focus!.latitudeDelta).toBeLessThanOrEqual(0.04);
  });

  test("localizes OSRM maneuver phrases and keeps MapKit text", () => {
    const translate = (
      key: string,
      options?: { defaultValue?: string; direction?: string }
    ) => {
      if (key.endsWith(".turn")) return `轉{{direction}}`.replace("{{direction}}", options?.direction ?? "");
      if (key.endsWith(".right")) return "右";
      return options?.defaultValue ?? key;
    };
    expect(
      localizeYouBikeStepLabel(
        {
          instruction: "Turn right",
          streetName: "信義路三段",
          maneuver: { type: "turn", modifier: "right" },
        },
        translate
      )
    ).toBe("轉右 · 信義路三段");
    expect(
      localizeYouBikeStepLabel(
        { instruction: "右轉進入仁愛路", streetName: "仁愛路" },
        translate
      )
    ).toBe("右轉進入仁愛路");
  });

  test("highlights the step under the rider and ignores an off-route fix", () => {
    const step = (
      path: Array<{ latitude: number; longitude: number }>
    ): YouBikeRouteStep => ({
      mode: "bike",
      instruction: "Continue",
      streetName: "",
      distanceMeters: 100,
      durationSeconds: 40,
      location: path[0],
      path,
    });
    const steps = [
      step([
        { latitude: 25.033, longitude: 121.54 },
        { latitude: 25.034, longitude: 121.54 },
      ]),
      step([
        { latitude: 25.034, longitude: 121.54 },
        { latitude: 25.036, longitude: 121.54 },
      ]),
    ];
    expect(
      youbikeNextStepIndex(steps, { latitude: 25.033, longitude: 121.54 })
    ).toBe(0);
    expect(
      youbikeNextStepIndex(steps, { latitude: 25.035, longitude: 121.54 })
    ).toBe(1);
    expect(
      youbikeNextStepIndex(steps, { latitude: 25.034, longitude: 121.54 })
    ).toBe(1);
    expect(
      youbikeNextStepIndex(steps, { latitude: 25.05, longitude: 121.5 })
    ).toBeNull();
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
