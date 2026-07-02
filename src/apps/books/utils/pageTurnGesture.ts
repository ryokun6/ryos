export type PageTurnDirection = "next" | "prev";

export interface PageTurnGesturePoint {
  x: number;
  y: number;
  time: number;
}

export interface PageTurnGestureInput {
  start: PageTurnGesturePoint;
  current: PageTurnGesturePoint;
  viewportWidth: number;
  viewportHeight: number;
}

export interface PageTurnGestureMetrics {
  direction: PageTurnDirection | null;
  isIntentional: boolean;
  progress: number;
  originY: number;
  tiltDeg: number;
  horizontalDistance: number;
  verticalDistance: number;
  effectiveDistance: number;
  horizontalVelocity: number;
  angleFromHorizontalDeg: number;
  viewportWidth: number;
}

export interface PageTurnAvailability {
  canGoPreviousPage: boolean;
  canGoNextPage: boolean;
}

const INTENT_HORIZONTAL_DISTANCE_PX = 8;
const MAX_ANGLE_FROM_HORIZONTAL_DEG = 72;
const COMMIT_PROGRESS = 0.16;
const COMMIT_HORIZONTAL_DISTANCE_PX = 22;
const FLICK_HORIZONTAL_DISTANCE_PX = 18;
const FLICK_VELOCITY_PX_PER_MS = 0.45;
const MOUSE_EDGE_ZONE_RATIO = 0.28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isPageTurnGestureStartAllowed({
  pointerType,
  startX,
  viewportWidth,
}: {
  pointerType: string;
  startX: number;
  viewportWidth: number;
}): boolean {
  if (pointerType !== "mouse") return true;
  if (viewportWidth <= 0) return false;

  const edgeWidth = viewportWidth * MOUSE_EDGE_ZONE_RATIO;
  return startX <= edgeWidth || startX >= viewportWidth - edgeWidth;
}

export function measurePageTurnGesture({
  start,
  current,
  viewportWidth,
  viewportHeight,
}: PageTurnGestureInput): PageTurnGestureMetrics {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const absDx = Math.abs(deltaX);
  const absDy = Math.abs(deltaY);
  const direction: PageTurnDirection | null =
    absDx >= INTENT_HORIZONTAL_DISTANCE_PX
      ? deltaX < 0
        ? "next"
        : "prev"
      : null;
  const angleFromHorizontalDeg =
    absDx === 0 ? 90 : (Math.atan2(absDy, absDx) * 180) / Math.PI;
  const isIntentional =
    direction !== null &&
    angleFromHorizontalDeg <= MAX_ANGLE_FROM_HORIZONTAL_DEG;

  // Let diagonal travel help lift the page without allowing a near-vertical
  // drag to become a turn. This feels less rigid than using deltaX alone.
  const effectiveDistance = isIntentional ? absDx + absDy * 0.22 : 0;
  const travelForFullTurn = Math.max(150, viewportWidth * 0.42);
  const elapsedMs = Math.max(1, current.time - start.time);

  return {
    direction,
    isIntentional,
    progress: clamp(effectiveDistance / travelForFullTurn, 0, 1),
    originY: clamp(start.y / Math.max(1, viewportHeight), 0.08, 0.92),
    tiltDeg: clamp((deltaY / Math.max(1, viewportHeight)) * 24, -9, 9),
    horizontalDistance: absDx,
    verticalDistance: absDy,
    effectiveDistance,
    horizontalVelocity: absDx / elapsedMs,
    angleFromHorizontalDeg,
    viewportWidth: Math.max(0, viewportWidth),
  };
}

export function canTurnPage(
  direction: PageTurnDirection,
  availability: PageTurnAvailability,
): boolean {
  return direction === "next"
    ? availability.canGoNextPage
    : availability.canGoPreviousPage;
}

export function shouldCommitPageTurn(
  metrics: PageTurnGestureMetrics,
  availability: PageTurnAvailability,
): boolean {
  if (
    !metrics.isIntentional ||
    !metrics.direction ||
    !canTurnPage(metrics.direction, availability)
  ) {
    return false;
  }

  const crossedDistanceThreshold =
    metrics.progress >= COMMIT_PROGRESS &&
    metrics.horizontalDistance >= COMMIT_HORIZONTAL_DISTANCE_PX;
  const wasFlicked =
    metrics.horizontalDistance >= FLICK_HORIZONTAL_DISTANCE_PX &&
    metrics.horizontalVelocity >= FLICK_VELOCITY_PX_PER_MS;

  return crossedDistanceThreshold || wasFlicked;
}
