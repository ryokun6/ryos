import type { BooksPageTurnDirection } from "./booksEdgeTap";

/**
 * A normalized MediaPipe hand landmark. x/y are 0..1 in image space
 * (origin at the top-left of the unmirrored camera frame).
 */
export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export type BooksHandPose = "pinch" | "hold" | "open" | "none";
export type BooksHandAimSide = "left" | "center" | "right";

/** Consecutive active frames before a pose can turn a page (~350ms at 70ms). */
export const BOOKS_HAND_GESTURE_MIN_STREAK = 5;
/** Open / missing-hand frames required before another flip can arm. */
export const BOOKS_HAND_RELEASE_STREAK = 3;
/** Ignore further flips after one lands, so a held pose cannot spam. */
export const BOOKS_HAND_GESTURE_COOLDOWN_MS = 1100;
/** Mirrored x at or left of this is "aimed left". */
export const BOOKS_HAND_AIM_LEFT_MAX = 0.36;
/** Mirrored x at or right of this is "aimed right". The middle is a dead zone. */
export const BOOKS_HAND_AIM_RIGHT_MIN = 0.64;
/** Mirrored-x travel while the pose is held that counts as a deliberate move. */
export const BOOKS_HAND_MOVE_MIN = 0.16;
/** Thumb-tip to index-tip distance, divided by palm size. */
export const BOOKS_HAND_PINCH_RATIO = 0.48;
/** A fingertip this much closer to the wrist than its knuckle is curled. */
export const BOOKS_HAND_CURL_RATIO = 0.92;
/** Ignore hands that are too small in frame to classify reliably. */
export const BOOKS_HAND_MIN_PALM = 0.045;

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const FINGERS = [
  { mcp: 5, tip: 8 },
  { mcp: 9, tip: 12 },
  { mcp: 13, tip: 16 },
  { mcp: 17, tip: 20 },
] as const;

/** MediaPipe hand skeleton, used to draw the preview silhouette. */
export const BOOKS_HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

export type BooksHandCameraErrorKey =
  | "cameraDenied"
  | "cameraMissing"
  | "cameraBusy"
  | "cameraUnavailable"
  | "detectorFailed";

export interface BooksHandGestureFrame {
  /** Landmarks in mirrored preview space (0 = the reader's left). */
  landmarks: HandLandmark[] | null;
  timestamp: number;
  isVerticalText: boolean;
}

export interface BooksHandGestureFeedback {
  pose: BooksHandPose;
  side: BooksHandAimSide;
  direction: BooksPageTurnDirection | null;
}

export interface BooksHandGestureTracker {
  push(frame: BooksHandGestureFrame): BooksHandGestureFeedback;
  reset(): void;
}

interface TrackerState {
  streak: number;
  inactiveStreak: number;
  armed: boolean;
  cooldownUntil: number;
  originX: number | null;
}

function finitePoint(
  landmarks: HandLandmark[],
  index: number
): HandLandmark | null {
  const point = landmarks[index];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }
  return point;
}

function distance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function palmSize(landmarks: HandLandmark[]): number {
  const wrist = finitePoint(landmarks, WRIST);
  const middleMcp = finitePoint(landmarks, MIDDLE_MCP);
  if (!wrist || !middleMcp) return 0;
  return distance(wrist, middleMcp);
}

function palmCenterX(landmarks: HandLandmark[]): number | null {
  const wrist = finitePoint(landmarks, WRIST);
  const middleMcp = finitePoint(landmarks, MIDDLE_MCP);
  if (!wrist || !middleMcp) return null;
  return (wrist.x + middleMcp.x) / 2;
}

function isFingerCurled(
  landmarks: HandLandmark[],
  wrist: HandLandmark,
  mcpIndex: number,
  tipIndex: number
): boolean {
  const mcp = finitePoint(landmarks, mcpIndex);
  const tip = finitePoint(landmarks, tipIndex);
  if (!mcp || !tip) return false;
  return distance(tip, wrist) < distance(mcp, wrist) * BOOKS_HAND_CURL_RATIO;
}

export function mirrorHandLandmarks(landmarks: HandLandmark[]): HandLandmark[] {
  return landmarks.map((point) => ({ ...point, x: 1 - point.x }));
}

/**
 * Pinch: thumb and index tips meet. Hold: a closed fist (index curled, and
 * at least three fingers curled) so a pointing hand does not turn pages.
 */
export function classifyBooksHandPose(landmarks: HandLandmark[]): BooksHandPose {
  if (landmarks.length < 21) return "none";
  const wrist = finitePoint(landmarks, WRIST);
  const thumbTip = finitePoint(landmarks, THUMB_TIP);
  const indexTip = finitePoint(landmarks, INDEX_TIP);
  const size = palmSize(landmarks);
  if (!wrist || !thumbTip || !indexTip || size < BOOKS_HAND_MIN_PALM) {
    return "none";
  }

  let curledCount = 0;
  let indexCurled = false;
  for (const finger of FINGERS) {
    const curled = isFingerCurled(landmarks, wrist, finger.mcp, finger.tip);
    if (!curled) continue;
    curledCount += 1;
    if (finger.tip === INDEX_TIP) indexCurled = true;
  }

  const pinchRatio = distance(thumbTip, indexTip) / size;
  const isHold = indexCurled && curledCount >= 3;
  if (isHold) return "hold";
  if (pinchRatio < BOOKS_HAND_PINCH_RATIO) return "pinch";
  return "open";
}

export function isBooksHandPoseActive(pose: BooksHandPose): boolean {
  return pose === "pinch" || pose === "hold";
}

