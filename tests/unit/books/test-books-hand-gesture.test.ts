import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { resolveBooksEdgeTapDirection } from "../../../src/apps/books/utils/booksEdgeTap";
import {
  BOOKS_HAND_GESTURE_COOLDOWN_MS,
  BOOKS_HAND_GESTURE_MIN_STREAK,
  BOOKS_HAND_RELEASE_STREAK,
  booksHandGestureCameraErrorKey,
  chooseBooksGestureHand,
  classifyBooksHandPose,
  createBooksHandGestureTracker,
  mirrorHandLandmarks,
  resolveBooksHandGestureDirection,
  shouldRunBooksHandCamera,
  stopMediaStream,
  type BooksHandGestureTracker,
  type HandLandmark,
} from "../../../src/apps/books/utils/booksHandGesture";
import {
  BOOKS_HAND_LANDMARKER_VERSION,
  BOOKS_HAND_MODEL_URL,
  booksHandVisionModuleUrl,
  booksHandWasmBaseUrl,
} from "../../../src/apps/books/utils/booksHandLandmarker";

const FRAME_MS = 80;

function landmark(x: number, y: number): HandLandmark {
  return { x, y, z: 0 };
}

function place(
  hand: HandLandmark[],
  index: number,
  x: number,
  y: number
): void {
  hand[index] = landmark(x, y);
}

function baseHand(centerX: number): HandLandmark[] {
  const hand = Array.from({ length: 21 }, () => landmark(centerX, 0.55));
  place(hand, 0, centerX, 0.78);
  place(hand, 5, centerX - 0.06, 0.52);
  place(hand, 9, centerX, 0.5);
  place(hand, 13, centerX + 0.05, 0.52);
  place(hand, 17, centerX + 0.1, 0.55);
  return hand;
}

/** Palm scale is about 0.28, fingertips well above the knuckles. */
function openHand(centerX = 0.5): HandLandmark[] {
  const hand = baseHand(centerX);
  place(hand, 4, centerX - 0.22, 0.5);
  place(hand, 8, centerX - 0.08, 0.18);
  place(hand, 12, centerX, 0.14);
  place(hand, 16, centerX + 0.06, 0.18);
  place(hand, 20, centerX + 0.12, 0.24);
  return hand;
}

function pinchHand(centerX = 0.5): HandLandmark[] {
  const hand = openHand(centerX);
  place(hand, 4, centerX - 0.01, 0.36);
  place(hand, 8, centerX + 0.01, 0.36);
  return hand;
}

function fistHand(centerX = 0.5): HandLandmark[] {
  const hand = baseHand(centerX);
  place(hand, 4, centerX - 0.2, 0.62);
  place(hand, 8, centerX - 0.04, 0.7);
  place(hand, 12, centerX, 0.7);
  place(hand, 16, centerX + 0.04, 0.71);
  place(hand, 20, centerX + 0.08, 0.72);
  return hand;
}

function pointingHand(centerX = 0.5): HandLandmark[] {
  const hand = fistHand(centerX);
  place(hand, 8, centerX - 0.06, 0.16);
  return hand;
}

function pushPose(
  tracker: BooksHandGestureTracker,
  hand: HandLandmark[] | null,
  count: number,
  startAt: number,
  isVerticalText = false
) {
  const results = [];
  for (let index = 0; index < count; index += 1) {
    results.push(
      tracker.push({
        landmarks: hand,
        timestamp: startAt + index * FRAME_MS,
        isVerticalText,
      })
    );
  }
  return results;
}

describe("Books hand pose", () => {
  test("recognizes a pinch, a fist hold, and an open palm", () => {
    expect(classifyBooksHandPose(pinchHand())).toBe("pinch");
    expect(classifyBooksHandPose(fistHand())).toBe("hold");
    expect(classifyBooksHandPose(openHand())).toBe("open");
  });

  test("ignores a pointing hand and incomplete landmarks", () => {
    expect(classifyBooksHandPose(pointingHand())).toBe("open");
    expect(classifyBooksHandPose(openHand().slice(0, 10))).toBe("none");
    expect(classifyBooksHandPose([])).toBe("none");
  });

  test("prefers an active hand over a larger open hand", () => {
    const pinch = pinchHand(0.2);
    const open = openHand(0.8);
    // Stretch the open hand so its palm is larger.
    place(open, 0, 0.8, 0.95);
    expect(chooseBooksGestureHand([open, pinch])).toEqual(pinch);
    expect(chooseBooksGestureHand([openHand().slice(0, 4)])).toBeNull();
  });
});

