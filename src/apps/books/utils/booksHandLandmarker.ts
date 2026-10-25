import type { HandLandmark } from "./booksHandGesture";

/**
 * MediaPipe Tasks Vision is loaded from a pinned CDN URL the first time hand
 * gestures are turned on. The wasm and model stay out of the app bundle and
 * the offline precache. Camera frames are passed only to the local landmarker
 * — nothing here uploads video.
 */
export const BOOKS_HAND_LANDMARKER_VERSION = "1.1.1";

export const BOOKS_HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export const BOOKS_HAND_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 320 },
    height: { ideal: 240 },
    frameRate: { ideal: 15, max: 24 },
  },
};

const MIN_HAND_SCORE = 0.5;

export function booksHandVisionModuleUrl(
  version: string = BOOKS_HAND_LANDMARKER_VERSION
): string {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/vision_bundle.mjs`;
}

export function booksHandWasmBaseUrl(
  version: string = BOOKS_HAND_LANDMARKER_VERSION
): string {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`;
}

interface HandLandmarkerLike {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number
  ) => {
    landmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
    handedness?: Array<Array<{ score?: number }>>;
  };
  close: () => void;
}

interface VisionTasksModule {
  FilesetResolver: {
    forVisionTasks: (basePath: string) => Promise<unknown>;
  };
  HandLandmarker: {
    createFromOptions: (
      wasmFileset: unknown,
      options: {
        baseOptions: {
          modelAssetPath: string;
          delegate: "CPU";
        };
        runningMode: "VIDEO";
        numHands: number;
        minHandDetectionConfidence: number;
        minHandPresenceConfidence: number;
        minTrackingConfidence: number;
      }
    ) => Promise<HandLandmarkerLike>;
  };
}

export interface BooksHandLandmarker {
  detect(video: HTMLVideoElement, timestampMs: number): HandLandmark[][];
  close(): void;
}

let visionModulePromise: Promise<VisionTasksModule> | null = null;

function loadVisionModule(): Promise<VisionTasksModule> {
  if (!visionModulePromise) {
    const url = booksHandVisionModuleUrl();
    visionModulePromise = import(/* @vite-ignore */ url).catch((error: unknown) => {
      visionModulePromise = null;
      throw error;
    }) as Promise<VisionTasksModule>;
  }
  return visionModulePromise;
}

export async function createBooksHandLandmarker(): Promise<BooksHandLandmarker> {
  const vision = await loadVisionModule();
  const fileset = await vision.FilesetResolver.forVisionTasks(
    booksHandWasmBaseUrl()
  );
  // CPU keeps detection local without opening a second WebGL context next to
  // the desktop shaders. Frames stay in this process.
  const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: BOOKS_HAND_MODEL_URL,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });

  let lastTimestamp = -1;
  let closed = false;

  return {
    detect(video, timestampMs) {
      if (closed) return [];
      let timestamp = timestampMs;
      if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
      lastTimestamp = timestamp;
      const result = landmarker.detectForVideo(video, timestamp);
      const hands = result.landmarks ?? [];
      const scores = result.handedness ?? [];
      const accepted: HandLandmark[][] = [];
      for (let index = 0; index < hands.length; index += 1) {
        const score = scores[index]?.[0]?.score ?? 1;
        const landmarks = hands[index];
        if (score < MIN_HAND_SCORE || !landmarks || landmarks.length < 21) {
          continue;
        }
        accepted.push(landmarks);
      }
      return accepted;
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        landmarker.close();
      } catch {
        // The wasm runtime can already be gone during unmount.
      }
    },
  };
}

export async function openBooksHandCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(
      "Camera API is unavailable",
      "NotSupportedError"
    );
  }

  try {
    return await navigator.mediaDevices.getUserMedia(
      BOOKS_HAND_CAMERA_CONSTRAINTS
    );
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name: unknown }).name)
        : "";
    // A bare facingMode value is a required constraint. Desktop cameras that
    // cannot satisfy it should fall through to any available video device.
    // Permission and "no camera" failures stay as themselves.
    if (
      name === "NotAllowedError" ||
      name === "PermissionDeniedError" ||
      name === "NotFoundError" ||
      name === "DevicesNotFoundError"
    ) {
      throw error;
    }
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
  }
}
