import { describe, expect, test } from "bun:test";
import {
  BOOKS_SWIPE_AXIS_DOMINANCE,
  BOOKS_SWIPE_MIN_DISTANCE,
  resolveBooksSwipeDirection,
} from "../../../src/apps/books/utils/booksSwipe";

const base = {
  deltaY: 0,
  isVerticalText: false,
  hasSelection: false,
};

describe("Books swipe navigation", () => {
  test("turns horizontal pages on mostly-horizontal swipes", () => {
    expect(resolveBooksSwipeDirection({ ...base, deltaX: -120 })).toBe("next");
    expect(resolveBooksSwipeDirection({ ...base, deltaX: 120 })).toBe("prev");
    expect(BOOKS_SWIPE_MIN_DISTANCE).toBe(48);
  });

  test("ignores short drags below the distance threshold", () => {
    expect(
      resolveBooksSwipeDirection({
        ...base,
        deltaX: -(BOOKS_SWIPE_MIN_DISTANCE - 1),
      })
    ).toBeNull();
    expect(
      resolveBooksSwipeDirection({ ...base, deltaX: BOOKS_SWIPE_MIN_DISTANCE })
    ).toBe("prev");
  });

  test("ignores vertical-dominant gestures (scroll-like drags)", () => {
    expect(
      resolveBooksSwipeDirection({ ...base, deltaX: -80, deltaY: 90 })
    ).toBeNull();
    expect(
      resolveBooksSwipeDirection({ ...base, deltaX: -80, deltaY: 30 })
    ).toBe("next");
    expect(BOOKS_SWIPE_AXIS_DOMINANCE).toBe(1.2);
  });

  test("reverses physical direction for vertical text", () => {
    expect(
      resolveBooksSwipeDirection({ ...base, deltaX: -120, isVerticalText: true })
    ).toBe("prev");
    expect(
      resolveBooksSwipeDirection({ ...base, deltaX: 120, isVerticalText: true })
    ).toBe("next");
  });

  test("never turns while text is selected", () => {
    expect(
      resolveBooksSwipeDirection({ ...base, deltaX: -120, hasSelection: true })
    ).toBeNull();
    expect(
      resolveBooksSwipeDirection({ ...base, deltaX: 120, hasSelection: true })
    ).toBeNull();
  });

  test("wires touch swipes inside EPUB documents", async () => {
    const source = await Bun.file(
      "src/apps/books/components/BooksReaderPane.tsx"
    ).text();

    expect(source).toContain("resolveBooksSwipeDirection({");
    expect(source).toContain(
      'document.addEventListener("touchstart", handleTouchStart'
    );
    expect(source).toContain(
      'document.addEventListener("touchend", handleTouchEnd'
    );
    // Selection state is re-read at touchend so long-press selection drags
    // never turn the page.
    expect(source).toContain("hasSelection: readSelectionState()");
  });
});
