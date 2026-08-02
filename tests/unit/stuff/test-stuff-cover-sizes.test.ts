import { describe, expect, test } from "bun:test";
import { getStuffCoverDimensions } from "../../../src/apps/stuff/utils/stuffCoverSizes";

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

  test("non-book items use square grid and list sizes", () => {
    expect(getStuffCoverDimensions("electronics", "grid")).toEqual({
      width: 110,
      height: 110,
    });
    expect(getStuffCoverDimensions("furniture", "grid")).toEqual({
      width: 110,
      height: 110,
    });
    expect(getStuffCoverDimensions("other", "list")).toEqual({
      width: 40,
      height: 40,
    });
  });
});
