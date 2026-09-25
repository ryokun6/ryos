import { describe, expect, test } from "bun:test";
import { CITY_LEVEL_SPAN_DEG, FOCUS_PLACE_SPAN_DEG } from "../../../src/apps/maps/components/maps-app/mapsUiState";
import { CITY_LEVEL_MAX_SPAN_DEG } from "../../../src/apps/maps/utils/mapMarkerClustering";
import { poiVisualGradient } from "../../../src/apps/maps/utils/poiVisuals";
import type { YouBikeStation } from "../../../src/apps/maps/youbike/types";
import {
  YOUBIKE_COLOR_AVAILABLE,
  YOUBIKE_COLOR_EMPTY,
  YOUBIKE_COLOR_INACTIVE,
  YOUBIKE_COLOR_LOW,
  YOUBIKE_DOT_DIM_OPACITY,
  YOUBIKE_DOT_DIM_SIZE_PX,
  YOUBIKE_DOT_SELECTED_SIZE_PX,
  YOUBIKE_DOT_SIZE_PX,
  YOUBIKE_MAX_RENDER_SPAN_DEG,
  YOUBIKE_POI_VISUAL,
  applyYouBikeDotAppearance,
  shouldRenderYouBikeOverlayForSpan,
  youbikeDotIsPrimary,
  youbikeDotOpacity,
  youbikeDotSizePx,
  youbikePinTitle,
  youbikeShouldPaintDot,
  youbikeStationMarkerColor,
  youbikeStationMarkerGradient,
  youbikeStationMarkerVisual,
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
    expect(YOUBIKE_DOT_SIZE_PX).toBeLessThanOrEqual(6);
    expect(YOUBIKE_DOT_DIM_SIZE_PX).toBe(YOUBIKE_DOT_SIZE_PX);
    expect(YOUBIKE_DOT_SELECTED_SIZE_PX).toBeLessThanOrEqual(12);
    expect(YOUBIKE_DOT_SELECTED_SIZE_PX).toBeGreaterThan(YOUBIKE_DOT_SIZE_PX);
  });

  test("keeps browse and background docks dim; only route ends are full", () => {
    expect(youbikeDotSizePx("dimmed")).toBe(YOUBIKE_DOT_DIM_SIZE_PX);
    expect(youbikeDotSizePx("normal")).toBe(YOUBIKE_DOT_DIM_SIZE_PX);
    expect(youbikeDotOpacity("dimmed")).toBe(YOUBIKE_DOT_DIM_OPACITY);
    expect(youbikeDotOpacity("normal")).toBe(YOUBIKE_DOT_DIM_OPACITY);
    expect(youbikeDotIsPrimary("dimmed")).toBe(false);
    expect(youbikeDotIsPrimary("normal")).toBe(false);
    expect(youbikeDotSizePx("endpoint")).toBe(YOUBIKE_DOT_SELECTED_SIZE_PX);
    expect(youbikeDotOpacity("endpoint")).toBe("1");
    expect(youbikeDotIsPrimary("endpoint")).toBe(true);
  });

  test("uses the same shallow POI gradient as regular badges", () => {
    const available = station({ bikesAvailable: 12 });
    expect(youbikeStationMarkerVisual(available)).toEqual(YOUBIKE_POI_VISUAL);
    expect(youbikeStationMarkerGradient(available)).toBe(
      poiVisualGradient(YOUBIKE_POI_VISUAL)
    );
    expect(youbikeStationMarkerGradient(available)).toContain("linear-gradient");
    expect(youbikeStationMarkerGradient(available)).toContain("color-mix");
    expect(youbikeStationMarkerGradient(station({ bikesAvailable: 3 }))).toBe(
      poiVisualGradient(youbikeStationMarkerVisual(station({ bikesAvailable: 3 })))
    );
    expect(
      youbikeStationMarkerGradient(station({ isActive: false, bikesAvailable: 8 }))
    ).toContain(YOUBIKE_COLOR_INACTIVE);
  });

  test("paints a borderless gradient disk", () => {
    const el = {
      style: {} as Record<string, string>,
    };
    applyYouBikeDotAppearance(el as unknown as HTMLElement, station());
    expect(el.style.border).toBe("none");
    expect(el.style.outline).toBe("none");
    expect(el.style.backgroundImage).toBe(youbikeStationMarkerGradient(station()));
    expect(el.style.backgroundColor).toBe(YOUBIKE_COLOR_AVAILABLE);
    expect(el.style.backgroundImage).not.toContain("#ffffff");
    expect(el.style.border).not.toContain("white");
    expect(el.style.width).toBe(`${YOUBIKE_DOT_DIM_SIZE_PX}px`);
    expect(el.style.opacity).toBe(YOUBIKE_DOT_DIM_OPACITY);
  });

  test("only route endpoints get full size and opacity", () => {
    const browse = { style: {} as Record<string, string> };
    applyYouBikeDotAppearance(browse as unknown as HTMLElement, station(), {
      selected: true,
      emphasis: "dimmed",
    });
    expect(browse.style.width).toBe(`${YOUBIKE_DOT_DIM_SIZE_PX}px`);
    expect(browse.style.opacity).toBe(YOUBIKE_DOT_DIM_OPACITY);
    expect(browse.style.boxShadow).toBe("none");

    const endpoint = { style: {} as Record<string, string> };
    applyYouBikeDotAppearance(endpoint as unknown as HTMLElement, station(), {
      emphasis: "endpoint",
    });
    expect(endpoint.style.width).toBe(`${YOUBIKE_DOT_SELECTED_SIZE_PX}px`);
    expect(endpoint.style.opacity).toBe("1");
    expect(endpoint.style.boxShadow).not.toBe("none");
  });

  test("stays hidden at city-scale cameras", () => {
    expect(YOUBIKE_MAX_RENDER_SPAN_DEG).toBe(CITY_LEVEL_MAX_SPAN_DEG);
    expect(YOUBIKE_MAX_RENDER_SPAN_DEG).toBeLessThan(CITY_LEVEL_SPAN_DEG);
    expect(shouldRenderYouBikeOverlayForSpan(CITY_LEVEL_SPAN_DEG)).toBe(false);
    expect(shouldRenderYouBikeOverlayForSpan(0.4)).toBe(false);
    expect(shouldRenderYouBikeOverlayForSpan(FOCUS_PLACE_SPAN_DEG)).toBe(true);
    expect(shouldRenderYouBikeOverlayForSpan(YOUBIKE_MAX_RENDER_SPAN_DEG)).toBe(
      true
    );
  });

  test("hides other small dots while a dock is selected", () => {
    const selected = "youbike:taipei:a";
    const endpoints = ["youbike:taipei:start", "youbike:taipei:end"];
    expect(
      youbikeShouldPaintDot("youbike:taipei:a", { selectedYoubikeId: selected })
    ).toBe(true);
    expect(
      youbikeShouldPaintDot("youbike:taipei:b", { selectedYoubikeId: selected })
    ).toBe(false);
    expect(
      youbikeShouldPaintDot("youbike:taipei:b", { selectedYoubikeId: null })
    ).toBe(true);
    expect(
      youbikeShouldPaintDot("youbike:taipei:start", {
        selectedYoubikeId: selected,
        endpointIds: endpoints,
      })
    ).toBe(true);
  });
});