/**
 * Prefer a hand that is already pinching or holding. Otherwise keep the
 * largest hand so the preview still has a silhouette.
 */
export function chooseBooksGestureHand(
  hands: HandLandmark[][]
): HandLandmark[] | null {
  let best: HandLandmark[] | null = null;
  let bestActive = false;
  let bestPalm = -1;
  let bestAim = -1;

  for (const hand of hands) {
    if (hand.length < 21) continue;
    const size = palmSize(hand);
    if (size < BOOKS_HAND_MIN_PALM) continue;
    const pose = classifyBooksHandPose(hand);
    const active = isBooksHandPoseActive(pose);
    const center = palmCenterX(hand);
    const aim = center == null ? 0 : Math.abs(center - 0.5);
    let better = false;
    if (!best) {
      better = true;
    } else if (active !== bestActive) {
      better = active;
    } else if (active) {
      better = aim > bestAim || (aim === bestAim && size > bestPalm);
    } else {
      better = size > bestPalm;
    }
    if (!better) continue;
    best = hand;
    bestActive = active;
    bestPalm = size;
    bestAim = aim;
  }

  return best;
}

function aimSide(mirroredX: number): "left" | "right" | null {
  if (mirroredX <= BOOKS_HAND_AIM_LEFT_MAX) return "left";
  if (mirroredX >= BOOKS_HAND_AIM_RIGHT_MIN) return "right";
  return null;
}

function sideFromX(mirroredX: number): BooksHandAimSide {
  return aimSide(mirroredX) ?? "center";
}

/**
 * Left/right in the mirrored preview match the page-edge taps: left is the
 * previous page for horizontal text, and vertical writing reverses that.
 * A move and an aim that disagree are dropped.
 */
export function resolveBooksHandGestureDirection({
  mirroredX,
  deltaX,
  isVerticalText,
}: {
  mirroredX: number;
  deltaX: number;
  isVerticalText: boolean;
}): BooksPageTurnDirection | null {
  if (!Number.isFinite(mirroredX) || !Number.isFinite(deltaX)) return null;

  const aim = aimSide(mirroredX);
  const move =
    deltaX <= -BOOKS_HAND_MOVE_MIN
      ? "left"
      : deltaX >= BOOKS_HAND_MOVE_MIN
        ? "right"
        : null;
  if (aim && move && aim !== move) return null;

  const side = move ?? aim;
  if (!side) return null;
  if (side === "left") return isVerticalText ? "next" : "prev";
  return isVerticalText ? "prev" : "next";
}

function emptyTrackerState(): TrackerState {
  return {
    streak: 0,
    inactiveStreak: BOOKS_HAND_RELEASE_STREAK,
    armed: true,
    cooldownUntil: 0,
    originX: null,
  };
}

export function createBooksHandGestureTracker(): BooksHandGestureTracker {
  let state = emptyTrackerState();

  return {
    reset() {
      state = emptyTrackerState();
    },
    push(frame) {
      const landmarks = frame.landmarks;
      const pose = landmarks ? classifyBooksHandPose(landmarks) : "none";
      const centerX = landmarks ? palmCenterX(landmarks) : null;
      const side = centerX == null ? "center" : sideFromX(centerX);
      const active = isBooksHandPoseActive(pose) && centerX != null;
      let direction: BooksPageTurnDirection | null = null;

      if (!active || centerX == null) {
        state = {
          ...state,
          streak: 0,
          originX: null,
          inactiveStreak: state.inactiveStreak + 1,
          armed:
            state.armed ||
            state.inactiveStreak + 1 >= BOOKS_HAND_RELEASE_STREAK,
        };
      } else {
        const originX = state.streak === 0 || state.originX == null
          ? centerX
          : state.originX;
        const streak = state.streak + 1;
        const ready =
          state.armed &&
          frame.timestamp >= state.cooldownUntil &&
          streak >= BOOKS_HAND_GESTURE_MIN_STREAK;

        if (ready) {
          direction = resolveBooksHandGestureDirection({
            mirroredX: centerX,
            deltaX: centerX - originX,
            isVerticalText: frame.isVerticalText,
          });
        }

        state = direction
          ? {
              streak: 0,
              inactiveStreak: 0,
              armed: false,
              cooldownUntil: frame.timestamp + BOOKS_HAND_GESTURE_COOLDOWN_MS,
              originX: null,
            }
          : {
              ...state,
              streak,
              originX,
              inactiveStreak: 0,
            };
      }

      return { pose, side, direction };
    },
  };
}

/**
 * The camera runs only for an explicit, visible reading session. Hiding the
 * window, leaving the book, or switching tabs drops the predicate so the
 * stream can be released by unmounting the controller.
 */
export function shouldRunBooksHandCamera({
  enabled,
  isReading,
  isWindowOpen,
  isMinimized,
  pageVisible,
}: {
  enabled: boolean;
  isReading: boolean;
  isWindowOpen: boolean;
  isMinimized: boolean;
  pageVisible: boolean;
}): boolean {
  return enabled && isReading && isWindowOpen && !isMinimized && pageVisible;
}

export function booksHandGestureCameraErrorKey(
  error: unknown
): BooksHandCameraErrorKey {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "cameraDenied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "cameraMissing";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "cameraBusy";
    case "SecurityError":
    case "NotSupportedError":
      return "cameraUnavailable";
    default:
      return "detectorFailed";
  }
}

export function stopMediaStream(
  stream: { getTracks(): Array<{ stop(): void }> } | null | undefined
): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // A track can already be ended; stopping the rest still matters.
    }
  }
}
