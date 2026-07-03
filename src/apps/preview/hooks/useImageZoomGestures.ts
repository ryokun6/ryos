import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

export const PREVIEW_ZOOM_MIN = 10;
export const PREVIEW_ZOOM_MAX = 800;

const ZOOM_STEP_FACTOR = 1.25;
const WHEEL_ZOOM_INTENSITY = 0.01;
const ZOOM_ANIMATION_MS = 250;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST_PX = 30;
const TAP_MOVE_SLOP_PX = 12;
const TAP_MAX_DURATION_MS = 350;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function clampPreviewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 100;
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, zoom));
}

export function getNextZoomInLevel(zoom: number): number {
  return clampPreviewZoom(Math.round(zoom * ZOOM_STEP_FACTOR));
}

export function getNextZoomOutLevel(zoom: number): number {
  return clampPreviewZoom(Math.round(zoom / ZOOM_STEP_FACTOR));
}

/** Point kept stable while zooming: a viewport position + the image fraction under it. */
type ZoomAnchor = {
  clientX: number;
  clientY: number;
  fx: number;
  fy: number;
};

/** Safari-only (desktop trackpad + iOS) proprietary pinch event. */
type SafariGestureEvent = Event & {
  scale: number;
  clientX: number;
  clientY: number;
};

interface UseImageZoomGesturesOptions {
  enabled: boolean;
  zoom: number;
  fitToWindow: boolean;
  onZoomChange: (zoom: number) => void;
  onFitToWindowChange: (fit: boolean) => void;
}

export interface ImageZoomControls {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToActualSize: () => void;
  setFitMode: (fit: boolean) => void;
}

/**
 * Touch pinch, double-tap, Ctrl/Cmd+wheel (trackpad pinch), Safari gesture
 * events, and mouse drag-to-pan for the Preview image viewer.
 *
 * All zooming is anchored: the image point under the fingers/cursor stays put
 * by correcting the container's scroll offsets after the zoom re-renders.
 * Pinch handlers call `preventDefault()` on cancelable touch/gesture/wheel
 * events so the browser never zooms the page itself.
 */
