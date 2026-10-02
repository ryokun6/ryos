import { useState, useCallback, useRef, useEffect } from "react";
import { useMotionValue } from "motion/react";
import {
  WindowPosition,
  WindowSize,
  ResizeType,
  ResizeStart,
} from "../types/types";
import { appIds, AppId } from "@/config/appIds";
import { useAppStore } from "@/stores/useAppStore";
import { useSound, Sounds } from "./useSound";
import { getWindowConfig, getMobileWindowSize } from "@/config/appRegistry";
import { useWindowInsets } from "./useWindowInsets";
import { useEventListener } from "@/hooks/useEventListener";
import {
  clampWindowToContentBounds,
  getDesktopContentBounds,
  hasHorizontalContentInset,
  mobileFullWidthFrame,
  windowDragLimits,
  windowResizeMaxWidth,
  windowResizeMinLeft,
  windowSnapEdges,
  windowSnapGeometry,
  windowUsesExplicitWidth,
} from "@/utils/desktopContentBounds";

interface UseWindowManagerProps {
  appId: AppId;
  instanceId?: string;
}

export const useWindowManager = ({
  appId,
  instanceId,
}: UseWindowManagerProps) => {
  // Fetch the persisted window state from the global app store
  const instanceStateFromStore = useAppStore((state) =>
    instanceId ? state.instances[instanceId] : null
  );
  const config = getWindowConfig(appId);

  // Use shared window insets hook for theme-dependent constraints
  const { computeInsets, getSafeAreaBottomInset } = useWindowInsets();

  // Helper to compute default window state (mirrors previous logic)
  const computeDefaultWindowState = (): {
    position: WindowPosition;
    size: WindowSize;
  } => {
    const isMobile = window.innerWidth < 768;
    const mobileY = 28; // Fixed Y position for mobile to account for menu bar

    const appIndex = appIds.indexOf(appId);
    const offsetIndex = appIndex >= 0 ? appIndex : 0;

    return {
      position: {
        x: isMobile ? 0 : 16 + offsetIndex * 32,
        y: isMobile ? mobileY : 40 + offsetIndex * 20,
      },
      size: isMobile
        ? getMobileWindowSize(appId)
        : config.defaultSize,
    };
  };

  // Use instance state if available, otherwise fall back to app state
  const stateSource = instanceStateFromStore;

  const initialState = {
    position: stateSource?.position ?? computeDefaultWindowState().position,
    size: stateSource?.size ?? computeDefaultWindowState().size,
  };

  const adjustedPosition = { ...initialState.position };
  const viewportWidth = window.innerWidth;
  const contentBounds = getDesktopContentBounds();
  const fitted = clampWindowToContentBounds({
    x: adjustedPosition.x,
    width: initialState.size.width,
    viewportWidth,
    bounds: contentBounds,
    mobile: viewportWidth < 768,
  });
  adjustedPosition.x = fitted.x;
  const fittedSize =
    fitted.width === initialState.size.width
      ? initialState.size
      : { ...initialState.size, width: fitted.width };

  const [windowPosition, setWindowPosition] =
    useState<WindowPosition>(adjustedPosition);
  const [windowSize, setWindowSize] = useState<WindowSize>(fittedSize);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeType, setResizeType] = useState<ResizeType>("");
  const [resizeStart, setResizeStart] = useState<ResizeStart>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });
  
  // Snap to edge state. The ref mirrors the state so per-move detection can
  // bail without scheduling a render; state only changes on zone transitions.
  const [snapZone, setSnapZone] = useState<"left" | "right" | null>(null);
  const snapZoneRef = useRef<"left" | "right" | null>(null);
  // Store pre-snap size/position for potential restore
  const preSnapStateRef = useRef<{ position: WindowPosition; size: WindowSize } | null>(null);
  const latestWindowPositionRef = useRef(windowPosition);
  const latestWindowSizeRef = useRef(windowSize);

  const isMobile = window.innerWidth < 768;
  const explicitWidth = windowUsesExplicitWidth(viewportWidth, contentBounds);

  // Transient geometry written directly during drag / resize. WindowFrame
  // binds these motion values to the frame's style, so pointer moves update
  // the DOM without re-rendering the React subtree. The committed React state
  // (and the store) is only updated on pointer-up. Programmatic moves (snap,
  // maximize, store sync) flow through the `animate` prop, which animates
  // these same motion values.
  const windowLeftMotionValue = useMotionValue<number | string>(
    adjustedPosition.x
  );
  const windowTopMotionValue = useMotionValue<number | string>(
    Math.max(0, adjustedPosition.y)
  );
  const windowWidthMotionValue = useMotionValue<number | string>(
    explicitWidth ? fittedSize.width : "100%"
  );
  const windowHeightMotionValue = useMotionValue<number | string>(
    fittedSize.height
  );

  const applyLiveWindowPosition = useCallback(
    (nextPosition: WindowPosition) => {
      latestWindowPositionRef.current = nextPosition;
      windowLeftMotionValue.set(nextPosition.x);
      windowTopMotionValue.set(Math.max(0, nextPosition.y));
    },
    [windowLeftMotionValue, windowTopMotionValue]
  );

  const applyLiveWindowSize = useCallback(
    (nextSize: WindowSize) => {
      latestWindowSizeRef.current = nextSize;
      // Below the md breakpoint the frame is rendered at "100%" width unless
      // a horizontal content inset exists. Leave the motion value alone in
      // the fill case so it stays correct across viewport resizes.
      if (windowUsesExplicitWidth(window.innerWidth, getDesktopContentBounds())) {
        windowWidthMotionValue.set(nextSize.width);
      }
      windowHeightMotionValue.set(nextSize.height);
    },
    [windowWidthMotionValue, windowHeightMotionValue]
  );

  // Reclamp only when a status-bar inset exists (unfolding Duo). Desktop
  // resize behavior stays unchanged when both insets are 0.
  useEffect(() => {
    const reclamp = () => {
      const width = window.innerWidth;
      const bounds = getDesktopContentBounds();
      if (!hasHorizontalContentInset(bounds, width)) return;
      const pos = latestWindowPositionRef.current;
      const size = latestWindowSizeRef.current;
      const next = clampWindowToContentBounds({
        x: pos.x,
        width: size.width,
        viewportWidth: width,
        bounds,
        mobile: width < 768,
      });
      if (next.x !== pos.x) {
        const nextPos = { ...pos, x: next.x };
        latestWindowPositionRef.current = nextPos;
        setWindowPosition(nextPos);
        windowLeftMotionValue.set(nextPos.x);
      }
      if (next.width !== size.width) {
        const nextSize = { ...size, width: next.width };
        latestWindowSizeRef.current = nextSize;
        setWindowSize(nextSize);
        windowWidthMotionValue.set(nextSize.width);
      }
    };
    window.addEventListener("resize", reclamp);
    window.visualViewport?.addEventListener("resize", reclamp);
    const media = window.matchMedia("(hover: none) and (pointer: coarse)");
    media.addEventListener("change", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.visualViewport?.removeEventListener("resize", reclamp);
      media.removeEventListener("change", reclamp);
    };
  }, [windowLeftMotionValue, windowWidthMotionValue]);

  const updateSnapZone = useCallback((zone: "left" | "right" | null) => {
    if (snapZoneRef.current === zone) return;
    snapZoneRef.current = zone;
    setSnapZone(zone);
  }, []);

  // Sync local state with store when store changes (for programmatic updates).
  // Use refs for comparison to avoid re-running on every local state change during drag.
  useEffect(() => {
    const storeSize = instanceStateFromStore?.size;
    if (
      storeSize &&
      !isDragging &&
      !resizeType &&
      (storeSize.width !== latestWindowSizeRef.current.width ||
        storeSize.height !== latestWindowSizeRef.current.height)
    ) {
      setWindowSize(storeSize);
      latestWindowSizeRef.current = storeSize;
    }
  }, [instanceStateFromStore?.size, isDragging, resizeType]);

  useEffect(() => {
    latestWindowSizeRef.current = windowSize;
  }, [windowSize]);

  useEffect(() => {
    const storePosition = instanceStateFromStore?.position;
    if (
      storePosition &&
      !isDragging &&
      !resizeType &&
      (storePosition.x !== latestWindowPositionRef.current.x ||
        storePosition.y !== latestWindowPositionRef.current.y)
    ) {
      setWindowPosition(storePosition);
      latestWindowPositionRef.current = storePosition;
    }
  }, [instanceStateFromStore?.position, isDragging, resizeType]);

  useEffect(() => {
    latestWindowPositionRef.current = windowPosition;
  }, [windowPosition]);

  const { play: playMoveSound, stop: stopMoveMoving } = useSound(Sounds.WINDOW_MOVE_MOVING);
  const { play: playMoveStop } = useSound(Sounds.WINDOW_MOVE_STOP);
  const { play: playResizeSound, stop: stopResizeResizing } = useSound(Sounds.WINDOW_RESIZE_RESIZING);
  const { play: playResizeStop } = useSound(Sounds.WINDOW_RESIZE_STOP);

  // Track if sound is currently playing
  const isMovePlayingRef = useRef(false);
  const isResizePlayingRef = useRef(false);

  const updateInstanceWindowState = useAppStore(
    (state) => state.updateInstanceWindowState
  );

  const maximizeWindowHeight = useCallback(
    (maxHeightConstraint?: number | string) => {
      const { topInset, bottomInset } = computeInsets();
      const maxPossibleHeight = window.innerHeight - topInset - bottomInset;
      const maxHeight = maxHeightConstraint
        ? typeof maxHeightConstraint === "string"
          ? parseInt(maxHeightConstraint)
          : maxHeightConstraint
        : maxPossibleHeight;
      const newHeight = Math.min(maxPossibleHeight, maxHeight);
      const nextSize = {
        width: windowSize.width,
        height: newHeight,
      };
      const nextPosition = {
        x: windowPosition.x,
        y: topInset,
      };

      latestWindowSizeRef.current = nextSize;
      latestWindowPositionRef.current = nextPosition;
      setWindowSize(nextSize);
      setWindowPosition(nextPosition);
      if (instanceId) {
        updateInstanceWindowState(instanceId, nextPosition, nextSize);
      }
    },
    [
      computeInsets,
      updateInstanceWindowState,
      instanceId,
      windowPosition,
      windowSize,
    ]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      setDragOffset({
        x: clientX - rect.left,
        y: clientY - rect.top,
      });
      setIsDragging(true);
    },
    []
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, type: ResizeType) => {
      e.stopPropagation();
      e.preventDefault();

      // Find the actual window container element (two levels up from the resize handle)
      const windowElement = e.currentTarget.parentElement?.parentElement
        ?.parentElement as HTMLElement;
      const rect = windowElement.getBoundingClientRect();

      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      setResizeStart({
        x: clientX,
        y: clientY,
        width: rect.width,
        height: rect.height,
        left: windowPosition.x,
        top: windowPosition.y,
      });
      setResizeType(type);
    },
    [windowPosition]
  );

  const handleMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (isDragging) {
        const clientX =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY =
          "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const newX = clientX - dragOffset.x;
        const newY = clientY - dragOffset.y;

        const { topInset: menuBarHeight } = computeInsets();

        // Play move sound once when movement begins
        if (!isMobile && !isMovePlayingRef.current) {
          playMoveSound();
          isMovePlayingRef.current = true;
        }

        if (isMobile) {
          // On mobile, only allow vertical dragging and keep window full width
          // of the content rect (the viewport, unless a status bar is inset).
          const frame = mobileFullWidthFrame(
            window.innerWidth,
            getDesktopContentBounds(),
          );
          applyLiveWindowPosition({
            x: frame.x,
            y: Math.max(menuBarHeight, newY),
          });
          updateSnapZone(null);
        } else {
          // Allow dragging past edges, but keep at least 80px of window visible
          const bounds = getDesktopContentBounds();
          const { minX, maxX } = windowDragLimits({
            windowWidth: windowSize.width,
            viewportWidth: window.innerWidth,
            bounds,
          });
          const maxY = window.innerHeight - 80; // Can drag down, keeping 80px visible at top
          const x = Math.min(Math.max(minX, newX), maxX);
          const y = Math.min(Math.max(menuBarHeight, newY), Math.max(0, maxY));
          applyLiveWindowPosition({ x, y });

          // Detect snap zones - trigger when cursor is within 20px of the content edge
          const SNAP_THRESHOLD = 20;
          const edges = windowSnapEdges(window.innerWidth, bounds);
          if (clientX <= edges.left + SNAP_THRESHOLD) {
            updateSnapZone("left");
          } else if (clientX >= edges.right - SNAP_THRESHOLD) {
            updateSnapZone("right");
          } else {
            updateSnapZone(null);
          }
        }
      }

      if (resizeType) {
        e.preventDefault();
        const clientX =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY =
          "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const deltaX = clientX - resizeStart.x;
        const deltaY = clientY - resizeStart.y;

        const minWidth = config.minSize?.width || 260;
        const minHeight = config.minSize?.height || 200;
        const resizeBounds = getDesktopContentBounds();
        const maxWidth = windowResizeMaxWidth(window.innerWidth, resizeBounds);
        const minLeft = windowResizeMinLeft(resizeBounds);
        const { bottomInset, topInset: menuBarHeight } = computeInsets();
        const maxHeight = window.innerHeight - bottomInset;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newLeft = resizeStart.left;
        let newTop = resizeStart.top;

        if (!isMobile) {
          if (resizeType.includes("e")) {
            const maxPossibleWidth = maxWidth - resizeStart.left;
            newWidth = Math.min(
              Math.max(resizeStart.width + deltaX, minWidth),
              maxPossibleWidth
            );
          } else if (resizeType.includes("w")) {
            const maxPossibleWidth = resizeStart.width + resizeStart.left;
            const potentialWidth = Math.min(
              Math.max(resizeStart.width - deltaX, minWidth),
              maxPossibleWidth
            );
            if (potentialWidth !== resizeStart.width) {
              newLeft = Math.max(
                minLeft,
                resizeStart.left + (resizeStart.width - potentialWidth)
              );
              newWidth = potentialWidth;
            }
          }
        }

        if (resizeType.includes("s")) {
          const maxPossibleHeight = maxHeight - resizeStart.top;
          newHeight = Math.min(
            Math.max(resizeStart.height + deltaY, minHeight),
            maxPossibleHeight
          );
        } else if (resizeType.includes("n")) {
          const maxPossibleHeight =
            resizeStart.height + (resizeStart.top - menuBarHeight);
          const potentialHeight = Math.min(
            Math.max(resizeStart.height - deltaY, minHeight),
            maxPossibleHeight
          );
          if (potentialHeight !== resizeStart.height) {
            newTop = Math.max(
              menuBarHeight,
              Math.min(
                resizeStart.top + (resizeStart.height - potentialHeight),
                maxHeight - minHeight
              )
            );
            newHeight = potentialHeight;
          }
        }

        if (isMobile) {
          // Keep window full width of the content rect on mobile
          const frame = mobileFullWidthFrame(window.innerWidth, resizeBounds);
          newWidth = frame.width;
          newLeft = frame.x;
        }

        applyLiveWindowSize({ width: newWidth, height: newHeight });
        applyLiveWindowPosition({
          x: newLeft,
          y: Math.max(menuBarHeight, newTop),
        });

        // Play resize sound once when movement begins
        if (
          !isResizePlayingRef.current &&
          (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)
        ) {
          playResizeSound();
          isResizePlayingRef.current = true;
        }
      }
    },
    [
      isDragging,
      dragOffset,
      resizeType,
      resizeStart,
      windowSize,
      isMobile,
      playMoveSound,
      playResizeSound,
      config,
      computeInsets,
      applyLiveWindowPosition,
      applyLiveWindowSize,
      updateSnapZone,
    ]
  );

  const handleEnd = useCallback(() => {
    // Commit the transient (motion-value-driven) geometry to React state and
    // the store in a single update now that the interaction ended.
    const currentPosition = latestWindowPositionRef.current;
    const currentSize = latestWindowSizeRef.current;

    if (isDragging) {
      setIsDragging(false);

      // Handle snap to edge
      if (snapZoneRef.current && !isMobile) {
        const { topInset, bottomInset } = computeInsets();
        const snapHeight = window.innerHeight - topInset - bottomInset;
        const snap = windowSnapGeometry({
          viewportWidth: window.innerWidth,
          bounds: getDesktopContentBounds(),
          zone: snapZoneRef.current,
        });

        // Save current state before snapping (for potential restore later)
        preSnapStateRef.current = {
          position: { ...currentPosition },
          size: { ...currentSize },
        };

        const newSize = { width: snap.width, height: snapHeight };
        const newPosition = {
          x: snap.x,
          y: topInset,
        };

        latestWindowSizeRef.current = newSize;
        latestWindowPositionRef.current = newPosition;
        setWindowSize(newSize);
        setWindowPosition(newPosition);

        if (instanceId) {
          updateInstanceWindowState(instanceId, newPosition, newSize);
        }

        updateSnapZone(null);
      } else {
        setWindowPosition(currentPosition);
        if (instanceId) {
          updateInstanceWindowState(instanceId, currentPosition, currentSize);
        }
      }

      // Stop move sound and play stop sound
      if (isMovePlayingRef.current) {
        stopMoveMoving();
        isMovePlayingRef.current = false;
        playMoveStop();
      }
    }
    if (resizeType) {
      setResizeType("");
      setWindowPosition(currentPosition);
      setWindowSize(currentSize);
      if (instanceId) {
        updateInstanceWindowState(instanceId, currentPosition, currentSize);
      }
      // Stop resize sound and play stop sound
      if (isResizePlayingRef.current) {
        stopResizeResizing();
        isResizePlayingRef.current = false;
        playResizeStop();
      }
    }
  }, [
    isDragging,
    isMobile,
    computeInsets,
    instanceId,
    updateInstanceWindowState,
    updateSnapZone,
    stopMoveMoving,
    playMoveStop,
    resizeType,
    stopResizeResizing,
    playResizeStop,
  ]);

  const shouldListen = isDragging || resizeType;
  const eventTarget = shouldListen ? document : null;

  const handleMouseMove = useCallback(
    (event: MouseEvent) => handleMove(event),
    [handleMove]
  );
  const handleTouchMove = useCallback(
    (event: TouchEvent) => handleMove(event),
    [handleMove]
  );
  const handleMouseUp = useCallback(() => handleEnd(), [handleEnd]);
  const handleTouchEnd = useCallback(() => handleEnd(), [handleEnd]);

  useEventListener("mousemove", handleMouseMove, eventTarget);
  useEventListener("mouseup", handleMouseUp, eventTarget);
  useEventListener("touchmove", handleTouchMove, eventTarget);
  useEventListener("touchend", handleTouchEnd, eventTarget);

  return {
    windowPosition,
    windowSize,
    windowLeftMotionValue,
    windowTopMotionValue,
    windowWidthMotionValue,
    windowHeightMotionValue,
    isDragging,
    resizeType,
    handleMouseDown,
    handleResizeStart,
    setWindowSize,
    setWindowPosition,
    maximizeWindowHeight,
    getSafeAreaBottomInset,
    snapZone,
    computeInsets,
  };
};
