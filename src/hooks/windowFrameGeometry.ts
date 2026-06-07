import type { WindowPosition, WindowSize } from "@/types/types";

const MIN_VISIBLE_EDGE = 80;

export type ViewportSize = WindowSize;

export interface NormalizeWindowFrameInput {
  position: WindowPosition;
  size: WindowSize;
  viewport: ViewportSize;
  topInset: number;
  bottomInset: number;
  isMobile: boolean;
  mobileSize: WindowSize;
}

export interface WindowFrameState {
  position: WindowPosition;
  size: WindowSize;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function normalizeWindowFrame({
  position,
  size,
  viewport,
  topInset,
  bottomInset,
  isMobile,
  mobileSize,
}: NormalizeWindowFrameInput): WindowFrameState {
  if (isMobile) {
    const availableHeight = Math.max(
      MIN_VISIBLE_EDGE,
      viewport.height - bottomInset
    );
    return {
      position: {
        x: 0,
        y: clamp(position.y, topInset, availableHeight - MIN_VISIBLE_EDGE),
      },
      size: mobileSize,
    };
  }

  const nextSize = {
    width: Math.min(size.width, viewport.width),
    height: size.height,
  };
  const minX =
    nextSize.width > MIN_VISIBLE_EDGE ? -(nextSize.width - MIN_VISIBLE_EDGE) : 0;
  const maxX = Math.max(0, viewport.width - MIN_VISIBLE_EDGE);
  const maxY = Math.max(topInset, viewport.height - MIN_VISIBLE_EDGE);

  let nextX = position.x;
  if (nextX + nextSize.width > viewport.width) {
    nextX = Math.max(0, viewport.width - nextSize.width);
  }

  return {
    position: {
      x: clamp(nextX, minX, maxX),
      y: clamp(position.y, topInset, maxY),
    },
    size: nextSize,
  };
}
