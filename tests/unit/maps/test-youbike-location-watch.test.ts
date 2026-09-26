import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  YOUBIKE_NAV_WATCH_OPTIONS,
  coordinateFromUserLocationEvent,
  createYouBikeUserPuckElement,
  geoPointFromCoords,
  isDistinctUserLocation,
  nextLocateMeEnabled,
  shouldWatchYouBikeUserLocation,
  startYouBikeUserLocationWatch,
  type GeolocationWatchLike,
} from "../../../src/apps/maps/youbike/locationWatch";

function mockGeolocation() {
  const watches = new Map<
    number,
    {
      success: (position: { coords: { latitude: number; longitude: number } }) => void;
      error?: (error: { code?: number; message?: string }) => void;
      options?: PositionOptions;
    }
  >();
  let nextId = 1;
  const geolocation: GeolocationWatchLike = {
    watchPosition(success, error, options) {
      const id = nextId++;
      watches.set(id, { success, error, options });
      return id;
    },
    clearWatch(id) {
      watches.delete(id);
    },
  };
  return { geolocation, watches };
}

describe("shouldWatchYouBikeUserLocation", () => {
  test("watches only when Locate Me and navigation are both on", () => {
    expect(
      shouldWatchYouBikeUserLocation({
        locateMeEnabled: true,
        isNavigating: true,
      })
    ).toBe(true);
    expect(
      shouldWatchYouBikeUserLocation({
        locateMeEnabled: true,
        isNavigating: false,
      })
    ).toBe(false);
    expect(
      shouldWatchYouBikeUserLocation({
        locateMeEnabled: false,
        isNavigating: true,
      })
    ).toBe(false);
    expect(
      shouldWatchYouBikeUserLocation({
        locateMeEnabled: false,
        isNavigating: false,
      })
    ).toBe(false);
  });
});

describe("nextLocateMeEnabled", () => {
  test("keeps Locate Me on outside navigation so a second tap recenters", () => {
    expect(
      nextLocateMeEnabled({ currentlyEnabled: false, isNavigating: false })
    ).toBe(true);
    expect(
      nextLocateMeEnabled({ currentlyEnabled: true, isNavigating: false })
    ).toBe(true);
    expect(
      nextLocateMeEnabled({ currentlyEnabled: false, isNavigating: true })
    ).toBe(true);
  });

  test("turns Locate Me off when it is already on during navigation", () => {
    expect(
      nextLocateMeEnabled({ currentlyEnabled: true, isNavigating: true })
    ).toBe(false);
  });
});

describe("isDistinctUserLocation", () => {
  test("accepts the first valid fix and ignores sub-meter jitter", () => {
    const first = { latitude: 25.033, longitude: 121.565 };
    expect(isDistinctUserLocation(null, first)).toBe(true);
    expect(
      isDistinctUserLocation(first, {
        latitude: 25.033000004,
        longitude: 121.565000004,
      })
    ).toBe(false);
    expect(
      isDistinctUserLocation(first, { latitude: 25.034, longitude: 121.566 })
    ).toBe(true);
    expect(
      isDistinctUserLocation(first, { latitude: 999, longitude: 121.565 })
    ).toBe(false);
  });
});

describe("coordinateFromUserLocationEvent", () => {
  test("reads MapKit event.coordinate and rejects empty events", () => {
    expect(
      coordinateFromUserLocationEvent({
        coordinate: { latitude: 25.04, longitude: 121.56 },
      })
    ).toEqual({ latitude: 25.04, longitude: 121.56 });
    expect(coordinateFromUserLocationEvent(undefined)).toBeNull();
    expect(coordinateFromUserLocationEvent({})).toBeNull();
    expect(geoPointFromCoords({ latitude: "x", longitude: 121 })).toBeNull();
    expect(geoPointFromCoords(undefined)).toBeNull();
    expect(geoPointFromCoords({})).toBeNull();
  });
});

