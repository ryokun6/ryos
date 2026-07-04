import type { AssistantPosition } from "@/stores/useAssistantStore";
import {
  ASSISTANT_BUBBLE_ESTIMATED_HEIGHT,
  ASSISTANT_BUBBLE_WIDTH,
  resolveAssistantBubblePlacement,
} from "./assistantBubblePlacement";

const SNAP_MARGIN = 8;
const WINDOW_GAP = 8;

export interface AssistantSnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AssistantSnapViewport {
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
}

interface AssistantSnapSize {
  width: number;
  height: number;
}

interface ResolveAssistantSnapPointOptions {
  currentPosition: AssistantPosition;
  assistantSize: AssistantSnapSize;
  viewport: AssistantSnapViewport;
  targetBounds: AssistantSnapRect | null;
}

interface SnapCandidate {
  position: AssistantPosition;
  priority: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getRect(position: AssistantPosition, size: AssistantSnapSize): AssistantSnapRect {
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
}

function getRight(rect: AssistantSnapRect): number {
  return rect.x + rect.width;
}

function getBottom(rect: AssistantSnapRect): number {
  return rect.y + rect.height;
}

function getIntersectionArea(a: AssistantSnapRect, b: AssistantSnapRect): number {
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

function getDistanceSquared(
  a: AssistantPosition,
  b: AssistantPosition
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function getViewportEdgeFallback(
  currentPosition: AssistantPosition,
  assistantSize: AssistantSnapSize,
  viewport: AssistantSnapViewport
): AssistantPosition {
  const minX = SNAP_MARGIN;
  const maxX = Math.max(
    minX,
    viewport.width - assistantSize.width - SNAP_MARGIN
  );
  const minY = viewport.topInset + SNAP_MARGIN;
  const maxY = Math.max(
    minY,
    viewport.height -
      viewport.bottomInset -
      assistantSize.height -
      SNAP_MARGIN
  );
  const clamped = {
    x: clamp(currentPosition.x, minX, maxX),
    y: clamp(currentPosition.y, minY, maxY),
  };
  const candidates: AssistantPosition[] = [
    { x: minX, y: clamped.y },
    { x: maxX, y: clamped.y },
    { x: clamped.x, y: minY },
    { x: clamped.x, y: maxY },
  ];

  return candidates.reduce((nearest, candidate) =>
    getDistanceSquared(currentPosition, candidate) <
    getDistanceSquared(currentPosition, nearest)
      ? candidate
      : nearest
  );
}

/**
 * Finds a point adjacent to a target window. Bottom-right points are preferred,
 * but candidates that keep the assistant and its open bubble clear of the
 * target window and viewport rank ahead of partially obscured placements.
 */
export function resolveAssistantSnapPoint({
  currentPosition,
  assistantSize,
  viewport,
  targetBounds,
}: ResolveAssistantSnapPointOptions): AssistantPosition | null {
  if (!targetBounds) {
    return getViewportEdgeFallback(
      currentPosition,
      assistantSize,
      viewport
    );
  }

  const minX = SNAP_MARGIN;
  const maxX = Math.max(
    minX,
    viewport.width - assistantSize.width - SNAP_MARGIN
  );
  const minY = viewport.topInset + SNAP_MARGIN;
  const maxY = Math.max(
    minY,
    viewport.height -
      viewport.bottomInset -
      assistantSize.height -
      SNAP_MARGIN
  );
  const left = targetBounds.x;
  const right = getRight(targetBounds);
  const top = targetBounds.y;
  const bottom = getBottom(targetBounds);

  const candidates: SnapCandidate[] = [
    {
      position: {
        x: right + WINDOW_GAP,
        y: clamp(bottom - assistantSize.height, minY, maxY),
      },
      priority: 0,
    },
    {
      position: {
        x: clamp(right - assistantSize.width, minX, maxX),
        y: bottom + WINDOW_GAP,
      },
      priority: 1,
    },
    {
      position: {
        x: left - assistantSize.width - WINDOW_GAP,
        y: clamp(bottom - assistantSize.height, minY, maxY),
      },
      priority: 2,
    },
    {
      position: {
        x: clamp(right - assistantSize.width, minX, maxX),
        y: top - assistantSize.height - WINDOW_GAP,
      },
      priority: 3,
    },
    {
      position: {
        x: right + WINDOW_GAP,
        y: clamp(top, minY, maxY),
      },
      priority: 4,
    },
    {
      position: {
        x: clamp(left, minX, maxX),
        y: bottom + WINDOW_GAP,
      },
      priority: 5,
    },
    {
      position: {
        x: left - assistantSize.width - WINDOW_GAP,
        y: clamp(top, minY, maxY),
      },
      priority: 6,
    },
    {
      position: {
        x: clamp(left, minX, maxX),
        y: top - assistantSize.height - WINDOW_GAP,
      },
      priority: 7,
    },
  ];

  const valid = candidates.filter(({ position }) => {
    if (
      position.x < minX ||
      position.x > maxX ||
      position.y < minY ||
      position.y > maxY
    ) {
      return false;
    }
    return (
      getIntersectionArea(
        getRect(position, assistantSize),
        targetBounds
      ) === 0
    );
  });

  if (valid.length === 0) return null;

  return valid
    .map((candidate) => {
      // Score with the same window-aware resolver the bubble UI uses, so the
      // chosen dock point is one where the bubble can pop without covering
      // the target window or the viewport edges.
      const bubblePlacement = resolveAssistantBubblePlacement({
        anchor: getRect(candidate.position, assistantSize),
        bubbleSize: {
          width: ASSISTANT_BUBBLE_WIDTH,
          height: ASSISTANT_BUBBLE_ESTIMATED_HEIGHT,
        },
        viewport,
        obstacles: [targetBounds],
      });
      return {
        ...candidate,
        bubblePenalty: bubblePlacement.penalty,
        distance: getDistanceSquared(currentPosition, candidate.position),
      };
    })
    .sort(
      (a, b) =>
        a.bubblePenalty - b.bubblePenalty ||
        a.priority - b.priority ||
        a.distance - b.distance
    )[0].position;
}
