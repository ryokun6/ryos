import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ROTATION_STEP_DEG } from "../constants";
import type { WheelArea, WheelRotationSample } from "../types";
import {
  ACCEL_GAP_RESET_MS,
  applyReversalHysteresis,
  HOLD_SEEK_REPEAT_MS,
  initialReversalState,
  segmentPassesNearHub,
  smoothWheelSpeed,
  type ReversalState,
} from "../utils/wheelGesture";

interface IpodWheelProps {
  theme: string;
  onWheelClick: (area: WheelArea) => void;
  onWheelRotation: (sample: WheelRotationSample) => void;
  onWheelGestureEnd?: () => void;
  /** Prev/next sector hold. `start` fires after the long-press delay, then `repeat`. */
  onSectorHold?: (area: "left" | "right", phase: "start" | "repeat" | "end") => void;
  onMenuButton: () => void;
  onCenterLongPress?: () => void;
}

// Long press delay in milliseconds
const LONG_PRESS_DELAY = 500;

// How many degrees of wheel rotation should equal one scroll step
const rotationStepDeg = ROTATION_STEP_DEG;

// Minimum movement to be considered a drag (not a tap)
// This is intentionally smaller than rotationStepDeg to catch scrolling intent early
const dragDetectionDeg = 5; // degrees of rotation to detect drag intent
const dragDetectionDistance = 8; // pixels of movement to detect drag intent

