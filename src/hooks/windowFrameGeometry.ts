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

function normalizeVerticalPosition(
  y: number,
  height: number,
  viewport: ViewportSize,
  topInset: number,
  bottomInset: number
): number {
  const availableHeight = Math.max(
    MIN_VISIBLE_EDGE,
    viewport.height - topInset - bottomInset
  );
  const maxFullyVisibleY = Math.max(
    topInset,
    viewport.height - bottomInset - height
  );

  if (height > availableHeight) {
    return topInset;
  }
  if (y < topInset || y > maxFullyVisibleY) {
    return topInset;
  }
  return y;
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
    return {
      position: {
        x: 0,
        y: normalizeVerticalPosition(
          position.y,
          mobileSize.height,
          viewport,
          topInset,
          bottomInset
        ),
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
      y: normalizeVerticalPosition(
        clamp(position.y, topInset, maxY),
        nextSize.height,
        viewport,
        topInset,
        bottomInset
      ),
    },
    size: nextSize,
  };
}
