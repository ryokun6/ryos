#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import { buildStuffLookupQuery } from "../../../src/apps/stuff/utils/buildStuffLookupQuery";

describe("buildStuffLookupQuery", () => {
  test("prefers barcode when present", () => {
    expect(
      buildStuffLookupQuery({
        barcode: "9780140329473",
        title: "Book",
        brand: "Publisher",
      })
    ).toBe("9780140329473");
  });

  test("combines title and brand for title search", () => {
    expect(
      buildStuffLookupQuery({
        title: "iMac G4",
        brand: "Apple",
      })
    ).toBe("iMac G4 Apple");
  });

  test("does not duplicate brand already in title", () => {
    expect(
      buildStuffLookupQuery({
        title: "Apple iMac G4",
        brand: "Apple",
      })
    ).toBe("Apple iMac G4");
  });

  test("falls back to title then brand", () => {
    expect(buildStuffLookupQuery({ title: "Vintage Lamp" })).toBe("Vintage Lamp");
    expect(buildStuffLookupQuery({ brand: "KitchenAid" })).toBe("KitchenAid");
  });

  test("returns null when empty", () => {
    expect(buildStuffLookupQuery({})).toBeNull();
  });
});
