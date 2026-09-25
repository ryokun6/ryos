import { describe, expect, test } from "bun:test";
import { getPlaceHomeWorkMenuItems } from "../../../src/apps/maps/utils/homeWorkMenu";

describe("getPlaceHomeWorkMenuItems", () => {
  test("always includes Set as Home and Set as Work", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: false, isWork: false })).toEqual([
      "setHome",
      "setWork",
    ]);
    expect(getPlaceHomeWorkMenuItems({ isHome: true, isWork: false })).toContain(
      "setHome"
    );
    expect(getPlaceHomeWorkMenuItems({ isHome: true, isWork: false })).toContain(
      "setWork"
    );
    expect(getPlaceHomeWorkMenuItems({ isHome: false, isWork: true })).toContain(
      "setHome"
    );
    expect(getPlaceHomeWorkMenuItems({ isHome: false, isWork: true })).toContain(
      "setWork"
    );
  });

  test("shows Unset Home only when this place is Home", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: true, isWork: false })).toEqual([
      "setHome",
      "setWork",
      "unsetHome",
    ]);
    expect(
      getPlaceHomeWorkMenuItems({ isHome: false, isWork: false })
    ).not.toContain("unsetHome");
  });

  test("shows Unset Work only when this place is Work", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: false, isWork: true })).toEqual([
      "setHome",
      "setWork",
      "unsetWork",
    ]);
    expect(
      getPlaceHomeWorkMenuItems({ isHome: false, isWork: false })
    ).not.toContain("unsetWork");
  });

  test("shows both Unset actions when the same place is Home and Work", () => {
    expect(getPlaceHomeWorkMenuItems({ isHome: true, isWork: true })).toEqual([
      "setHome",
      "setWork",
      "unsetHome",
      "unsetWork",
    ]);
  });
});
