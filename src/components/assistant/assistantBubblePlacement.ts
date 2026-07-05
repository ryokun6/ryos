/**
 * Window-aware placement for the assistant's speech bubble.
 *
 * The bubble can pop on any of the four sides of the character (above, below,
 * left, right) with two alignments per side. Each candidate is first slid
 * along its side's cross axis so it stays inside the viewport, then scored:
 * staying fully on screen is a hard constraint (a clipped bubble never beats
 * an on-screen one), and among on-screen candidates the one covering the
 * least amount of open windows wins, so a character docked next to a window
 * pops its bubble away from the window instead of over it.
 */

export interface AssistantBubbleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AssistantBubbleViewport {
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
}

export type AssistantBubbleSide = "above" | "below" | "left" | "right";

/**
 * Alignment along the side's cross axis. For above/below: "start" aligns the
 * bubble's left edge with the character (extends right), "end" aligns the
 * right edge (extends left). For left/right: "start" aligns the top edge
 * (extends down), "end" aligns the bottom edge (extends up).
 */
export type AssistantBubbleAlign = "start" | "end";

export interface AssistantBubblePlacement {
  side: AssistantBubbleSide;
  align: AssistantBubbleAlign;
  bounds: AssistantBubbleRect;
  /**
   * Cross-axis shift (px) applied to the natural edge-aligned position to
   * keep the bubble inside the viewport: horizontal for above/below,
   * vertical for left/right. 0 when the bubble fits without sliding.
   */
  crossOffset: number;
  /** Weighted viewport-overflow + window-overlap area. 0 = fully clear. */
  penalty: number;
}

export const ASSISTANT_BUBBLE_WIDTH = 256;
export const ASSISTANT_BUBBLE_ESTIMATED_HEIGHT = 208;
export const ASSISTANT_BUBBLE_GAP = 8;

/** Covering a window is bad; pushing the bubble offscreen is worse. */
const OVERFLOW_WEIGHT = 4;

/** Preferred clearance (px) between the bubble and the viewport edges. */
const BUBBLE_VIEWPORT_MARGIN = 8;

interface ResolveAssistantBubblePlacementOptions {
  /** Character rect (viewport coordinates). */
  anchor: AssistantBubbleRect;
  bubbleSize: { width: number; height: number };
  viewport: AssistantBubbleViewport;
  /** Rects the bubble should avoid covering (open windows). */
  obstacles: AssistantBubbleRect[];
}

function getRight(rect: AssistantBubbleRect): number {
  return rect.x + rect.width;
}

function getBottom(rect: AssistantBubbleRect): number {
  return rect.y + rect.height;
}

function getIntersectionArea(
  a: AssistantBubbleRect,
  b: AssistantBubbleRect
): number {
  const width = Math.max(
    0,
    Math.min(getRight(a), getRight(b)) - Math.max(a.x, b.x)
  );
  const height = Math.max(
    0,
    Math.min(getBottom(a), getBottom(b)) - Math.max(a.y, b.y)
  );
  return width * height;
}

function getOverflowArea(
  rect: AssistantBubbleRect,
  viewport: AssistantBubbleViewport
): number {
  const visibleWidth = Math.max(
    0,
    Math.min(getRight(rect), viewport.width) - Math.max(rect.x, 0)
  );
  const visibleHeight = Math.max(
    0,
    Math.min(getBottom(rect), viewport.height) - Math.max(rect.y, 0)
  );
  return rect.width * rect.height - visibleWidth * visibleHeight;
}

interface PlacementCandidate {
  side: AssistantBubbleSide;
  align: AssistantBubbleAlign;
  bounds: AssistantBubbleRect;
  priority: number;
}