describe("Books hand gesture direction", () => {
  test("maps aimed left and right like page-edge taps", () => {
    for (const isVerticalText of [false, true]) {
      expect(
        resolveBooksHandGestureDirection({
          mirroredX: 0.12,
          deltaX: 0,
          isVerticalText,
        })
      ).toBe(
        resolveBooksEdgeTapDirection({
          clientX: 0,
          viewportWidth: 100,
          isVerticalText,
          hasSelection: false,
          isInteractiveTarget: false,
        })
      );
      expect(
        resolveBooksHandGestureDirection({
          mirroredX: 0.88,
          deltaX: 0,
          isVerticalText,
        })
      ).toBe(
        resolveBooksEdgeTapDirection({
          clientX: 99,
          viewportWidth: 100,
          isVerticalText,
          hasSelection: false,
          isInteractiveTarget: false,
        })
      );
    }
  });

  test("drops a move that disagrees with the aim, and ignores the center", () => {
    expect(
      resolveBooksHandGestureDirection({
        mirroredX: 0.3,
        deltaX: 0.2,
        isVerticalText: false,
      })
    ).toBeNull();
    expect(
      resolveBooksHandGestureDirection({
        mirroredX: 0.5,
        deltaX: 0.02,
        isVerticalText: false,
      })
    ).toBeNull();
    expect(
      resolveBooksHandGestureDirection({
        mirroredX: 0.5,
        deltaX: -0.2,
        isVerticalText: false,
      })
    ).toBe("prev");
  });
});

describe("Books hand gesture tracker", () => {
  test("requires a deliberate streak, then will not repeat until release and cooldown", () => {
    const tracker = createBooksHandGestureTracker();
    const first = pushPose(
      tracker,
      pinchHand(0.2),
      BOOKS_HAND_GESTURE_MIN_STREAK,
      0
    );
    expect(first.slice(0, -1).every((frame) => frame.direction == null)).toBe(
      true
    );
    expect(first.at(-1)?.direction).toBe("prev");
    expect(first.at(-1)?.pose).toBe("pinch");

    const held = pushPose(tracker, pinchHand(0.2), 4, 400);
    expect(held.every((frame) => frame.direction == null)).toBe(true);

    const releaseAt = 400 + 4 * FRAME_MS;
    pushPose(tracker, openHand(0.5), BOOKS_HAND_RELEASE_STREAK, releaseAt);

    const flipAt = (BOOKS_HAND_GESTURE_MIN_STREAK - 1) * FRAME_MS;
    const cooldownEnd = flipAt + BOOKS_HAND_GESTURE_COOLDOWN_MS;
    const blockedStart = releaseAt + BOOKS_HAND_RELEASE_STREAK * FRAME_MS;
    expect(
      blockedStart + (BOOKS_HAND_GESTURE_MIN_STREAK - 1) * FRAME_MS
    ).toBeLessThan(cooldownEnd);
    const blocked = pushPose(
      tracker,
      pinchHand(0.2),
      BOOKS_HAND_GESTURE_MIN_STREAK,
      blockedStart
    );
    expect(blocked.every((frame) => frame.direction == null)).toBe(true);

    pushPose(tracker, null, BOOKS_HAND_RELEASE_STREAK, cooldownEnd);
    const again = pushPose(
      tracker,
      fistHand(0.84),
      BOOKS_HAND_GESTURE_MIN_STREAK,
      cooldownEnd + BOOKS_HAND_RELEASE_STREAK * FRAME_MS + 20
    );
    expect(again.slice(0, -1).every((frame) => frame.direction == null)).toBe(
      true
    );
    expect(again.at(-1)?.direction).toBe("next");
    expect(again.at(-1)?.pose).toBe("hold");
  });

  test("a gap in the pose restarts the streak", () => {
    const tracker = createBooksHandGestureTracker();
    pushPose(tracker, pinchHand(0.2), BOOKS_HAND_GESTURE_MIN_STREAK - 1, 0);
    tracker.push({ landmarks: null, timestamp: 400, isVerticalText: false });
    const retry = pushPose(
      tracker,
      pinchHand(0.2),
      BOOKS_HAND_GESTURE_MIN_STREAK - 1,
      480
    );
    expect(retry.every((frame) => frame.direction == null)).toBe(true);
    const fired = tracker.push({
      landmarks: pinchHand(0.2),
      timestamp: 480 + (BOOKS_HAND_GESTURE_MIN_STREAK - 1) * FRAME_MS,
      isVerticalText: false,
    });
    expect(fired.direction).toBe("prev");
  });

  test("an open palm aimed to the side does not turn the page", () => {
    const tracker = createBooksHandGestureTracker();
    const frames = pushPose(tracker, openHand(0.15), 8, 0);
    expect(frames.every((frame) => frame.direction == null)).toBe(true);
    expect(frames.at(-1)?.pose).toBe("open");
  });

  test("vertical text reverses the same aim", () => {
    const tracker = createBooksHandGestureTracker();
    const frames = pushPose(
      tracker,
      pinchHand(0.2),
      BOOKS_HAND_GESTURE_MIN_STREAK,
      0,
      true
    );
    expect(frames.at(-1)?.direction).toBe("next");
  });

  test("mirrors camera x so the reader's left stays left", () => {
    const mirrored = mirrorHandLandmarks([landmark(0.1, 0.4), landmark(0.8, 0.2)]);
    expect(mirrored[0]?.x).toBeCloseTo(0.9);
    expect(mirrored[1]?.x).toBeCloseTo(0.2);
  });
});

