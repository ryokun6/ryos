import { describe, expect, test } from "bun:test";
import { formatClusterMarkerTitle } from "../src/apps/maps/utils/mapMarkerClustering";

describe("formatClusterMarkerTitle", () => {
  test("joins all names when within limit", () => {
    expect(
      formatClusterMarkerTitle([
        { title: "Home" },
        { title: "Garden" },
      ])
    ).toBe("Home, Garden");
  });

  test("truncates with +N suffix", () => {
    expect(
      formatClusterMarkerTitle(
        [
          { title: "Home" },
          { title: "Garden" },
          { title: "XXX" },
          { title: "YYY" },
          { title: "Alpha" },
          { title: "Beta" },
          { title: "Gamma" },
        ],
        { maxNames: 4 }
      )
    ).toBe("Home, Garden, XXX, YYY, +3");
  });

  test("dedupes identical titles", () => {
    expect(
      formatClusterMarkerTitle([{ title: "Home" }, { title: "Home" }])
    ).toBe("Home");
  });
});