export function useImageZoomGestures(
  containerRef: RefObject<HTMLDivElement | null>,
  imageRef: RefObject<HTMLImageElement | null>,
  options: UseImageZoomGesturesOptions,
): ImageZoomControls {
  const { enabled, zoom, fitToWindow, onZoomChange, onFitToWindowChange } =
    options;

  const zoomRef = useRef(zoom);
  const fitRef = useRef(fitToWindow);
  const onZoomChangeRef = useRef(onZoomChange);
  const onFitChangeRef = useRef(onFitToWindowChange);
  const pendingAnchorRef = useRef<ZoomAnchor | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  zoomRef.current = zoom;
  fitRef.current = fitToWindow;
  onZoomChangeRef.current = onZoomChange;
  onFitChangeRef.current = onFitToWindowChange;

  const adjustScrollToAnchor = useCallback(
    (anchor: ZoomAnchor) => {
      const container = containerRef.current;
      const image = imageRef.current;
      if (!container || !image) return;
      const rect = image.getBoundingClientRect();
      container.scrollLeft += rect.left + anchor.fx * rect.width - anchor.clientX;
      container.scrollTop += rect.top + anchor.fy * rect.height - anchor.clientY;
    },
    [containerRef, imageRef],
  );

  const makeAnchor = useCallback(
    (clientX: number, clientY: number): ZoomAnchor | null => {
      const image = imageRef.current;
      if (!image) return null;
      const rect = image.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        clientX,
        clientY,
        fx: (clientX - rect.left) / rect.width,
        fy: (clientY - rect.top) / rect.height,
      };
    },
    [imageRef],
  );

  /** Rendered zoom %, derived from the DOM while in fit-to-window mode. */
  const getEffectiveZoom = useCallback(() => {
    if (!fitRef.current) return zoomRef.current;
    const image = imageRef.current;
    if (!image) return zoomRef.current;
    const rect = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || rect.width;
    if (naturalWidth <= 0 || rect.width <= 0) return zoomRef.current;
    return (rect.width / naturalWidth) * 100;
  }, [imageRef]);

  const applyAnchoredZoom = useCallback(
    (nextZoom: number, anchor: ZoomAnchor | null, clampToLimits = true) => {
      // Transient animation frames toward fit may pass below the user-facing
      // minimum (huge images fit below PREVIEW_ZOOM_MIN), so skip clamping.
      const next = clampToLimits
        ? clampPreviewZoom(nextZoom)
        : Math.max(1, nextZoom);
      const zoomChanged =
        fitRef.current || Math.abs(next - zoomRef.current) > 0.001;
      if (!zoomChanged) {
        // Zoom is clamped at a limit; still honor the anchor so a moving
        // pinch midpoint keeps panning the image.
        if (anchor) adjustScrollToAnchor(anchor);
        return;
      }
      pendingAnchorRef.current = anchor;
      zoomRef.current = next;
      if (fitRef.current) {
        fitRef.current = false;
        onFitChangeRef.current(false);
      }
      onZoomChangeRef.current(next);
    },
    [adjustScrollToAnchor],
  );

  const cancelZoomAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /** Eased zoom toward `targetZoom`, keeping `anchor` pinned every frame. */
  const animateAnchoredZoom = useCallback(
    (
      targetZoom: number,
      anchor: ZoomAnchor | null,
      options?: { clamp?: boolean; onComplete?: () => void },
    ) => {
      cancelZoomAnimation();
      const clampToLimits = options?.clamp !== false;
      const target = clampToLimits
        ? clampPreviewZoom(targetZoom)
        : Math.max(1, targetZoom);
      const start = getEffectiveZoom();
      if (prefersReducedMotion() || Math.abs(target - start) < 0.5) {
        applyAnchoredZoom(target, anchor, clampToLimits);
        options?.onComplete?.();
        return;
      }
      const startTime = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / ZOOM_ANIMATION_MS);
        const next = start + (target - start) * easeOutCubic(t);
        applyAnchoredZoom(next, anchor, clampToLimits);
        if (t < 1) {
          animationFrameRef.current = requestAnimationFrame(step);
        } else {
          animationFrameRef.current = null;
          options?.onComplete?.();
        }
      };
      animationFrameRef.current = requestAnimationFrame(step);
    },
    [applyAnchoredZoom, cancelZoomAnimation, getEffectiveZoom],
  );

  const getCenterAnchor = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return makeAnchor(
      rect.left + container.clientWidth / 2,
      rect.top + container.clientHeight / 2,
    );
  }, [containerRef, makeAnchor]);

  /** Zoom % the image will render at once fit-to-window mode is re-enabled. */
  const getFitZoom = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return 100;
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (naturalWidth <= 0 || naturalHeight <= 0) return 100;
    let padX = 0;
    let padY = 0;
    const wrapper = image.parentElement;
    if (wrapper) {
      const style = window.getComputedStyle(wrapper);
      padX =
        (parseFloat(style.paddingLeft) || 0) +
        (parseFloat(style.paddingRight) || 0);
      padY =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0);
    }
    const availWidth = Math.max(1, container.clientWidth - padX);
    const availHeight = Math.max(1, container.clientHeight - padY);
    const ratio = Math.min(
      availWidth / naturalWidth,
      availHeight / naturalHeight,
      1,
    );
    return ratio * 100;
  }, [containerRef, imageRef]);

  const resetToFit = useCallback(() => {
    pendingAnchorRef.current = null;
    fitRef.current = true;
    zoomRef.current = 100;
    onFitChangeRef.current(true);
    onZoomChangeRef.current(100);
  }, []);

  /** Animate down/up to the fitted size, then hand back to fit-to-window mode. */
  const animateToFit = useCallback(() => {
    if (fitRef.current) return;
    animateAnchoredZoom(getFitZoom(), getCenterAnchor(), {
      clamp: false,
      onComplete: resetToFit,
    });
  }, [animateAnchoredZoom, getCenterAnchor, getFitZoom, resetToFit]);

  const toggleZoomAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (fitRef.current) {
        const target = Math.max(100, getEffectiveZoom() * 2);
        animateAnchoredZoom(target, makeAnchor(clientX, clientY));
      } else {
        animateToFit();
      }
    },
    [animateAnchoredZoom, animateToFit, getEffectiveZoom, makeAnchor],
  );

  // Apply the pending anchor right after the zoomed image size hits the DOM.
  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;
    pendingAnchorRef.current = null;
    adjustScrollToAnchor(anchor);
  }, [zoom, fitToWindow, adjustScrollToAnchor]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    let pinch: {
      startDistance: number;
      startZoom: number;
      fx: number;
      fy: number;
    } | null = null;
    let touchPinchActive = false;
    let tapCandidate: {
      time: number;
      x: number;
      y: number;
      moved: boolean;
    } | null = null;
    let lastTap: { time: number; x: number; y: number } | null = null;
    let gestureStart: { zoom: number; fx: number; fy: number } | null = null;

    const updatePanCursor = () => {
      const scrollable =
        container.scrollWidth > container.clientWidth ||
        container.scrollHeight > container.clientHeight;
      container.style.cursor = scrollable ? "grab" : "";
    };

    const midpoint = (a: Touch, b: Touch) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      // Fingers take over from any running zoom animation.
      cancelZoomAnimation();
      if (e.touches.length === 2) {
        tapCandidate = null;
        touchPinchActive = true;
        const a = e.touches[0];
        const b = e.touches[1];
        const mid = midpoint(a, b);
        const anchor = makeAnchor(mid.x, mid.y);
        if (!anchor) return;
        pinch = {
          startDistance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          startZoom: getEffectiveZoom(),
          fx: anchor.fx,
          fy: anchor.fy,
        };
      } else if (e.touches.length === 1) {
        pinch = null;
        const t = e.touches[0];
        tapCandidate = {
          time: Date.now(),
          x: t.clientX,
          y: t.clientY,
          moved: false,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pinch && e.touches.length >= 2) {
        // Zoom the image ourselves and stop the browser from zooming the page.
        if (e.cancelable) e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const distance = Math.hypot(
          a.clientX - b.clientX,
          a.clientY - b.clientY,
        );
        if (pinch.startDistance <= 0) return;
        const mid = midpoint(a, b);
        applyAnchoredZoom((pinch.startZoom * distance) / pinch.startDistance, {
          clientX: mid.x,
          clientY: mid.y,
          fx: pinch.fx,
          fy: pinch.fy,
        });
        return;
      }
      if (tapCandidate && e.touches.length === 1) {
        const t = e.touches[0];
        if (
          Math.hypot(t.clientX - tapCandidate.x, t.clientY - tapCandidate.y) >
          TAP_MOVE_SLOP_PX
        ) {
          tapCandidate.moved = true;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0) touchPinchActive = false;

      if (
        tapCandidate &&
        !tapCandidate.moved &&
        e.touches.length === 0 &&
        e.changedTouches.length === 1 &&
        Date.now() - tapCandidate.time <= TAP_MAX_DURATION_MS
      ) {
        const t = e.changedTouches[0];
        const now = Date.now();
        if (
          lastTap &&
          now - lastTap.time <= DOUBLE_TAP_MS &&
          Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) <=
            DOUBLE_TAP_DIST_PX
        ) {
          // Double tap: toggle zoom and suppress the browser's own
          // double-tap-to-zoom plus the synthetic click/dblclick.
          if (e.cancelable) e.preventDefault();
          lastTap = null;
          toggleZoomAtPoint(t.clientX, t.clientY);
        } else {
          lastTap = { time: now, x: t.clientX, y: t.clientY };
        }
      }
      if (e.touches.length === 0) tapCandidate = null;
    };

    const onTouchCancel = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0) {
        touchPinchActive = false;
        tapCandidate = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      // Trackpad pinches arrive as ctrlKey wheel events in Chrome/Firefox.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      cancelZoomAnimation();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_INTENSITY);
      applyAnchoredZoom(
        getEffectiveZoom() * factor,
        makeAnchor(e.clientX, e.clientY),
      );
    };

    const onDoubleClick = (e: MouseEvent) => {
      toggleZoomAtPoint(e.clientX, e.clientY);
    };

    const onGestureStart = (e: Event) => {
      // Always block Safari's page zoom; skip zooming when the touch pinch
      // path is already handling this gesture (iOS fires both).
      e.preventDefault();
      if (touchPinchActive) return;
      cancelZoomAnimation();
      const ge = e as SafariGestureEvent;
      const anchor = makeAnchor(ge.clientX, ge.clientY);
      gestureStart = anchor
        ? { zoom: getEffectiveZoom(), fx: anchor.fx, fy: anchor.fy }
        : null;
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (touchPinchActive || !gestureStart) return;
      const ge = e as SafariGestureEvent;
      applyAnchoredZoom(gestureStart.zoom * ge.scale, {
        clientX: ge.clientX,
        clientY: ge.clientY,
        fx: gestureStart.fx,
        fy: gestureStart.fy,
      });
    };

    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureStart = null;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const scrollable =
        container.scrollWidth > container.clientWidth ||
        container.scrollHeight > container.clientHeight;
      if (!scrollable) return;
      const rect = container.getBoundingClientRect();
      // Ignore presses on the scrollbars themselves.
      if (
        e.clientX - rect.left > container.clientWidth ||
        e.clientY - rect.top > container.clientHeight
      ) {
        return;
      }
      e.preventDefault();
      cancelZoomAnimation();
      const start = {
        x: e.clientX,
        y: e.clientY,
        left: container.scrollLeft,
        top: container.scrollTop,
      };
      container.style.cursor = "grabbing";
      const onMove = (moveEvent: MouseEvent) => {
        container.scrollLeft = start.left - (moveEvent.clientX - start.x);
        container.scrollTop = start.top - (moveEvent.clientY - start.y);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        updatePanCursor();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    updatePanCursor();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updatePanCursor)
        : null;
    resizeObserver?.observe(container);
    const image = imageRef.current;
    if (image) resizeObserver?.observe(image);

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: false });
    container.addEventListener("touchcancel", onTouchCancel);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("dblclick", onDoubleClick);
    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("gesturestart", onGestureStart);
    container.addEventListener("gesturechange", onGestureChange);
    container.addEventListener("gestureend", onGestureEnd);

    return () => {
      cancelZoomAnimation();
      resizeObserver?.disconnect();
      container.style.cursor = "";
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchCancel);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("dblclick", onDoubleClick);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("gesturestart", onGestureStart);
      container.removeEventListener("gesturechange", onGestureChange);
      container.removeEventListener("gestureend", onGestureEnd);
    };
  }, [
    enabled,
    containerRef,
    imageRef,
    applyAnchoredZoom,
    cancelZoomAnimation,
    getEffectiveZoom,
    makeAnchor,
    toggleZoomAtPoint,
  ]);

  const zoomIn = useCallback(() => {
    animateAnchoredZoom(
      getNextZoomInLevel(getEffectiveZoom()),
      getCenterAnchor(),
    );
  }, [animateAnchoredZoom, getCenterAnchor, getEffectiveZoom]);

  const zoomOut = useCallback(() => {
    animateAnchoredZoom(
      getNextZoomOutLevel(getEffectiveZoom()),
      getCenterAnchor(),
    );
  }, [animateAnchoredZoom, getCenterAnchor, getEffectiveZoom]);

  const zoomToActualSize = useCallback(() => {
    animateAnchoredZoom(100, getCenterAnchor());
  }, [animateAnchoredZoom, getCenterAnchor]);

  /**
   * Fit-to-window toggle: enabling animates down/up to the fitted size before
   * switching modes; disabling keeps the current rendered size (no jump).
   */
  const setFitMode = useCallback(
    (fit: boolean) => {
      if (fit) {
        animateToFit();
        return;
      }
      if (!fitRef.current) return;
      cancelZoomAnimation();
      const effective = clampPreviewZoom(getEffectiveZoom());
      fitRef.current = false;
      zoomRef.current = effective;
      onFitChangeRef.current(false);
      onZoomChangeRef.current(effective);
    },
    [animateToFit, cancelZoomAnimation, getEffectiveZoom],
  );

  return { zoomIn, zoomOut, zoomToActualSize, setFitMode };
}
