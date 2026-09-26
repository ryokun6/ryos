import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CITY_LEVEL_SPAN_DEG,
  DEFAULT_MAP_CENTER,
  FOCUS_PLACE_SPAN_DEG,
  LOCATE_ME_SPAN_DEG,
} from "../../../src/apps/maps/components/maps-app/mapsUiState";
import {
  defaultTaipeiMapRegion,
  geoIpCityMapRegion,
  initialHomeMapRegion,
  initialMapFrameSpanDeg,
  locateMeCameraMode,
  locateMeFocusRegion,
  visibleMapSpanDeg,
} from "../../../src/apps/maps/components/maps-app/mapRegionUtils";
import { shouldRenderYouBikeOverlayForSpan } from "../../../src/apps/maps/youbike/stationVisuals";

const HOME = { latitude: 37.7749, longitude: -122.4194 };

describe("locate / home camera spans", () => {
  test("Locate Me reuses the neighborhood place-focus span, not city-wide", () => {
    expect(LOCATE_ME_SPAN_DEG).toBe(FOCUS_PLACE_SPAN_DEG);
    expect(LOCATE_ME_SPAN_DEG).toBeLessThan(CITY_LEVEL_SPAN_DEG);
    expect(LOCATE_ME_SPAN_DEG).toBeGreaterThan(0.004);
    expect(shouldRenderYouBikeOverlayForSpan(LOCATE_ME_SPAN_DEG)).toBe(true);
  });

  test("Locate Me first fix focuses; later ticks only recenter", () => {
    expect(
      locateMeCameraMode({
        locateMeEnabled: false,
        hasAppliedFocusZoom: false,
      })
    ).toBe("idle");
    expect(
      locateMeCameraMode({
        locateMeEnabled: false,
        hasAppliedFocusZoom: true,
      })
    ).toBe("idle");
    expect(
      locateMeCameraMode({
        locateMeEnabled: true,
        hasAppliedFocusZoom: false,
      })
    ).toBe("focus");
    expect(
      locateMeCameraMode({
        locateMeEnabled: true,
        hasAppliedFocusZoom: true,
      })
    ).toBe("recenter");
    expect(
      locateMeCameraMode({
        locateMeEnabled: true,
        hasAppliedFocusZoom: false,
        currentSpanDeg: CITY_LEVEL_SPAN_DEG,
      })
    ).toBe("focus");
    expect(
      locateMeCameraMode({
        locateMeEnabled: true,
        hasAppliedFocusZoom: false,
        currentSpanDeg: LOCATE_ME_SPAN_DEG,
      })
    ).toBe("recenter");
    expect(
      locateMeCameraMode({
        locateMeEnabled: true,
        hasAppliedFocusZoom: false,
        currentSpanDeg: LOCATE_ME_SPAN_DEG / 2,
      })
    ).toBe("recenter");
  });

  test("visible span is the wider axis of the current region", () => {
    expect(
      visibleMapSpanDeg({
        center: HOME,
        span: { latitudeDelta: 0.004, longitudeDelta: 0.009 },
      })
    ).toBe(0.009);
    expect(visibleMapSpanDeg(null)).toBeNull();
  });

  test("Locate Me focus region is a square neighborhood span around the fix", () => {
    expect(locateMeFocusRegion(HOME)).toEqual({
      center: HOME,
      span: {
        latitudeDelta: LOCATE_ME_SPAN_DEG,
        longitudeDelta: LOCATE_ME_SPAN_DEG,
      },
    });
  });

  test("Home start uses the same closer span; GeoIP / Taipei / granted GPS stay city-wide", () => {
    expect(initialMapFrameSpanDeg("home")).toBe(LOCATE_ME_SPAN_DEG);
    expect(initialMapFrameSpanDeg("grantedLocation")).toBe(CITY_LEVEL_SPAN_DEG);
    expect(initialMapFrameSpanDeg("geoip")).toBe(CITY_LEVEL_SPAN_DEG);
    expect(initialMapFrameSpanDeg("defaultTaipei")).toBe(CITY_LEVEL_SPAN_DEG);
    expect(initialHomeMapRegion(HOME)).toEqual(locateMeFocusRegion(HOME));
    expect(geoIpCityMapRegion(HOME)).toEqual({
      center: HOME,
      span: {
        latitudeDelta: CITY_LEVEL_SPAN_DEG,
        longitudeDelta: CITY_LEVEL_SPAN_DEG,
      },
    });
    expect(defaultTaipeiMapRegion()).toEqual({
      center: DEFAULT_MAP_CENTER,
      span: {
        latitudeDelta: CITY_LEVEL_SPAN_DEG,
        longitudeDelta: CITY_LEVEL_SPAN_DEG,
      },
    });
    expect(DEFAULT_MAP_CENTER).toEqual({
      latitude: 25.03396,
      longitude: 121.56447,
    });
  });
});

describe("locate / home camera wiring", () => {
  test("Locate Me follow zooms on first fix and Home framing uses the closer span", () => {
    const layer = readFileSync(
      resolve(
        import.meta.dir,
        "../../../src/apps/maps/hooks/useYouBikeLayer.ts"
      ),
      "utf8"
    );
    const controller = readFileSync(
      resolve(
        import.meta.dir,
        "../../../src/apps/maps/components/maps-app/useMapsAppController.ts"
      ),
      "utf8"
    );

    expect(layer).toContain("locateMeCameraMode");
    expect(layer).toContain("locateMeFocusRegion");
    expect(layer).toContain("visibleMapSpanDeg");
    expect(layer).toContain("currentSpanDeg");
    expect(layer).toContain('mode === "focus"');
    expect(layer).toContain("setRegionAnimated");
    expect(layer).toContain("setCenterAnimated");
    expect(layer).toContain("locateMeZoomAppliedRef");

    expect(controller).toContain("initialHomeMapRegion");
    expect(controller).toContain("initialMapFrameSpanDeg");
    expect(controller).toContain('initialMapFrameSpanDeg("grantedLocation")');
    expect(controller).toContain('initialMapFrameSpanDeg("geoip")');
    expect(controller).toContain("defaultTaipeiMapRegion");
    expect(controller).toContain("geoIpCityMapRegion");
    expect(controller).toContain("fetchApproximateCityLocation");
    expect(controller).toContain("frameAtHomeOrGeoIp");
    expect(controller).not.toContain("frameAtCityLevel(home");

    const handleStart = controller.indexOf("const handleLocateMe");
    const handleEnd = controller.indexOf("}, []);", handleStart);
    const handleLocateMe = controller.slice(handleStart, handleEnd);
    expect(handleLocateMe).toContain("map.showsUserLocation = next");
    expect(handleLocateMe).toContain("map.tracksUserLocation = next");
    expect(handleLocateMe).not.toContain("setRegionAnimated");
    expect(handleLocateMe).not.toContain("setCenterAnimated");
    expect(handleLocateMe).not.toContain("geoIpCityMapRegion");
    expect(handleLocateMe).not.toContain("defaultTaipeiMapRegion");

    const stopStart = layer.indexOf("if (!shouldWatch || mapReadyTick === 0)");
    const stopEnd = layer.indexOf("const map = mapInstanceRef.current;", stopStart);
    const stopWatch = layer.slice(stopStart, stopEnd);
    expect(stopWatch).toContain("removeUserPuck");
    expect(stopWatch).not.toContain("setRegionAnimated");
    expect(stopWatch).not.toContain("setCenterAnimated");
    expect(stopWatch).not.toContain("followUserOnMap");
  });
});
