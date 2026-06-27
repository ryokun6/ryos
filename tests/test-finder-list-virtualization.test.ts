import { describe, expect, test } from "bun:test";
import { getVirtualListRange } from "../src/apps/finder/components/file-list/FileListListView";

describe("Finder list virtualization", () => {
  test("renders an overscanned window near the top", () => {
    const range = getVirtualListRange({
      itemCount: 1_000,
      scrollTop: 24,
      viewportHeight: 320,
      rowHeight: 32,
      headerHeight: 24,
      overscan: 4,
    });

    expect(range).toEqual({
      start: 0,
      end: 14,
      topPadding: 0,
      bottomPadding: 31_552,
    });
  });

  test("renders middle windows with matching spacer heights", () => {
    const range = getVirtualListRange({
      itemCount: 1_000,
      scrollTop: 1_624,
      viewportHeight: 320,
      rowHeight: 32,
      headerHeight: 24,
      overscan: 4,
    });

    expect(range.start).toBe(46);
    expect(range.end).toBe(64);
    expect(range.topPadding).toBe(1_472);
    expect(range.bottomPadding).toBe(29_952);
  });

  test("clamps the rendered window near the end", () => {
    const range = getVirtualListRange({
      itemCount: 100,
      scrollTop: 3_024,
      viewportHeight: 320,
      rowHeight: 32,
      headerHeight: 24,
      overscan: 4,
    });

    expect(range.end).toBe(100);
    expect(range.bottomPadding).toBe(0);
  });
});
