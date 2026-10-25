import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { BooksPageTurnDirection } from "../utils/booksEdgeTap";
import {
  BOOKS_HAND_CONNECTIONS,
  chooseBooksGestureHand,
  createBooksHandGestureTracker,
  mirrorHandLandmarks,
  stopMediaStream,
  booksHandGestureCameraErrorKey,
  type BooksHandCameraErrorKey,
  type BooksHandPose,
  type HandLandmark,
} from "../utils/booksHandGesture";
import {
  createBooksHandLandmarker,
  openBooksHandCamera,
  type BooksHandLandmarker,
} from "../utils/booksHandLandmarker";
import { createClientLogger } from "@/utils/logger";

const booksHandLog = createClientLogger("BooksHandGesture");

const DETECT_INTERVAL_MS = 70;
const FLIP_FLASH_MS = 420;
const HINT_VISIBLE_MS = 4500;

interface BooksHandGestureOverlayProps {
  isVerticalText: boolean;
  onFlip: (direction: BooksPageTurnDirection) => void;
}

type GestureStatus =
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "error"; messageKey: BooksHandCameraErrorKey };

interface FlipPulse {
  id: number;
  side: "left" | "right";
  direction: BooksPageTurnDirection;
}

function caretSide(
  direction: BooksPageTurnDirection,
  isVerticalText: boolean
): "left" | "right" {
  const forwardIsRight = !isVerticalText;
  if (direction === "next") return forwardIsRight ? "right" : "left";
  return forwardIsRight ? "left" : "right";
}

