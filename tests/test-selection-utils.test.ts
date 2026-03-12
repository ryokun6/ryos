#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  createSelectionRect,
  getIntersectingSelectionIds,
  hasToggleModifier,
  mergeSelectionIds,
  rectanglesIntersect,
  resolveMultiSelection,
} from "../src/utils/selection";

describe("selection utilities", () => {
  const orderedIds = ["a", "b", "c", "d"] as const;

  test("replaces the selection on a plain click", () => {
    const result = resolveMultiSelection({
      orderedIds: [...orderedIds],
      currentSelectedIds: ["a", "b"],
      clickedId: "c",
      anchorId: "a",
      modifiers: { shiftKey: false, toggleKey: false },
    });

    expect(result).toEqual({
      selectedIds: ["c"],
      anchorId: "c",
      primaryId: "c",
    });
  });

  test("toggles individual items with ctrl/cmd selection", () => {
    const selected = resolveMultiSelection({
      orderedIds: [...orderedIds],
      currentSelectedIds: ["a"],
      clickedId: "c",
      anchorId: "a",
      modifiers: { shiftKey: false, toggleKey: true },
    });

    expect(selected.selectedIds).toEqual(["a", "c"]);
    expect(selected.anchorId).toBe("c");
    expect(selected.primaryId).toBe("c");

    const deselected = resolveMultiSelection({
      orderedIds: [...orderedIds],
      currentSelectedIds: selected.selectedIds,
      clickedId: "c",
      anchorId: selected.anchorId,
      modifiers: { shiftKey: false, toggleKey: true },
    });

    expect(deselected.selectedIds).toEqual(["a"]);
    expect(deselected.primaryId).toBe("a");
  });

  test("selects a range from the anchor with shift", () => {
    const result = resolveMultiSelection({
      orderedIds: [...orderedIds],
      currentSelectedIds: ["b"],
      clickedId: "d",
      anchorId: "b",
      modifiers: { shiftKey: true, toggleKey: false },
    });

    expect(result).toEqual({
      selectedIds: ["b", "c", "d"],
      anchorId: "b",
      primaryId: "d",
    });
  });

  test("extends the selection when shift is combined with toggle", () => {
    const result = resolveMultiSelection({
      orderedIds: [...orderedIds],
      currentSelectedIds: ["a"],
      clickedId: "d",
      anchorId: "b",
      modifiers: { shiftKey: true, toggleKey: true },
    });

    expect(result.selectedIds).toEqual(["a", "b", "c", "d"]);
    expect(result.anchorId).toBe("b");
    expect(result.primaryId).toBe("d");
  });

  test("merges marquee selection without changing item order", () => {
    expect(
      mergeSelectionIds([...orderedIds], ["d", "b"], ["c", "a"])
    ).toEqual(["a", "b", "c", "d"]);
  });

  test("normalizes selection rectangles and hit-tests intersections", () => {
    const selectionRect = createSelectionRect(
      { x: 40, y: 30 },
      { x: 10, y: 5 }
    );

    expect(selectionRect).toEqual({
      left: 10,
      top: 5,
      right: 40,
      bottom: 30,
    });

    expect(
      rectanglesIntersect(selectionRect, {
        left: 35,
        top: 0,
        right: 50,
        bottom: 10,
      })
    ).toBe(true);

    expect(
      rectanglesIntersect(selectionRect, {
        left: 100,
        top: 100,
        right: 110,
        bottom: 110,
      })
    ).toBe(false);

    expect(
      getIntersectingSelectionIds(selectionRect, [
        {
          id: "a",
          rect: { left: 0, top: 0, right: 9, bottom: 9 },
        },
        {
          id: "b",
          rect: { left: 12, top: 8, right: 20, bottom: 18 },
        },
        {
          id: "c",
          rect: { left: 38, top: 25, right: 50, bottom: 40 },
        },
      ])
    ).toEqual(["b", "c"]);
  });

  test("detects ctrl/cmd toggle modifiers", () => {
    expect(hasToggleModifier({ ctrlKey: true })).toBe(true);
    expect(hasToggleModifier({ metaKey: true })).toBe(true);
    expect(hasToggleModifier({ ctrlKey: false, metaKey: false })).toBe(false);
  });
});
