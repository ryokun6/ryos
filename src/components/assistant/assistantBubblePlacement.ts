/**
 * Window-aware placement for the assistant's speech bubble.
 *
 * The bubble can pop on any of the four sides of the character (above, below,
 * left, right) with two alignments per side. Candidates are scored by how much
 * of the bubble would fall outside the viewport (worst) and how much would
 * cover open windows, so a character docked next to a window pops its bubble
 * away from the window instead of over it.
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
  /** Weighted viewport-overflow + window-overlap area. 0 = fully clear. */
  penalty: number;
}

export const ASSISTANT_BUBBLE_WIDTH = 256;
export const ASSISTANT_BUBBLE_ESTIMATED_HEIGHT = 208;
export const ASSISTANT_BUBBLE_GAP = 8;

/** Covering a window is bad; pushing the bubble offscreen is worse. */
const OVERFLOW_WEIGHT = 4;

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

  const scored = candidates.map((candidate) => {
    const overlap = obstacles.reduce(
      (total, obstacle) =>
        total + getIntersectionArea(candidate.bounds, obstacle),
      0
    );
    return {
      ...candidate,
      penalty:
        getOverflowArea(candidate.bounds, viewport) * OVERFLOW_WEIGHT +
        overlap,
    };
  });

  scored.sort((a, b) => a.penalty - b.penalty || a.priority - b.priority);

  const best = scored[0];
  return {
    side: best.side,
    align: best.align,
    bounds: best.bounds,
    penalty: best.penalty,
  };
}