export function IpodWheel({
  theme,
  onWheelClick,
  onWheelRotation,
  onWheelGestureEnd,
  onSectorHold,
  onMenuButton,
  onCenterLongPress,
}: IpodWheelProps) {
  const { t } = useTranslation();
  const wheelRef = useRef<HTMLDivElement>(null);
  // Accumulated desktop wheel delta. Keep this out of React state so partial
  // scroll gestures do not re-render the whole click wheel.
  const wheelDeltaRef = useRef(0);

  // Refs for tracking continuous touch rotation
  const lastAngleRef = useRef<number | null>(null); // Last touch angle in radians
  const rotationAccumulatorRef = useRef(0); // Accumulated rotation in radians
  const gestureTravelDegRef = useRef(0);
  const reversalRef = useRef<ReversalState>(initialReversalState());
  const speedRef = useRef<number | null>(null);
  const lastMoveAtRef = useRef<number | null>(null);
  const lastOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Track whether the user is currently dragging (mouse down + move)
  const isDraggingRef = useRef(false);

  // Refs for tracking touch state
  const isTouchDraggingRef = useRef(false); // Whether significant touch rotation occurred
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null); // Starting touch position
  const recentTouchRef = useRef(false); // Track if we just handled a touch event to prevent double firing

  // Track if the current interaction started on the "MENU" label so we can suppress duplicate click handling
  const fromMenuLabelRef = useRef(false);

  // Track if we're currently in a touch drag to prevent button clicks
  const isInTouchDragRef = useRef(false);
  
  // Track if we're currently in a mouse drag to prevent button clicks
  const isInMouseDragRef = useRef(false);

  // Long press handling for center button
  const centerLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const centerLongPressFiredRef = useRef(false);
  const centerTouchActiveRef = useRef(false);
  const centerTouchHandledRef = useRef(false);

  const sectorHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectorHoldIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectorHoldAreaRef = useRef<"left" | "right" | null>(null);
  const sectorHoldFiredRef = useRef(false);
  const onSectorHoldRef = useRef(onSectorHold);
  const onWheelGestureEndRef = useRef(onWheelGestureEnd);
  onSectorHoldRef.current = onSectorHold;
  onWheelGestureEndRef.current = onWheelGestureEnd;

  const clearCenterLongPress = () => {
    if (centerLongPressTimerRef.current) {
      clearTimeout(centerLongPressTimerRef.current);
      centerLongPressTimerRef.current = null;
    }
  };

  const startCenterLongPress = (isTouch: boolean) => {
    clearCenterLongPress();
    centerLongPressFiredRef.current = false;
    if (isTouch) {
      centerTouchActiveRef.current = true;
      centerTouchHandledRef.current = false;
    }
    if (onCenterLongPress) {
      centerLongPressTimerRef.current = setTimeout(() => {
        centerLongPressFiredRef.current = true;
        centerTouchHandledRef.current = true;
        onCenterLongPress();
      }, LONG_PRESS_DELAY);
    }
  };

  const endCenterLongPress = (isTouch: boolean, triggerClick: boolean = false) => {
    clearCenterLongPress();
    
    // For touch events, handle the tap here instead of relying on onClick
    if (isTouch && triggerClick && !centerLongPressFiredRef.current && !centerTouchHandledRef.current) {
      centerTouchHandledRef.current = true;
      onWheelClick("center");
    }
    
    if (isTouch) {
      // Reset touch state after a delay to block any synthetic click
      setTimeout(() => {
        centerTouchActiveRef.current = false;
        centerTouchHandledRef.current = false;
      }, 400);
    }
  };

  const finishSectorHold = (emitEnd: boolean): boolean => {
    if (sectorHoldTimerRef.current) {
      clearTimeout(sectorHoldTimerRef.current);
      sectorHoldTimerRef.current = null;
    }
    if (sectorHoldIntervalRef.current) {
      clearInterval(sectorHoldIntervalRef.current);
      sectorHoldIntervalRef.current = null;
    }
    const fired = sectorHoldFiredRef.current;
    const area = sectorHoldAreaRef.current;
    sectorHoldFiredRef.current = false;
    sectorHoldAreaRef.current = null;
    if (emitEnd && fired && area) onSectorHoldRef.current?.(area, "end");
    return fired;
  };

  const armSectorHold = (area: WheelArea) => {
    if ((area !== "left" && area !== "right") || !onSectorHoldRef.current) return;
    finishSectorHold(false);
    sectorHoldAreaRef.current = area;
    sectorHoldFiredRef.current = false;
    sectorHoldTimerRef.current = setTimeout(() => {
      sectorHoldTimerRef.current = null;
      const held = sectorHoldAreaRef.current;
      if (!held) return;
      sectorHoldFiredRef.current = true;
      onSectorHoldRef.current?.(held, "start");
      sectorHoldIntervalRef.current = setInterval(() => {
        const repeating = sectorHoldAreaRef.current;
        if (repeating) onSectorHoldRef.current?.(repeating, "repeat");
      }, HOLD_SEEK_REPEAT_MS);
    }, LONG_PRESS_DELAY);
  };

  const cancelSectorHoldBecauseDrag = () => {
    if (sectorHoldAreaRef.current) finishSectorHold(sectorHoldFiredRef.current);
  };

  useEffect(() => {
    return () => {
      finishSectorHold(false);
    };
  }, []);

  const getWheelCenter = (): { x: number; y: number } | null => {
    if (!wheelRef.current) return null;
    const rect = wheelRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const wheelRadius = (): number => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return 90;
    return Math.max(rect.width, rect.height) / 2;
  };

  const offsetFromCenter = (x: number, y: number): { x: number; y: number } | null => {
    const center = getWheelCenter();
    if (!center) return null;
    return { x: x - center.x, y: y - center.y };
  };

  const resetGestureFilters = () => {
    reversalRef.current = initialReversalState();
    speedRef.current = null;
    lastMoveAtRef.current = null;
    lastOffsetRef.current = null;
    gestureTravelDegRef.current = 0;
    rotationAccumulatorRef.current = 0;
    lastAngleRef.current = null;
  };

  const endWheelGesture = () => {
    resetGestureFilters();
    onWheelGestureEndRef.current?.();
  };

  // Calculate angle (in degrees) from the center of the wheel – used for click areas
  const getAngleFromCenterDeg = (x: number, y: number): number => {
    const center = getWheelCenter();
    if (!center) return 0;
    return (Math.atan2(y - center.y, x - center.x) * 180) / Math.PI;
  };

  // Same as above but returns radians – used for rotation calculation
  const getAngleFromCenterRad = (x: number, y: number): number => {
    const center = getWheelCenter();
    if (!center) return 0;
    return Math.atan2(y - center.y, x - center.x);
  };

  // Determine wheel section from angle
  const getWheelSection = (angleDeg: number): WheelArea => {
    const angle = (angleDeg * Math.PI) / 180; // Convert degrees to radians
    if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
      return "right";
    } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
      return "bottom";
    } else if (angle >= (3 * Math.PI) / 4 || angle < (-3 * Math.PI) / 4) {
      return "left";
    } else {
      // Default to top, but this section is primarily for the menu button
      return "top";
    }
  };

  // Check if touch point is in center button area
  const isTouchInCenter = (x: number, y: number): boolean => {
    const center = getWheelCenter();
    if (!center) return false;
    const distance = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
    // Center button is w-16 h-16 (64px), so radius is 32px
    return distance <= 32;
  };

  const beginRingGesture = (x: number, y: number) => {
    const angleRad = getAngleFromCenterRad(x, y);
    lastAngleRef.current = angleRad;
    rotationAccumulatorRef.current = 0;
    gestureTravelDegRef.current = 0;
    reversalRef.current = initialReversalState();
    speedRef.current = null;
    lastMoveAtRef.current = performance.now();
    lastOffsetRef.current = offsetFromCenter(x, y);
    armSectorHold(getWheelSection(getAngleFromCenterDeg(x, y)));
  };

  const noteDrag = (distance: number, draggingRef: { current: boolean }, guardRef: { current: boolean }) => {
    if (draggingRef.current) return;
    if (
      gestureTravelDegRef.current > dragDetectionDeg ||
      distance > dragDetectionDistance
    ) {
      draggingRef.current = true;
      guardRef.current = true;
      cancelSectorHoldBecauseDrag();
    }
  };

  // Apply one pointer sample: drop hub crossings, gate reversals, then emit 15° quanta.
  const applyPointerSample = (x: number, y: number) => {
    if (lastAngleRef.current === null) return;
    const now = performance.now();
    const currentAngleRad = getAngleFromCenterRad(x, y);
    const nextOffset = offsetFromCenter(x, y);
    const prevOffset = lastOffsetRef.current;
    if (
      nextOffset &&
      prevOffset &&
      segmentPassesNearHub(prevOffset, nextOffset, wheelRadius())
    ) {
      lastOffsetRef.current = nextOffset;
      lastAngleRef.current = currentAngleRad;
      lastMoveAtRef.current = now;
      return;
    }
    if (nextOffset) lastOffsetRef.current = nextOffset;

    let delta = currentAngleRad - lastAngleRef.current;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    lastAngleRef.current = currentAngleRad;

    const filtered = applyReversalHysteresis(
      reversalRef.current,
      (delta * 180) / Math.PI
    );
    reversalRef.current = filtered.state;
    const accepted = filtered.acceptedDeltaDeg;
    if (accepted === 0) {
      lastMoveAtRef.current = now;
      return;
    }

    const dt =
      lastMoveAtRef.current == null
        ? 16
        : Math.max(1, now - lastMoveAtRef.current);
    lastMoveAtRef.current = now;
    if (dt > ACCEL_GAP_RESET_MS) speedRef.current = null;
    const smoothed = smoothWheelSpeed(
      speedRef.current,
      (Math.abs(accepted) / dt) * 1000
    );
    speedRef.current = smoothed;
    gestureTravelDegRef.current += Math.abs(accepted);
    rotationAccumulatorRef.current += (accepted * Math.PI) / 180;

    const threshold = (rotationStepDeg * Math.PI) / 180;
    while (rotationAccumulatorRef.current > threshold) {
      onWheelRotation({
        direction: "clockwise",
        degrees: rotationStepDeg,
        speedDegPerSec: smoothed,
      });
      rotationAccumulatorRef.current -= threshold;
    }
    while (rotationAccumulatorRef.current < -threshold) {
      onWheelRotation({
        direction: "counterclockwise",
        degrees: rotationStepDeg,
        speedDegPerSec: smoothed,
      });
      rotationAccumulatorRef.current += threshold;
    }
  };

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    // Prevent the browser from interpreting this touch as a scroll/zoom gesture
    e.preventDefault();

    const touch = e.touches[0];

    // Skip processing if touch is in center button area
    if (isTouchInCenter(touch.clientX, touch.clientY)) {
      return;
    }

    isTouchDraggingRef.current = false;
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    beginRingGesture(touch.clientX, touch.clientY);
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent default scrolling behaviour while interacting with the wheel
    e.preventDefault();

    if (lastAngleRef.current === null) return;

    const touch = e.touches[0];
    applyPointerSample(touch.clientX, touch.clientY);

    if (touchStartPosRef.current) {
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      noteDrag(
        Math.hypot(dx, dy),
        isTouchDraggingRef,
        isInTouchDragRef
      );
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    const held = finishSectorHold(true);
    // If the user didn't drag beyond the threshold, treat as a tap on a wheel section
    if (!held && !isTouchDraggingRef.current && touchStartPosRef.current) {
      // Use the starting touch position to determine which section was tapped
      const angleDeg = getAngleFromCenterDeg(
        touchStartPosRef.current.x,
        touchStartPosRef.current.y
      );
      const section = getWheelSection(angleDeg);
      onWheelClick(section);

      // Mark that we just handled a touch event to prevent mouse event double firing
      recentTouchRef.current = true;
      setTimeout(() => {
        recentTouchRef.current = false;
      }, 500);
    }

    isTouchDraggingRef.current = false;
    touchStartPosRef.current = null;
    endWheelGesture();

    // Clear the touch drag flag with a small delay to prevent clicks
    if (isInTouchDragRef.current) {
      setTimeout(() => {
        isInTouchDragRef.current = false;
      }, 100);
    }
  };

  // Handle mouse wheel scroll for rotation
  const handleMouseWheel = (e: React.WheelEvent) => {
    // Accumulate delta and only trigger when it reaches threshold
    wheelDeltaRef.current += Math.abs(e.deltaY);

    // Using a threshold of 50 to reduce sensitivity.
    // Speed stays 0 so a trackpad tick never enters the fast row tiers.
    if (wheelDeltaRef.current >= 50) {
      onWheelRotation({
        direction: e.deltaY < 0 ? "counterclockwise" : "clockwise",
        degrees: rotationStepDeg,
        speedDegPerSec: 0,
      });
      // Reset delta after triggering action
      wheelDeltaRef.current = 0;
    }
  };

  // Handle mouse interactions – supports both click and drag rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent double firing after touch events
    if (recentTouchRef.current) {
      return;
    }

    fromMenuLabelRef.current =
      e.target && (e.target as HTMLElement).classList.contains("menu-button");

    // Prevent default text selection behaviour while dragging
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    isDraggingRef.current = false;
    beginRingGesture(startX, startY);

    // Mouse move handler (attached to window so it continues even if we leave the wheel)
    const handleMouseMove = (moveEvent: MouseEvent) => {
      applyPointerSample(moveEvent.clientX, moveEvent.clientY);
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      noteDrag(Math.hypot(dx, dy), isDraggingRef, isInMouseDragRef);
    };

    // Mouse up handler – determine if it was a click or a drag
    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const held = finishSectorHold(true);
      // If the user didn't drag beyond the threshold, treat as a click on a wheel section
      if (!held && !isDraggingRef.current) {
        // Only trigger wheel click if the interaction did NOT originate from the MENU label
        if (!fromMenuLabelRef.current) {
          const angleDeg = getAngleFromCenterDeg(
            upEvent.clientX,
            upEvent.clientY
          );
          const section = getWheelSection(angleDeg);
          onWheelClick(section);
        }
      }

      isDraggingRef.current = false;
      fromMenuLabelRef.current = false;
      endWheelGesture();
      
      // Clear the mouse drag flag with a small delay to prevent clicks
      if (isInMouseDragRef.current) {
        setTimeout(() => {
          isInMouseDragRef.current = false;
        }, 100);
      }
    };

    // Attach listeners to the window so the interaction continues smoothly outside the wheel bounds
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className={cn(
        "mt-6 relative w-[180px] h-[180px] rounded-full flex items-center justify-center select-none no-select-gesture",
        theme === "classic"
          ? "bg-neutral-300/60"
          : theme === "u2"
          ? "bg-red-700/60"
          : "bg-neutral-800/50"
      )}
    >
      {/* Center control changed from <button> to <div role="button"> to avoid global XP/98 button styles overriding radius/background */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t("apps.ipod.ariaLabels.select")}
        onClick={(e) => {
          // Block clicks only during active touch (centerTouchActiveRef has 400ms timeout)
          if (centerTouchActiveRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // Don't trigger click if long press was fired
          if (centerLongPressFiredRef.current) {
            e.preventDefault();
            e.stopPropagation();
            centerLongPressFiredRef.current = false;
            return;
          }
          if (recentTouchRef.current || isInTouchDragRef.current) return;
          onWheelClick("center");
        }}
        onKeyDown={(e) => {
          if (recentTouchRef.current || isInTouchDragRef.current || isInMouseDragRef.current) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onWheelClick("center");
          }
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          startCenterLongPress(false);
        }}
        onMouseUp={() => {
          endCenterLongPress(false);
        }}
        onMouseLeave={() => {
          endCenterLongPress(false);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          startCenterLongPress(true);
        }}
        onTouchEnd={(e) => {
          e.preventDefault(); // Always prevent to avoid synthetic click
          endCenterLongPress(true, true); // Pass true to trigger click if appropriate
        }}
        onTouchCancel={() => {
          endCenterLongPress(true, false);
        }}
        className={cn(
          "ipod-wheel-center absolute w-16 h-16 rounded-full z-10 flex items-center justify-center outline-none focus:outline-none focus-visible:outline-none select-none no-select-gesture",
          theme === "classic"
            ? "bg-white/30"
            : theme === "u2"
            ? "bg-black/70"
            : "bg-black/30"
        )}
      />

      {/* Wheel sections */}
      <div
        ref={wheelRef}
        className="absolute w-full h-full rounded-full touch-none select-none no-select-gesture"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleMouseWheel}
      >
        {/* Wheel labels - no click handlers */}
        <div
          className="absolute top-1.5 text-center left-1/2 transform -translate-x-1/2 font-chicago text-xs text-white menu-button cursor-default select-none no-select-gesture"
          onClick={(e) => {
            if (recentTouchRef.current || isInTouchDragRef.current || isInMouseDragRef.current) return;
            e.stopPropagation(); // Prevent triggering wheel mousedown
            onMenuButton();
          }}
        >
          MENU
        </div>
        <div className="absolute right-2 text-right top-1/2 transform -translate-y-1/2 font-chicago text-[12px] text-white cursor-default select-none no-select-gesture">
          ⏭
        </div>
        <div className="absolute bottom-1 text-center left-1/2 transform -translate-x-1/2 font-chicago text-[12px] text-white cursor-default select-none no-select-gesture">
          ⏯
        </div>
        <div className="absolute left-2 text-left top-1/2 transform -translate-y-1/2 font-chicago text-[12px] text-white cursor-default select-none no-select-gesture">
          ⏮
        </div>
      </div>
    </div>
  );
}
