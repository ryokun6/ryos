import { describe, expect, test } from "bun:test";
import type { TFunction } from "i18next";
import {
  stuffDefaultLocationSlug,
  stuffLocationDisplayName,
} from "../../../src/apps/stuff/utils/stuffLocationDisplayName";
import type { StuffLocation } from "../../../src/apps/stuff/types";

const t = ((key: string, opts?: { defaultValue?: string }) => {
  if (key === "apps.stuff.defaultLocations.closet") return "Armario";
  if (key === "apps.stuff.defaultLocations.carry-on") return "Equipaje de mano";
  return opts?.defaultValue ?? key;
}) as TFunction;

function location(
  partial: Partial<StuffLocation> & Pick<StuffLocation, "id" | "name">
): StuffLocation {
  return {
    createdAt: 1,
    ...partial,
  };
}

describe("stuffLocationDisplayName", () => {
  test("localizes stable default ids", () => {
    expect(
      stuffLocationDisplayName(
        location({ id: "stuff-location-default:closet", name: "Closet" }),
        t
      )
    ).toBe("Armario");
  });

  test("localizes by canonical (slugified) English name for legacy ids", () => {
    expect(
      stuffDefaultLocationSlug(location({ id: "uuid", name: "Closet" }))
    ).toBe("closet");
  });

  test("keeps custom location names", () => {
    expect(
      stuffLocationDisplayName(location({ id: "custom", name: "Garage" }), t)
    ).toBe("Garage");
  });

  test("recognizes multi-word default slug (Carry On)", () => {
    expect(
      stuffDefaultLocationSlug(
        location({ id: "stuff-location-default:carry-on", name: "Carry On" })
      )
    ).toBe("carry-on");
    expect(
      stuffLocationDisplayName(
        location({ id: "stuff-location-default:carry-on", name: "Carry On" }),
        t
      )
    ).toBe("Equipaje de mano");
  });

  test("falls back to slugified name when id is a legacy UUID", () => {
    expect(
      stuffDefaultLocationSlug(location({ id: "legacy-uuid", name: "Carry On" }))
    ).toBe("carry-on");
  });

  test("returns null slug for custom (non-default) locations", () => {
    expect(
      stuffDefaultLocationSlug(location({ id: "custom", name: "Garage" }))
    ).toBeNull();
  });
});
