import { describe, expect, test } from "bun:test";
import {
  isPageTurnGestureStartAllowed,
  measurePageTurnGesture,
  shouldCommitPageTurn,
} from "../src/apps/books/utils/pageTurnGesture";

const availability = {
  canGoPreviousPage: true,
  canGoNextPage: true,
};

function gesture({
  deltaX,
  deltaY,
  elapsedMs = 300,
  startX = 400,
  startY = 300,
  viewportWidth = 800,
  viewportHeight = 600,
}: {
  deltaX: number;
  deltaY: number;
  elapsedMs?: number;
  startX?: number;
  startY?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}) {
  return measurePageTurnGesture({
    start: { x: startX, y: startY, time: 0 },
    current: {
      x: startX + deltaX,
      y: startY + deltaY,
      time: elapsedMs,
    },
    viewportWidth,
    viewportHeight,
  });
}

describe("Books page-turn gesture", () => {
  test("commits deliberate horizontal and diagonal turns", () => {
    const horizontal = gesture({ deltaX: -70, deltaY: 4 });
    const diagonal = gesture({ deltaX: -55, deltaY: 90 });

    expect(horizontal.direction).toBe("next");
    expect(horizontal.isIntentional).toBe(true);
    expect(shouldCommitPageTurn(horizontal, availability)).toBe(true);

    expect(diagonal.direction).toBe("next");
    expect(diagonal.angleFromHorizontalDeg).toBeGreaterThan(45);
    expect(diagonal.isIntentional).toBe(true);
    expect(shouldCommitPageTurn(diagonal, availability)).toBe(true);
  });

  test("rejects near-vertical drags and short holds", () => {
    const vertical = gesture({ deltaX: 12, deltaY: 120 });
    const short = gesture({ deltaX: -12, deltaY: 3, elapsedMs: 500 });

    expect(vertical.isIntentional).toBe(false);
    expect(shouldCommitPageTurn(vertical, availability)).toBe(false);
    expect(short.isIntentional).toBe(true);
    expect(shouldCommitPageTurn(short, availability)).toBe(false);
  });

  test("commits a short fast flick", () => {
    const flick = gesture({ deltaX: 24, deltaY: -8, elapsedMs: 35 });

    expect(flick.direction).toBe("prev");
    expect(flick.horizontalVelocity).toBeGreaterThan(0.45);
    expect(shouldCommitPageTurn(flick, availability)).toBe(true);
  });

  test("respects the available navigation direction", () => {
    const next = gesture({ deltaX: -80, deltaY: 20 });
    const previous = gesture({ deltaX: 80, deltaY: -20 });

    expect(
      shouldCommitPageTurn(next, {
        canGoPreviousPage: true,
        canGoNextPage: false,
      }),
    ).toBe(false);
    expect(
      shouldCommitPageTurn(previous, {
        canGoPreviousPage: false,
        canGoNextPage: true,
      }),
    ).toBe(false);
  });

  test("tracks the held edge and drag angle for the curl", () => {
    const metrics = gesture({
      deltaX: -80,
      deltaY: 150,
      startY: 120,
    });

    expect(metrics.originY).toBeCloseTo(0.2);
    expect(metrics.tiltDeg).toBeCloseTo(6);
    expect(metrics.progress).toBeGreaterThan(0.3);
  });

  test("allows touch anywhere but limits mouse drags to page edges", () => {
    expect(
      isPageTurnGestureStartAllowed({
        pointerType: "touch",
        startX: 400,
        viewportWidth: 800,
      }),
    ).toBe(true);
    expect(
      isPageTurnGestureStartAllowed({
        pointerType: "mouse",
        startX: 400,
        viewportWidth: 800,
      }),
    ).toBe(false);
    expect(
      isPageTurnGestureStartAllowed({
        pointerType: "mouse",
        startX: 100,
        viewportWidth: 800,
      }),
    ).toBe(true);
  });
});
