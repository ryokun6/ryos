import { describe, expect, test } from "bun:test";
import { resolveStuffSoldNameplatePrices } from "../../../src/apps/stuff/utils/stuffSoldNameplate";
import {
  mixOpaqueHex,
  stuffStatusRibbonStyle,
  stuffStatusStruckColor,
} from "../../../src/apps/stuff/utils/stuffStatusRibbon";

describe("stuffStatusStruckColor", () => {
  test("returns an opaque rgb mix dimmer than the sold label color", () => {
    const { color } = stuffStatusRibbonStyle("sold");
    const struck = stuffStatusStruckColor("sold");
    expect(struck).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(struck).not.toBe(color);
    // Explicit opaque channels toward black — not currentColor / alpha mix.
    expect(struck).toBe(mixOpaqueHex(color, "#000000", 0.42));
    // Struck should be substantially darker than near-white label (#eff6ff).
    const channels = struck.match(/\d+/g)!.map(Number);
    const label = [0xef, 0xf6, 0xff];
    const struckLuma =
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    const labelLuma =
      0.2126 * label[0]! + 0.7152 * label[1]! + 0.0722 * label[2]!;
    expect(struckLuma).toBeLessThan(labelLuma * 0.5);
  });

  test("mixOpaqueHex never emits alpha", () => {
    expect(mixOpaqueHex("#ffffff", "#000000", 0.45)).toBe("rgb(115, 115, 115)");
    expect(mixOpaqueHex("#eff6ff", "#000000", 0.42)).toBe(
      stuffStatusStruckColor("sold")
    );
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
});