describe("startYouBikeUserLocationWatch", () => {
  test("starts watchPosition and delivers successive GPS updates", () => {
    const { geolocation, watches } = mockGeolocation();
    const points: Array<{ latitude: number; longitude: number }> = [];
    const watch = startYouBikeUserLocationWatch({
      geolocation,
      onUpdate: (point) => points.push(point),
    });

    expect(watch.source).toBe("geolocation");
    expect(watches.size).toBe(1);
    const entry = [...watches.values()][0]!;
    expect(entry.options).toEqual(YOUBIKE_NAV_WATCH_OPTIONS);

    entry.success({ coords: { latitude: 25.033, longitude: 121.565 } });
    entry.success({ coords: { latitude: 25.034, longitude: 121.566 } });
    expect(points).toEqual([
      { latitude: 25.033, longitude: 121.565 },
      { latitude: 25.034, longitude: 121.566 },
    ]);
  });

  test("stop clears the watcher once and ignores later fixes", () => {
    const { geolocation, watches } = mockGeolocation();
    const points: Array<{ latitude: number; longitude: number }> = [];
    const watch = startYouBikeUserLocationWatch({
      geolocation,
      onUpdate: (point) => points.push(point),
    });
    const entry = [...watches.values()][0]!;
    watch.stop();
    watch.stop();
    expect(watches.size).toBe(0);
    entry.success({ coords: { latitude: 25.04, longitude: 121.5 } });
    expect(points).toEqual([]);
  });

  test("returns a no-op when watchPosition is missing", () => {
    const points: unknown[] = [];
    const watch = startYouBikeUserLocationWatch({
      geolocation: null,
      onUpdate: (point) => points.push(point),
    });
    expect(watch.source).toBe("none");
    watch.stop();
    expect(points).toEqual([]);
  });

  test("skips invalid coordinates and forwards watch errors", () => {
    const { geolocation, watches } = mockGeolocation();
    const points: unknown[] = [];
    const errors: Array<{ message?: string }> = [];
    startYouBikeUserLocationWatch({
      geolocation,
      onUpdate: (point) => points.push(point),
      onError: (error) => errors.push(error),
    });
    const entry = [...watches.values()][0]!;
    entry.success({ coords: { latitude: 999, longitude: 0 } });
    entry.error?.({ code: 3, message: "timeout" });
    expect(points).toEqual([]);
    expect(errors).toEqual([{ code: 3, message: "timeout" }]);
  });
});

describe("createYouBikeUserPuckElement", () => {
  test("builds an Apple-blue puck node", () => {
    if (typeof document === "undefined") return;
    const el = createYouBikeUserPuckElement();
    expect(el.getAttribute("data-youbike-user-puck")).toBe("true");
    expect(el.style.background).toBe("#007aff");
    expect(el.style.borderRadius).toBe("50%");
  });
});

describe("YouBike navigation location wiring", () => {
  test("layer watches GPS during Locate Me + navigation and tears it down", () => {
    const layer = readFileSync(
      resolve(import.meta.dir, "../../../src/apps/maps/hooks/useYouBikeLayer.ts"),
      "utf8"
    );
    const card = readFileSync(
      resolve(
        import.meta.dir,
        "../../../src/apps/maps/components/MapsYouBikeRouteCard.tsx"
      ),
      "utf8"
    );
    const app = readFileSync(
      resolve(
        import.meta.dir,
        "../../../src/apps/maps/components/maps-app/MapsAppComponent.tsx"
      ),
      "utf8"
    );
    expect(layer).toContain("shouldWatchYouBikeUserLocation");
    expect(layer).toContain("startYouBikeUserLocationWatch");
    expect(layer).toContain("coordinateFromUserLocationEvent");
    expect(layer).toContain("watch.stop()");
    expect(layer).toContain("locateMeEnabled");
    expect(layer).toContain("isNavigating");
    expect(card).toContain("onNavigatingChange");
    expect(card).toContain("followUserLocation");
    expect(card).toContain("onNavigatingChange?.(true)");
    expect(card).toContain("onNavigatingChange?.(false)");
    expect(card.indexOf("speakStart(index)")).toBeLessThan(
      card.indexOf("onNavigatingChange?.(true)")
    );
    expect(app).not.toContain("onStartNavigation={handleLocateMe}");
    expect(app).toContain("onNavigatingChange=");
    expect(app).toContain("followUserLocation={locateMeEnabled}");
    const controller = readFileSync(
      resolve(
        import.meta.dir,
        "../../../src/apps/maps/components/maps-app/useMapsAppController.ts"
      ),
      "utf8"
    );
    expect(controller).toContain("nextLocateMeEnabled");
    expect(controller).toContain("isNavigating: youbikeNavigating");
  });
});
