import { describe, expect, test } from "bun:test";
import {
  normalizeDirectionsResponse,
  type DirectionsApiResponse,
} from "../api/_utils/_mapkit-server.js";

describe("normalizeDirectionsResponse", () => {
  test("returns null when routes missing", () => {
    expect(normalizeDirectionsResponse(null)).toBeNull();
    expect(normalizeDirectionsResponse({ routes: [] })).toBeNull();
  });

  test("picks first route with finite distance/duration and maps step indexes", () => {
    const data: DirectionsApiResponse = {
      routes: [
        {
          name: "Main St",
          distanceMeters: 1000,
          durationSeconds: 120,
          transportType: "AUTOMOBILE",
          stepIndexes: [0, 1],
          hasTolls: false,
        },
      ],
      steps: [
        { distanceMeters: 0, durationSeconds: 0 },
        {
          distanceMeters: 100,
          durationSeconds: 30,
          instructions: "Turn left",
        },
      ],
    };
    const route = normalizeDirectionsResponse(data);
    expect(route).not.toBeNull();
    expect(route!.name).toBe("Main St");
    expect(route!.distanceMeters).toBe(1000);
    expect(route!.durationSeconds).toBe(120);
    expect(route!.transportType).toBe("AUTOMOBILE");
    expect(route!.steps).toHaveLength(2);
    expect(route!.steps[1].instructions).toBe("Turn left");
  });
});
