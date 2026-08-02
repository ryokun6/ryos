import { describe, expect, test } from "bun:test";
import {
  getStuffCoverDimensions,
  STUFF_CD_DETAIL,
  STUFF_CD_GRID,
  STUFF_CD_JEWEL_CASE_RATIO,
  STUFF_CD_LIST,
} from "../../../src/apps/stuff/utils/stuffCoverSizes";

/** Assert pixel dims match 142/125 within rounding of width = round(height × ratio). */
function expectJewelCaseRatio(dims: { width: number; height: number }) {
  const expectedWidth = Math.round(dims.height * STUFF_CD_JEWEL_CASE_RATIO);
  expect(dims.width).toBe(expectedWidth);
  expect(Math.abs(dims.width / dims.height - STUFF_CD_JEWEL_CASE_RATIO)).toBeLessThan(
    0.5 / dims.height
  );
}

describe("getStuffCoverDimensions", () => {
  test("books use portrait grid and list sizes", () => {
    expect(getStuffCoverDimensions("book", "grid")).toEqual({
      width: 104,
      height: 160,
    });
    expect(getStuffCoverDimensions("book", "list")).toEqual({
      width: 36,
      height: 52,
    });
  });

  test("cds use landscape jewel case sizes at 142:125", () => {
    expect(getStuffCoverDimensions("cd", "grid")).toEqual({
      width: 123,
      height: 108,
    });
    expect(getStuffCoverDimensions("cd", "list")).toEqual({
      width: 42,
      height: 37,
    });
    expect(getStuffCoverDimensions("cd", "detail")).toEqual({
      width: 123,
      height: 108,
    });

    expect(STUFF_CD_DETAIL).toEqual(STUFF_CD_GRID);
    expectJewelCaseRatio(STUFF_CD_GRID);
    expectJewelCaseRatio(STUFF_CD_LIST);
    expectJewelCaseRatio(STUFF_CD_DETAIL);
  });

  test("non-book items use square grid and list sizes", () => {
    expect(getStuffCoverDimensions("electronics", "grid")).toEqual({
      width: 110,
      height: 110,
    });
    expect(getStuffCoverDimensions("furniture", "grid")).toEqual({
      width: 110,
      height: 110,
    });
    expect(getStuffCoverDimensions("media", "grid")).toEqual({
      width: 110,
      height: 110,
    });
    expect(getStuffCoverDimensions("other", "list")).toEqual({
      width: 40,
      height: 40,
    });
  });
});
