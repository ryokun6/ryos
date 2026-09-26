import { describe, expect, test } from "bun:test";
import { resolveMapKitTransport } from "../../../src/apps/maps/youbike/mapKitRoute";
import { buildDirectionsPlan } from "../../../src/apps/maps/directions/plan";
import {
  parseAppleMapsServerDirections,
  parseDirectionsQuery,
  serverTransportForMode,
  stepKindFromTransport,
} from "../../../src/apps/maps/directions/serverDirections";

const ORIGIN = { latitude: 37.7857, longitude: -122.4011 };
const DEST = { latitude: 37.7754, longitude: -122.3932 };

describe("resolveMapKitTransport", () => {
  test("resolves Automobile and Transit even when the enum is missing", () => {
    expect(resolveMapKitTransport({}, "Automobile")).toBe("Automobile");
    expect(resolveMapKitTransport({}, "Transit")).toBe("Transit");
    expect(
      resolveMapKitTransport(
        { Transport: { Automobile: "Automobile", Transit: "Transit" } },
        "Transit"
      )
    ).toBe("Transit");
  });

  test("keeps Walking and Cycling fallbacks", () => {
    expect(resolveMapKitTransport({}, "Walking")).toBe("Walking");
    expect(resolveMapKitTransport({}, "Cycling")).toBe("Cycling");
  });
});

describe("parseDirectionsQuery", () => {
  test("accepts drive and transit modes", () => {
    expect(
      parseDirectionsQuery({
        fromLat: "37.78",
        fromLng: "-122.4",
        toLat: "37.77",
        toLng: "-122.39",
        mode: "transit",
      })
    ).toEqual({
      from: { latitude: 37.78, longitude: -122.4 },
      to: { latitude: 37.77, longitude: -122.39 },
      mode: "transit",
    });
    expect(serverTransportForMode("drive")).toBe("Automobile");
    expect(serverTransportForMode("transit")).toBe("Transit");
  });

  test("rejects invalid coordinates", () => {
    expect(parseDirectionsQuery({ fromLat: "x" })).toEqual({
      error: "invalid_coordinates",
    });
  });
});

describe("parseAppleMapsServerDirections", () => {
  test("stitches stepPaths for the first route", () => {
    const plan = parseAppleMapsServerDirections(
      {
        routes: [
          {
            distanceMeters: 1200,
            durationSeconds: 480,
            stepIndexes: [0, 1],
          },
        ],
        steps: [
          {
            stepPathIndex: 0,
            distanceMeters: 400,
            durationSeconds: 160,
            instructions: "Head south",
            name: "4th St",
          },
          {
            stepPathIndex: 1,
            distanceMeters: 800,
            durationSeconds: 320,
            instructions: "Turn right onto King St",
            transportType: "Walking",
          },
        ],
        stepPaths: [
          [
            { latitude: 37.7857, longitude: -122.4011 },
            { latitude: 37.78, longitude: -122.4 },
          ],
          [
            { latitude: 37.78, longitude: -122.4 },
            { latitude: 37.7754, longitude: -122.3932 },
          ],
        ],
      },
      {
        mode: "transit",
        origin: ORIGIN,
        destination: DEST,
        destinationLabel: "Library",
      }
    );
    expect(plan).not.toBeNull();
    expect(plan!.distanceMeters).toBe(1200);
    expect(plan!.durationSeconds).toBe(480);
    expect(plan!.path).toHaveLength(3);
    expect(plan!.steps).toHaveLength(2);
    expect(plan!.steps[0]!.kind).toBe("transit");
    expect(plan!.steps[1]!.kind).toBe("walk");
    expect(plan!.steps[1]!.instruction).toBe("Turn right onto King St");
    expect(plan!.provider).toBe("maps-server");
  });
});

describe("buildDirectionsPlan", () => {
  test("maps MapKit steps onto a drive plan", () => {
    const plan = buildDirectionsPlan({
      mode: "drive",
      origin: ORIGIN,
      destination: DEST,
      destinationLabel: "Library",
      path: [ORIGIN, DEST],
      distanceMeters: 900,
      durationSeconds: 180,
      steps: [
        {
          instruction: "Head south",
          streetName: "4th St",
          distanceMeters: 900,
          location: ORIGIN,
          path: [ORIGIN, DEST],
        },
      ],
    });
    expect(plan.mode).toBe("drive");
    expect(plan.steps[0]!.kind).toBe("drive");
    expect(plan.provider).toBe("mapkit-js");
  });
});

describe("stepKindFromTransport", () => {
  test("walk overrides the requested mode", () => {
    expect(stepKindFromTransport("transit", "Walking")).toBe("walk");
    expect(stepKindFromTransport("drive")).toBe("drive");
  });
});