describe("Books hand camera lifecycle", () => {
  test("runs only while reading, visible, and explicitly enabled", () => {
    const ready = {
      enabled: true,
      isReading: true,
      isWindowOpen: true,
      isMinimized: false,
      pageVisible: true,
    };
    expect(shouldRunBooksHandCamera(ready)).toBe(true);
    expect(shouldRunBooksHandCamera({ ...ready, enabled: false })).toBe(false);
    expect(shouldRunBooksHandCamera({ ...ready, isReading: false })).toBe(false);
    expect(shouldRunBooksHandCamera({ ...ready, isWindowOpen: false })).toBe(
      false
    );
    expect(shouldRunBooksHandCamera({ ...ready, isMinimized: true })).toBe(
      false
    );
    expect(shouldRunBooksHandCamera({ ...ready, pageVisible: false })).toBe(
      false
    );
  });

  test("stops every track on the stream", () => {
    const stopped: string[] = [];
    stopMediaStream({
      getTracks: () => [
        { stop: () => stopped.push("a") },
        {
          stop: () => {
            throw new Error("already ended");
          },
        },
        { stop: () => stopped.push("c") },
      ],
    });
    expect(stopped).toEqual(["a", "c"]);
    expect(() => stopMediaStream(null)).not.toThrow();
  });

  test("maps permission and missing-camera failures to short messages", () => {
    expect(
      booksHandGestureCameraErrorKey(
        new DOMException("denied", "NotAllowedError")
      )
    ).toBe("cameraDenied");
    expect(
      booksHandGestureCameraErrorKey(
        new DOMException("missing", "NotFoundError")
      )
    ).toBe("cameraMissing");
    expect(
      booksHandGestureCameraErrorKey(
        new DOMException("busy", "NotReadableError")
      )
    ).toBe("cameraBusy");
    expect(
      booksHandGestureCameraErrorKey(
        new DOMException("insecure", "SecurityError")
      )
    ).toBe("cameraUnavailable");
    expect(booksHandGestureCameraErrorKey(new Error("model"))).toBe(
      "detectorFailed"
    );
  });

  test("pins the on-device vision runtime instead of a floating latest tag", () => {
    expect(BOOKS_HAND_LANDMARKER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(booksHandVisionModuleUrl()).toContain(
      `@mediapipe/tasks-vision@${BOOKS_HAND_LANDMARKER_VERSION}/`
    );
    expect(booksHandVisionModuleUrl()).not.toContain("@latest");
    expect(booksHandWasmBaseUrl()).toContain("/wasm");
    expect(BOOKS_HAND_MODEL_URL.startsWith("https://")).toBe(true);
    expect(BOOKS_HAND_MODEL_URL).not.toContain("upload");
    const source = readFileSync(
      new URL(
        "../../../src/apps/books/utils/booksHandLandmarker.ts",
        import.meta.url
      ),
      "utf8"
    );
    expect(source).toContain("import(/* @vite-ignore */");
    expect(source).not.toContain('from "@mediapipe/tasks-vision"');
  });
});