function clampAxis(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

interface AssistantVisualViewportLike {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
}

/**
 * Effective viewport for bubble placement: the layout viewport (which the
 * fixed-position overlay is laid out against) intersected with the visual
 * viewport. On iOS the software keyboard shrinks — and, in browser tabs,
 * pans — the visual viewport while `window.innerHeight` stays put, so
 * clamping against the layout viewport alone can slide the bubble into a
 * region the user cannot see (typically pinned to the hidden top).
 */
export function resolveAssistantVisibleViewport({
  layout,
  topInset,
  bottomInset,
  visual,
}: {
  layout: { width: number; height: number };
  topInset: number;
  bottomInset: number;
  visual?: AssistantVisualViewportLike | null;
}): AssistantBubbleViewport {
  if (!visual) {
    return {
      width: layout.width,
      height: layout.height,
      topInset,
      bottomInset,
    };
  }
  const visibleBottom = Math.min(
    layout.height,
    visual.offsetTop + visual.height
  );
  const hiddenBelow = layout.height - visibleBottom;
  return {
    width: Math.min(layout.width, visual.offsetLeft + visual.width),
    height: visibleBottom,
    // A panned-down visual viewport scrolls the menubar out of view; the
    // bubble then only needs to clear the visible top edge.
    topInset: Math.max(topInset, visual.offsetTop),
    // The dock hugs the layout-viewport bottom; whatever part of that band
    // the keyboard already hides no longer needs clearing.
    bottomInset: Math.max(0, bottomInset - hiddenBelow),
  };
}

interface ResolveAssistantBubbleCrossOffsetOptions {
  side: AssistantBubbleSide;
  align: AssistantBubbleAlign;
  /** Character rect (viewport coordinates). */
  anchor: AssistantBubbleRect;
  bubbleSize: { width: number; height: number };
  viewport: AssistantBubbleViewport;
}

/**
 * Cross-axis slide (px) that keeps a bubble of the given size on screen for
 * an already-chosen side/align: horizontal for above/below, vertical for
 * left/right. The placement resolver picks the side using an estimated
 * bubble size, but the rendered bubble is often much shorter, so the overlay
 * recomputes the slide from the measured size — otherwise an estimate-based
 * slide shifts the real bubble away from the character.
 */
export function resolveAssistantBubbleCrossOffset({
  side,
  align,
  anchor,
  bubbleSize,
  viewport,
}: ResolveAssistantBubbleCrossOffsetOptions): number {
  if (side === "above" || side === "below") {
    const naturalX =
      align === "start"
        ? anchor.x
        : anchor.x + anchor.width - bubbleSize.width;
    return (
      clampAxis(
        naturalX,
        BUBBLE_VIEWPORT_MARGIN,
        viewport.width - bubbleSize.width - BUBBLE_VIEWPORT_MARGIN
      ) - naturalX
    );
  }
  const naturalY =
    align === "start"
      ? anchor.y
      : anchor.y + anchor.height - bubbleSize.height;
  const minY = viewport.topInset + BUBBLE_VIEWPORT_MARGIN;
  const maxY =
    viewport.height -
    viewport.bottomInset -
    bubbleSize.height -
    BUBBLE_VIEWPORT_MARGIN;
  // A bubble taller than the available band cannot avoid clipping. Keep its
  // bottom edge (tail region and input row) visible and let the top
  // overflow — pinning the top instead would bury the input below the
  // viewport, e.g. under the iOS keyboard when vertical space is scarce.
  const clampedY = maxY < minY ? maxY : clampAxis(naturalY, minY, maxY);
  return clampedY - naturalY;
}

export function resolveAssistantBubblePlacement({
  anchor,
  bubbleSize,
  viewport,
  obstacles,
}: ResolveAssistantBubblePlacementOptions): AssistantBubblePlacement {
  const anchorRight = getRight(anchor);
  const anchorBottom = getBottom(anchor);
  const anchorCenterX = anchor.x + anchor.width / 2;
  const anchorCenterY = anchor.y + anchor.height / 2;

  // Prefer extending toward the middle of the screen (classic behavior).
  const hAlign: AssistantBubbleAlign =
    anchorCenterX > viewport.width / 2 ? "end" : "start";
  const vAlign: AssistantBubbleAlign =
    anchorCenterY > viewport.height / 2 ? "end" : "start";
  const nearSide: AssistantBubbleSide =
    anchorCenterX > viewport.width / 2 ? "left" : "right";
  const farSide: AssistantBubbleSide = nearSide === "left" ? "right" : "left";

  const flip = (align: AssistantBubbleAlign): AssistantBubbleAlign =>
    align === "start" ? "end" : "start";

  const xFor = (align: AssistantBubbleAlign): number =>
    align === "start" ? anchor.x : anchorRight - bubbleSize.width;
  const yFor = (align: AssistantBubbleAlign): number =>
    align === "start" ? anchor.y : anchorBottom - bubbleSize.height;

  const boundsFor = (
    side: AssistantBubbleSide,
    align: AssistantBubbleAlign
  ): AssistantBubbleRect => {
    switch (side) {
      case "above":
        return {
          x: xFor(align),
          y: anchor.y - ASSISTANT_BUBBLE_GAP - bubbleSize.height,
          width: bubbleSize.width,
          height: bubbleSize.height,
        };
      case "below":
        return {
          x: xFor(align),
          y: anchorBottom + ASSISTANT_BUBBLE_GAP,
          width: bubbleSize.width,
          height: bubbleSize.height,
        };
      case "left":
        return {
          x: anchor.x - ASSISTANT_BUBBLE_GAP - bubbleSize.width,
          y: yFor(align),
          width: bubbleSize.width,
          height: bubbleSize.height,
        };
      case "right":
        return {
          x: anchorRight + ASSISTANT_BUBBLE_GAP,
          y: yFor(align),
          width: bubbleSize.width,
          height: bubbleSize.height,
        };
    }
  };

  // Priority breaks ties between equally clear placements: above first, then
  // below, then beside the character (toward the screen center first).
  const order: Array<[AssistantBubbleSide, AssistantBubbleAlign]> = [
    ["above", hAlign],
    ["above", flip(hAlign)],
    ["below", hAlign],
    ["below", flip(hAlign)],
    [nearSide, vAlign],
    [nearSide, flip(vAlign)],
    [farSide, vAlign],
    [farSide, flip(vAlign)],
  ];

  const candidates: PlacementCandidate[] = order.map(
    ([side, align], priority) => ({
      side,
      align,
      bounds: boundsFor(side, align),
      priority,
    })
  );

  // Slide each candidate along its side's cross axis so it stays inside the
  // viewport. The main axis (the offset away from the character) is never
  // adjusted — that would cover the character — so any remaining overflow
  // there still disqualifies the candidate against fully visible ones.
  const slideOnScreen = (
    candidate: PlacementCandidate
  ): { bounds: AssistantBubbleRect; crossOffset: number } => {
    const { bounds, side, align } = candidate;
    const crossOffset = resolveAssistantBubbleCrossOffset({
      side,
      align,
      anchor,
      bubbleSize,
      viewport,
    });
    if (side === "above" || side === "below") {
      return { bounds: { ...bounds, x: bounds.x + crossOffset }, crossOffset };
    }
    return { bounds: { ...bounds, y: bounds.y + crossOffset }, crossOffset };
  };

  const scored = candidates.map((candidate) => {
    const { bounds, crossOffset } = slideOnScreen(candidate);
    const overflow = getOverflowArea(bounds, viewport);
    const overlap = obstacles.reduce(
      (total, obstacle) => total + getIntersectionArea(bounds, obstacle),
      0
    );
    return {
      side: candidate.side,
      align: candidate.align,
      priority: candidate.priority,
      bounds,
      crossOffset,
      overflow,
      overlap,
    };
  });

  // Never clip: any placement that stays fully on screen beats any placement
  // that overflows, no matter how much of a window it covers. Among equally
  // visible candidates, cover as little of the open windows as possible,
  // slide as little as possible, then fall back to the classic side order.
  scored.sort(
    (a, b) =>
      a.overflow - b.overflow ||
      a.overlap - b.overlap ||
      Math.abs(a.crossOffset) - Math.abs(b.crossOffset) ||
      a.priority - b.priority
  );

  const best = scored[0];
  return {
    side: best.side,
    align: best.align,
    bounds: best.bounds,
    crossOffset: best.crossOffset,
    penalty: best.overflow * OVERFLOW_WEIGHT + best.overlap,
  };
}
