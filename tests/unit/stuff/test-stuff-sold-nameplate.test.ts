import { describe, expect, test } from "bun:test";
import {
  formatStuffNameplatePrice,
  resolveStuffSoldNameplatePrices,
} from "../../../src/apps/stuff/utils/stuffSoldNameplate";
import {
  mixOpaqueHex,
  stuffStatusRibbonStyle,
  stuffStatusStruckColor,
} from "../../../src/apps/stuff/utils/stuffStatusRibbon";

describe("stuffStatusStruckColor", () => {
  test("returns an opaque rgb wash lighter than mixing toward black", () => {
    const { background, color } = stuffStatusRibbonStyle("sold");
    const struck = stuffStatusStruckColor("sold");
    expect(struck).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(struck).not.toBe(color);
    // Mix toward plate — not black (black wash was invisible on sold blue).
    expect(struck).toBe(mixOpaqueHex(color, background, 0.62));
    expect(struck).not.toBe(mixOpaqueHex(color, "#000000", 0.42));

    const channels = struck.match(/\d+/g)!.map(Number);
    const plate = [0x1d, 0x4e, 0xd8];
    const struckLuma =
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    const plateLuma =
      0.2126 * plate[0]! + 0.7152 * plate[1]! + 0.0722 * plate[2]!;
    // Struck must be clearly brighter than the plate so glyphs read on blue.
    expect(struckLuma).toBeGreaterThan(plateLuma * 1.5);
  });

  test("mixOpaqueHex never emits alpha", () => {
    expect(mixOpaqueHex("#ffffff", "#000000", 0.45)).toBe("rgb(115, 115, 115)");
  });
});

describe("formatStuffNameplatePrice", () => {
  test("formats normal amounts", () => {
    expect(formatStuffNameplatePrice(90, "USD", "Free")).toBe("$90.00");
  });

  test("shows Free for zero", () => {
    expect(formatStuffNameplatePrice(0, "USD", "Free")).toBe("Free");
    expect(formatStuffNameplatePrice(0, "JPY", "無料")).toBe("無料");
  });

  test("returns null for missing amounts", () => {
    expect(formatStuffNameplatePrice(undefined, "USD", "Free")).toBeNull();
    expect(formatStuffNameplatePrice(Number.NaN, "USD", "Free")).toBeNull();
  });

  test("coerces numeric strings from sync", () => {
    expect(formatStuffNameplatePrice("42", "USD", "Free")).toBe("$42.00");
    expect(formatStuffNameplatePrice("0", "USD", "Free")).toBe("Free");
  });
});

describe("resolveStuffSoldNameplatePrices", () => {
  test("prefers sold over asking and original", () => {
    expect(
      resolveStuffSoldNameplatePrices({
        original: 120,
        discounted: 100,
        sold: 90,
        currency: "USD",
      })
    ).toEqual({
      saleFormatted: "$90.00",
      originalStruckFormatted: "$120.00",
    });
  });

  test("falls back to asking when sold is missing", () => {
    expect(
      resolveStuffSoldNameplatePrices({
        original: 120,
        discounted: 100,
        currency: "USD",
      })
    ).toEqual({
      saleFormatted: "$100.00",
      originalStruckFormatted: "$120.00",
    });
  });

  test("falls back to struck original when sold and asking are missing", () => {
    expect(
      resolveStuffSoldNameplatePrices({
        original: 120,
        currency: "USD",
      })
    ).toEqual({
      saleFormatted: null,
      originalStruckFormatted: "$120.00",
    });
  });

  test("shows sale alone when there is no original", () => {
    expect(
      resolveStuffSoldNameplatePrices({
        sold: 90,
        currency: "USD",
      })
    ).toEqual({
      saleFormatted: "$90.00",
      originalStruckFormatted: null,
    });
  });

  test("does not strike original when it equals the sold amount", () => {
    expect(
      resolveStuffSoldNameplatePrices({
        original: 90,
        sold: 90,
        currency: "USD",
      })
    ).toEqual({
      saleFormatted: "$90.00",
      originalStruckFormatted: null,
    });
  });

  test("returns nulls when no prices are set", () => {
    expect(
      resolveStuffSoldNameplatePrices({
        currency: "USD",
      })
    ).toEqual({
      saleFormatted: null,
      originalStruckFormatted: null,
    });
  });

  test("shows Free for zero sale and/or original", () => {
    expect(
      resolveStuffSoldNameplatePrices(
        {
          original: 50,
          sold: 0,
          currency: "USD",
        },
        "Free"
      )
    ).toEqual({
      saleFormatted: "Free",
      originalStruckFormatted: "$50.00",
    });

    expect(
      resolveStuffSoldNameplatePrices(
        {
          original: 0,
          currency: "USD",
        },
        "Free"
      )
    ).toEqual({
      saleFormatted: null,
      originalStruckFormatted: "Free",
    });
  });
});
