import { describe, expect, test } from "bun:test";
import { getPlaceHomeWorkMenuItems } from "../../../src/apps/maps/utils/homeWorkMenu";

describe("getPlaceHomeWorkMenuItems", () => {
  test("shows Set as Home and Set as Work when this place occupies neither slot", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: false, isWork: false })).toEqual([
      "setHome",
      "setWork",
    ]);
  });

  test("swaps Set as Home for Unset Home when this place is Home", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: true, isWork: false })).toEqual([
      "unsetHome",
      "setWork",
    ]);
  });

  test("swaps Set as Work for Unset Work when this place is Work", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: false, isWork: true })).toEqual([
      "setHome",
      "unsetWork",
    ]);
  });

  test("shows both Unset actions when the same place is Home and Work", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: true, isWork: true })).toEqual([
      "unsetHome",
      "unsetWork",
    ]);
  });

  test("never shows Set and Unset for the same slot", () => {
    const cases = [
      { isHome: false, isWork: false },
      { isHome: true, isWork: false },
      { isHome: false, isWork: true },
      { isHome: true, isWork: true },
    ];
    for (const options of cases) {
      const items = getPlaceHomeWorkMenuItems(options);
      expect(items.includes("setHome") && items.includes("unsetHome")).toBe(
        false
      );
      expect(items.includes("setWork") && items.includes("unsetWork")).toBe(
        false
      );
    }
  });
});
