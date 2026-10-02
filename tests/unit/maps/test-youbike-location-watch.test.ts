import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  YOUBIKE_NAV_WATCH_OPTIONS,
  coordinateFromUserLocationEvent,
  createYouBikeUserPuckElement,
  geoPointFromCoords,
  isDistinctUserLocation,
  nextLocateMeAction,
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
  test("watches whenever Locate Me is on, even without navigation", () => {
    expect(shouldWatchYouBikeUserLocation({ locateMeEnabled: true })).toBe(true);
    expect(shouldWatchYouBikeUserLocation({ locateMeEnabled: false })).toBe(
      false
    );
  });
});

describe("nextLocateMeAction", () => {
  test("off starts tracking (prompts for location)", () => {
    expect(
      nextLocateMeAction({ enabled: false, followPaused: false, hasFix: false })
    ).toBe("start");
    expect(
      nextLocateMeAction({ enabled: false, followPaused: true, hasFix: true })
    ).toBe("start");
  });

  test("with a fix, taps toggle auto-recenter instead of stopping", () => {
    expect(
      nextLocateMeAction({ enabled: true, followPaused: false, hasFix: true })
    ).toBe("pause");
    expect(
      nextLocateMeAction({ enabled: true, followPaused: true, hasFix: true })
    ).toBe("resume");
  });

  test("paused after a pan resumes even before a fix arrives", () => {
    expect(
      nextLocateMeAction({ enabled: true, followPaused: true, hasFix: false })
    ).toBe("resume");
  });

  test("no fix yet (prompt pending / denied) stops so the next tap asks again", () => {
    expect(
      nextLocateMeAction({ enabled: true, followPaused: false, hasFix: false })
    ).toBe("stop");
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
  test("layer watches GPS whenever Locate Me is on and tears it down", () => {
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
    expect(layer).not.toContain("isNavigating");
    expect(card).toContain("onNavigatingChange");
    expect(card).toContain("followUserLocation");
    expect(card).toContain("onNavigatingChange?.(true)");
    expect(card).toContain("onNavigatingChange?.(false)");
    expect(card.indexOf("speakStart(index)")).toBeLessThan(
      card.indexOf("onNavigatingChange?.(true)")
    );
    expect(app).not.toContain("onStartNavigation={handleLocateMe}");
    expect(app).not.toContain("onNavigatingChange=");
    expect(app).toContain(
      "followUserLocation={locateMeEnabled && !locateMeFollowPaused}"
    );
    const controller = readFileSync(
      resolve(
        import.meta.dir,
        "../../../src/apps/maps/components/maps-app/useMapsAppController.ts"
      ),
      "utf8"
    );
    expect(controller).toContain("nextLocateMeAction");
    expect(controller).not.toContain("isNavigating: youbikeNavigating");
  });

  test("user pan pauses follow; Locate Me tap recenters and resumes it", () => {
    const read = (path: string) =>
      readFileSync(resolve(import.meta.dir, "../../../", path), "utf8");
    const layer = read("src/apps/maps/hooks/useYouBikeLayer.ts");
    const controller = read(
      "src/apps/maps/components/maps-app/useMapsAppController.ts"
    );
    const app = read("src/apps/maps/components/maps-app/MapsAppComponent.tsx");
    const chrome = read(
      "src/apps/maps/components/maps-app/MapsMapBottomChrome.tsx"
    );
    const card = read("src/apps/maps/components/MapsYouBikeRouteCard.tsx");

    // Only user-interaction events pause; programmatic recenters never do.
    expect(layer).toContain('map.addEventListener?.("scroll-start", onUserScrollStart)');
    expect(layer).toContain('map.addEventListener?.("zoom-end", onUserZoomEnd)');
    expect(layer).toContain('map.removeEventListener?.("scroll-start", onUserScrollStart)');
    expect(layer).toContain('map.removeEventListener?.("zoom-end", onUserZoomEnd)');
    expect(layer).not.toContain('"region-change-start"');
    expect(layer).toContain("isPointNearMapCenter");
    expect(layer).toContain("followPaused: locateMeFollowPausedRef.current");

    const resumeStart = layer.indexOf("const resumeLocateMeFollow");
    const resume = layer.slice(resumeStart, layer.indexOf("}, [", resumeStart));
    expect(resume).toContain("if (!locateMeEnabled) return;");
    expect(resume).toContain("setLocateMeFollowPaused(false)");
    expect(resume).toContain("followUserOnMap(point, camera)");

    // Locate Me off / map teardown clears the paused state.
    const stopStart = layer.indexOf("if (!shouldWatch || mapReadyTick === 0)");
    const stopWatch = layer.slice(
      stopStart,
      layer.indexOf("const map = mapInstanceRef.current;", stopStart)
    );
    expect(stopWatch).toContain("setLocateMeFollowPaused(false)");

    // Locate Me itself toggles auto-recenter once a fix exists; no extra button.
    const handleStart = controller.indexOf("const handleLocateMe");
    const handleLocateMe = controller.slice(
      handleStart,
      controller.indexOf("\n  }, [", handleStart)
    );
    expect(handleLocateMe).toContain("nextLocateMeAction");
    expect(handleLocateMe).toContain("hasFix: youbikeTrackedUser !== null");
    expect(handleLocateMe).toContain("pauseLocateMeFollow()");
    expect(handleLocateMe).toContain("resumeLocateMeFollow()");
    expect(app).toContain("locateMeTracking={locateMeEnabled}");
    expect(app).toContain(
      "locateMePressed={locateMeEnabled && !locateMeFollowPaused}"
    );
    expect(app).toContain("onLocateMe={handleLocateMe}");
    expect(app).not.toContain("Recenter");
    expect(chrome).not.toContain("onRecenter");
    expect(chrome).toContain(
      'weight={locateMeTracking && !locateMePressed ? "bold" : "fill"}'
    );

    // Pausing mid-ride must not reframe the step until the step changes.
    expect(card).toContain("}, [focusedIndex, isNavigating]);");
    expect(card).toContain("followUserLocationRef.current");
  });

  test("Locate Me keeps outline chrome and only blues the glyph when tracking", () => {
    const chrome = readFileSync(
      resolve(
        import.meta.dir,
        "../../../src/apps/maps/components/maps-app/MapsMapBottomChrome.tsx"
      ),
      "utf8"
    );
    expect(chrome).toContain("aria-pressed={locateMePressed}");
    expect(chrome).toContain('locateMeTracking ? "text-os-link"');
    expect(chrome).toContain('variant={isMacOSTheme ? "aqua" : "retro"}');
    expect(chrome).not.toContain("aqua-button primary");
    expect(chrome).not.toContain('variant="default"');
    expect(chrome).not.toContain("bg-os-selection-bg");
    expect(chrome).not.toContain("bg-primary");
  });
});