function drawBooksHandSilhouette(
  canvas: HTMLCanvasElement | null,
  landmarks: HandLandmark[] | null,
  pose: BooksHandPose
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;

  const active = pose === "pinch" || pose === "hold";
  ctx.lineWidth = active ? 3.5 * dpr : 2.5 * dpr;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = active
    ? "rgba(255,255,255,0.95)"
    : "rgba(255,255,255,0.55)";
  ctx.beginPath();
  for (const [start, end] of BOOKS_HAND_CONNECTIONS) {
    const from = landmarks[start];
    const to = landmarks[end];
    if (!from || !to) continue;
    ctx.moveTo(from.x * width, from.y * height);
    ctx.lineTo(to.x * width, to.y * height);
  }
  ctx.stroke();

  ctx.fillStyle = ctx.strokeStyle;
  const radius = (active ? 3.2 : 2.2) * dpr;
  for (const point of landmarks) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Small mirrored camera card. Mounted only while gestures should be running;
 * unmounting stops the stream and closes the landmarker.
 */
export function BooksHandGestureOverlay({
  isVerticalText,
  onFlip,
}: BooksHandGestureOverlayProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFlipRef = useRef(onFlip);
  const isVerticalTextRef = useRef(isVerticalText);
  const poseRef = useRef<BooksHandPose>("none");
  const [status, setStatus] = useState<GestureStatus>({ kind: "starting" });
  const [pose, setPose] = useState<BooksHandPose>("none");
  const [pulse, setPulse] = useState<FlipPulse | null>(null);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    onFlipRef.current = onFlip;
  }, [onFlip]);

  useEffect(() => {
    isVerticalTextRef.current = isVerticalText;
  }, [isVerticalText]);

  useEffect(() => {
    if (status.kind !== "live") return;
    const id = window.setTimeout(() => setShowHint(false), HINT_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [status.kind]);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let raf = 0;
    let pulseTimer = 0;
    let stream: MediaStream | null = null;
    let landmarker: BooksHandLandmarker | null = null;
    const tracker = createBooksHandGestureTracker();

    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const releaseResources = () => {
      stopLoop();
      landmarker?.close();
      landmarker = null;
      stopMediaStream(stream);
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    const invalidate = () => {
      generation += 1;
      releaseResources();
    };

    const fail = (messageKey: BooksHandCameraErrorKey) => {
      if (cancelled) return;
      invalidate();
      booksHandLog.warn("Hand gestures stopped", { messageKey });
      setStatus({ kind: "error", messageKey });
    };

    const start = async () => {
      if (cancelled) return;
      generation += 1;
      const gen = generation;
      releaseResources();
      setStatus({ kind: "starting" });
      setShowHint(true);
      tracker.reset();

      const streamAttempt = openBooksHandCamera().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error })
      );
      const modelAttempt = createBooksHandLandmarker().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error })
      );
      const [streamResult, modelResult] = await Promise.all([
        streamAttempt,
        modelAttempt,
      ]);

      const stale = cancelled || gen !== generation;
      if (stale || !streamResult.ok || !modelResult.ok) {
        if (streamResult.ok) stopMediaStream(streamResult.value);
        if (modelResult.ok) modelResult.value.close();
        if (stale) return;
        const messageKey = !streamResult.ok
          ? booksHandGestureCameraErrorKey(streamResult.error)
          : "detectorFailed";
        booksHandLog.warn("Hand gestures failed to start", { messageKey });
        setStatus({ kind: "error", messageKey });
        return;
      }

      if (cancelled || gen !== generation) {
        stopMediaStream(streamResult.value);
        modelResult.value.close();
        return;
      }

      stream = streamResult.value;
      landmarker = modelResult.value;
      const video = videoRef.current;
      if (!video) {
        fail("detectorFailed");
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      try {
        await video.play();
      } catch (error) {
        if (cancelled || gen !== generation) {
          releaseResources();
          return;
        }
        booksHandLog.warn("Camera preview could not play", {
          messageKey: booksHandGestureCameraErrorKey(error),
        });
        fail("detectorFailed");
        return;
      }
      if (cancelled || gen !== generation) {
        releaseResources();
        return;
      }

      setStatus({ kind: "live" });
      let lastDetect = 0;
      let failures = 0;

      const loop = (now: number) => {
        if (cancelled || gen !== generation) return;
        raf = requestAnimationFrame(loop);
        if (now - lastDetect < DETECT_INTERVAL_MS) return;
        lastDetect = now;
        const currentVideo = videoRef.current;
        const marker = landmarker;
        if (!currentVideo || !marker || currentVideo.readyState < 2) return;
        try {
          const hands = marker.detect(currentVideo, now);
          failures = 0;
          const chosen = chooseBooksGestureHand(hands);
          // The preview element is CSS-mirrored, so the silhouette is drawn in
          // raw camera space and flips with the video. The tracker uses the
          // mirrored axis, where x = 0 is the reader's left.
          const mirrored = chosen ? mirrorHandLandmarks(chosen) : null;
          const feedback = tracker.push({
            landmarks: mirrored,
            timestamp: now,
            isVerticalText: isVerticalTextRef.current,
          });
          drawBooksHandSilhouette(canvasRef.current, chosen, feedback.pose);
          if (poseRef.current !== feedback.pose) {
            poseRef.current = feedback.pose;
            setPose(feedback.pose);
          }
          if (!feedback.direction) return;
          onFlipRef.current(feedback.direction);
          setPulse({
            id: now,
            side: caretSide(feedback.direction, isVerticalTextRef.current),
            direction: feedback.direction,
          });
          window.clearTimeout(pulseTimer);
          pulseTimer = window.setTimeout(() => {
            if (!cancelled) setPulse(null);
          }, FLIP_FLASH_MS);
        } catch (error) {
          failures += 1;
          if (failures < 8) return;
          booksHandLog.warn("Hand detection failed", {
            message: error instanceof Error ? error.message : "unknown",
          });
          fail("detectorFailed");
        }
      };

      raf = requestAnimationFrame(loop);
    };

    let sawPageHide = false;
    const onPageHide = () => {
      sawPageHide = true;
      invalidate();
    };
    const onPageShow = () => {
      if (cancelled || !sawPageHide) return;
      sawPageHide = false;
      void start();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    void start();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.clearTimeout(pulseTimer);
      invalidate();
    };
  }, []);

  const caption =
    status.kind === "error"
      ? t(`apps.books.gestures.${status.messageKey}`)
      : status.kind === "starting"
        ? t("apps.books.gestures.starting")
        : showHint
          ? t("apps.books.gestures.hint")
          : null;

  const liveMessage =
    status.kind === "error"
      ? t(`apps.books.gestures.${status.messageKey}`)
      : status.kind === "starting"
        ? t("apps.books.gestures.starting")
        : pulse
          ? t(
              pulse.direction === "next"
                ? "apps.books.menu.nextPage"
                : "apps.books.menu.previousPage"
            )
          : "";

  const poseActive = pose === "pinch" || pose === "hold";

  return (
    <div className="pointer-events-none absolute bottom-14 left-3 z-30 w-[108px]">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-black/55 shadow-lg backdrop-blur-md",
          poseActive || pulse ? "border-white/80" : "border-white/25"
        )}
        role="img"
        aria-label={t("apps.books.gestures.preview")}
      >
        <div
          className="relative aspect-[4/3] w-full"
          style={{ transform: "scaleX(-1)" }}
        >
          <video
            ref={videoRef}
            className="h-full w-full object-cover opacity-70"
            muted
            playsInline
            autoPlay
            aria-hidden
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            aria-hidden
          />
        </div>
        <AnimatePresence>
          {pulse && (
            <motion.div
              key={pulse.id}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 text-white drop-shadow",
                pulse.side === "left" ? "left-1" : "right-1"
              )}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {pulse.side === "left" ? (
                <CaretLeft size={18} weight="bold" />
              ) : (
                <CaretRight size={18} weight="bold" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {caption && (
        <p className="mt-1 text-center font-os-ui text-[10px] leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
          {caption}
        </p>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </div>
    </div>
  );
}
