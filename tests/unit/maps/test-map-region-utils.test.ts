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
  initialHomeMapRegion,
  initialMapFrameSpanDeg,
  locateMeCameraMode,
  locateMeFocusRegion,
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

  test("Home start uses the same closer span; Taipei / granted GPS stay city-wide", () => {
    expect(initialMapFrameSpanDeg("home")).toBe(LOCATE_ME_SPAN_DEG);
    expect(initialMapFrameSpanDeg("grantedLocation")).toBe(CITY_LEVEL_SPAN_DEG);
    expect(initialMapFrameSpanDeg("defaultTaipei")).toBe(CITY_LEVEL_SPAN_DEG);
    expect(initialHomeMapRegion(HOME)).toEqual(locateMeFocusRegion(HOME));
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
    expect(layer).toContain('mode === "focus"');
    expect(layer).toContain("setRegionAnimated");
    expect(layer).toContain("setCenterAnimated");
    expect(layer).toContain("locateMeZoomAppliedRef");

    expect(controller).toContain("initialHomeMapRegion");
    expect(controller).toContain("initialMapFrameSpanDeg");
    expect(controller).toContain('initialMapFrameSpanDeg("grantedLocation")');
    expect(controller).toContain("defaultTaipeiMapRegion");
    expect(controller).not.toContain("frameAtCityLevel(home");
  });
});
