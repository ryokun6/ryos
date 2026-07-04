import { describe, expect, test } from "bun:test";
import {
  ASSISTANT_BUBBLE_ESTIMATED_HEIGHT,
  ASSISTANT_BUBBLE_WIDTH,
  resolveAssistantBubblePlacement,
  type AssistantBubbleRect,
} from "../src/components/assistant/assistantBubblePlacement";

const bubbleSize = {
  width: ASSISTANT_BUBBLE_WIDTH,
  height: ASSISTANT_BUBBLE_ESTIMATED_HEIGHT,
};

const desktopViewport = {
  width: 1440,
  height: 900,
  topInset: 24,
  bottomInset: 80,
};

const character = { width: 80, height: 80 };

function place(
  anchor: { x: number; y: number },
  obstacles: AssistantBubbleRect[] = [],
  viewport = desktopViewport
) {
  return resolveAssistantBubblePlacement({
    anchor: { ...anchor, ...character },
    bubbleSize,
    viewport,
    obstacles,
  });
}

describe("assistant bubble placement", () => {
  test("defaults to above, extending toward screen center", () => {
    const left = place({ x: 100, y: 600 });
    expect(left.side).toBe("above");
    expect(left.align).toBe("start");
    expect(left.penalty).toBe(0);
    expect(left.crossOffset).toBe(0);

    const right = place({ x: 1300, y: 600 });
    expect(right.side).toBe("above");
    expect(right.align).toBe("end");
    expect(right.penalty).toBe(0);
    expect(right.crossOffset).toBe(0);
  });

  test("flips below when the character is near the top of the screen", () => {
    const placement = place({ x: 700, y: 60 });
    expect(placement.side).toBe("below");
    expect(placement.penalty).toBe(0);
  });

  test("does not cover a window the character is docked under", () => {
    // Mobile-like layout: window fills the top, character snapped below the
    // window's bottom-right corner. The bubble must pop down and extend left.
    const viewport = { width: 390, height: 844, topInset: 26, bottomInset: 40 };
    const window: AssistantBubbleRect = { x: 0, y: 26, width: 390, height: 500 };
    const placement = place({ x: 302, y: 534 }, [window], viewport);

    expect(placement.side).toBe("below");
    expect(placement.align).toBe("end");
    expect(placement.penalty).toBe(0);
    // Entirely below the window and inside the viewport.
    expect(placement.bounds.y).toBeGreaterThanOrEqual(534 + 80);
    expect(placement.bounds.y + placement.bounds.height).toBeLessThanOrEqual(
      844
    );
  });

  test("extends away from a window when docked at its bottom-right corner", () => {
    // Character sits just right of the window, aligned with its bottom edge.
    const window: AssistantBubbleRect = { x: 100, y: 80, width: 600, height: 500 };
    const placement = place({ x: 708, y: 500 }, [window]);

    expect(placement.side).toBe("above");
    // Extending left ("end") would cover the window; extend right instead.
    expect(placement.align).toBe("start");
    expect(placement.penalty).toBe(0);
  });

  test("pops sideways when above and below are both blocked", () => {
    // Short viewport: no room for the bubble above or below the character,
    // but a side pop extending downward fits fully.
    const viewport = { width: 1440, height: 400, topInset: 24, bottomInset: 40 };
    const placement = place({ x: 8, y: 140 }, [], viewport);

    expect(placement.side).toBe("right");
    expect(placement.align).toBe("start");
    expect(placement.penalty).toBe(0);
    expect(placement.bounds.y).toBe(140);
  });

  test("side pop anchors toward the top or bottom of the character", () => {
    // Character low in a short viewport: the side bubble should hang upward,
    // bottom-aligned with the character.
    const viewport = { width: 1440, height: 400, topInset: 24, bottomInset: 40 };
    const placement = place({ x: 8, y: 180 }, [], viewport);

    expect(placement.side).toBe("right");
    expect(placement.align).toBe("end");
    expect(placement.penalty).toBe(0);
    expect(placement.bounds.y + placement.bounds.height).toBe(180 + 80);
  });

  test("keeps the classic default when nothing can be fully clear", () => {
    // Maximized window: every placement overlaps it equally, so the classic
    // above-toward-center default wins the tie.
    const window: AssistantBubbleRect = {
      x: 0,
      y: 24,
      width: 1440,
      height: 796,
    };
    const placement = place({ x: 600, y: 500 }, [window]);
    expect(placement.side).toBe("above");
    expect(placement.align).toBe("start");
  });

  test("slides along the cross axis instead of clipping on a narrow viewport", () => {
    // Character horizontally centered on a phone: neither left- nor
    // right-aligned above placement fits, so the bubble slides sideways to
    // stay fully on screen instead of hanging off the edge.
    const viewport = { width: 393, height: 852, topInset: 26, bottomInset: 90 };
    const placement = place({ x: 156, y: 640 }, [], viewport);

    expect(placement.side).toBe("above");
    expect(placement.penalty).toBe(0);
    expect(placement.crossOffset).toBe(-27);
    expect(placement.bounds.x).toBe(129);
    expect(placement.bounds.x + placement.bounds.width).toBeLessThanOrEqual(
      393 - 8
    );
  });

  test("pops to the top instead of clipping beside a full-width window", () => {
    // Regression: character docked at the bottom of a phone viewport with a
    // window filling the screen above it. Side pops hang off the viewport and
    // must never win just because they cover less of the window — the bubble
    // pops above (sliding on-screen), accepting the window overlap.
    const viewport = { width: 393, height: 852, topInset: 26, bottomInset: 90 };
    const window: AssistantBubbleRect = { x: 0, y: 26, width: 393, height: 560 };
    const placement = place({ x: 150, y: 640 }, [window], viewport);

    expect(placement.side).toBe("above");
    const { bounds } = placement;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(393);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(852);
    // Slid left so the right-extending bubble stays on screen.
    expect(placement.crossOffset).toBe(-21);
  });

  test("stays on screen and minimizes window coverage when boxed in", () => {
    // Character at the bottom-right of the screen with a window filling the
    // desktop above: the bubble stays fully on screen and picks the placement
    // covering the least of the window (tucked left, hanging below it).
    const window: AssistantBubbleRect = {
      x: 0,
      y: 24,
      width: 1440,
      height: 700,
    };
    const placement = place({ x: 1352, y: 740 }, [window]);
    expect(placement.side).toBe("left");
    expect(placement.align).toBe("end");
    const { bounds } = placement;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    // Covering part of the window beats popping offscreen, and the side pop
    // covers less of the window than popping above would.
    expect(placement.penalty).toBeLessThan(
      ASSISTANT_BUBBLE_WIDTH * ASSISTANT_BUBBLE_ESTIMATED_HEIGHT
    );
  });
});
