import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type WheelArea = "top" | "right" | "bottom" | "left" | "center";
type RotationDirection = "clockwise" | "counterclockwise";

interface IpodWheelProps {
  theme: string;
  onWheelClick: (area: WheelArea) => void;
  onWheelRotation: (direction: RotationDirection) => void;
  onMenuButton: () => void;
  onCenterLongPress?: () => void;
}

// Long press delay in milliseconds
const LONG_PRESS_DELAY = 500;

// How many degrees of wheel rotation should equal one scroll step
const rotationStepDeg = 15; // increase this value to reduce sensitivity

// Minimum movement to be considered a drag (not a tap)
// This is intentionally smaller than rotationStepDeg to catch scrolling intent early
const dragDetectionDeg = 5; // degrees of rotation to detect drag intent
const dragDetectionDistance = 8; // pixels of movement to detect drag intent

export function IpodWheel({
  theme,
  onWheelClick,
  onWheelRotation,
  onMenuButton,
  onCenterLongPress,
}: IpodWheelProps) {
  const { t } = useTranslation();
  const wheelRef = useRef<HTMLDivElement>(null);
  // Accumulated mouse wheel delta (for desktop scrolling)
  const [wheelDelta, setWheelDelta] = useState(0);

  // Refs for tracking continuous touch rotation
  const lastAngleRef = useRef<number | null>(null); // Last touch angle in radians
  const rotationAccumulatorRef = useRef(0); // Accumulated rotation in radians

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

  const clearCenterLongPress = () => {
    if (centerLongPressTimerRef.current) {
      clearTimeout(centerLongPressTimerRef.current);
      centerLongPressTimerRef.current = null;
    }
  };

  const startCenterLongPress = () => {
    clearCenterLongPress();
    centerLongPressFiredRef.current = false;
    if (onCenterLongPress) {
      centerLongPressTimerRef.current = setTimeout(() => {
        centerLongPressFiredRef.current = true;
        onCenterLongPress();
      }, LONG_PRESS_DELAY);
    }
  };

  // Calculate angle (in degrees) from the center of the wheel – used for click areas
  const getAngleFromCenterDeg = (x: number, y: number): number => {
    if (!wheelRef.current) return 0;

    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI;
  };

  // Same as above but returns radians – used for rotation calculation
  const getAngleFromCenterRad = (x: number, y: number): number => {
    if (!wheelRef.current) return 0;

    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return Math.atan2(y - centerY, x - centerX);
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
    if (!wheelRef.current) return false;

    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    // Center button is w-16 h-16 (64px), so radius is 32px
    return distance <= 32;
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

    const angleRad = getAngleFromCenterRad(touch.clientX, touch.clientY);
    lastAngleRef.current = angleRad;
    rotationAccumulatorRef.current = 0;
    isTouchDraggingRef.current = false;
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent default scrolling behaviour while interacting with the wheel
    e.preventDefault();

    if (lastAngleRef.current === null) return;

    const touch = e.touches[0];
    const currentAngleRad = getAngleFromCenterRad(touch.clientX, touch.clientY);

    // Calculate shortest angular difference (-π, π]
    let delta = currentAngleRad - lastAngleRef.current;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    rotationAccumulatorRef.current += delta;
    lastAngleRef.current = currentAngleRad;

    const threshold = (rotationStepDeg * Math.PI) / 180; // convert step to radians
    const dragThreshold = (dragDetectionDeg * Math.PI) / 180; // smaller threshold for drag detection

    // Check for drag intent using either rotation or distance
    if (!isTouchDraggingRef.current && touchStartPosRef.current) {
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Detect drag if rotation exceeds threshold OR distance exceeds threshold
      if (Math.abs(rotationAccumulatorRef.current) > dragThreshold || distance > dragDetectionDistance) {
        isTouchDraggingRef.current = true;
        isInTouchDragRef.current = true;
      }
    }

    // Trigger rotation events when threshold exceeded
    while (rotationAccumulatorRef.current > threshold) {
      onWheelRotation("clockwise");
      rotationAccumulatorRef.current -= threshold;
    }

    while (rotationAccumulatorRef.current < -threshold) {
      onWheelRotation("counterclockwise");
      rotationAccumulatorRef.current += threshold;
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    // If the user didn't drag beyond the threshold, treat as a tap on a wheel section
    if (!isTouchDraggingRef.current && touchStartPosRef.current) {
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

    // Reset all touch tracking refs
    lastAngleRef.current = null;
    rotationAccumulatorRef.current = 0;
    isTouchDraggingRef.current = false;
    touchStartPosRef.current = null;

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
    const newDelta = wheelDelta + Math.abs(e.deltaY);
    setWheelDelta(newDelta);

    // Using a threshold of 50 to reduce sensitivity
    if (newDelta >= 50) {
      if (e.deltaY < 0) {
        onWheelRotation("counterclockwise");
      } else {
        onWheelRotation("clockwise");
      }
      // Reset delta after triggering action
      setWheelDelta(0);
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

    // Initialise rotation tracking
    const startAngleRad = getAngleFromCenterRad(e.clientX, e.clientY);
    const startX = e.clientX;
    const startY = e.clientY;
    lastAngleRef.current = startAngleRad;
    rotationAccumulatorRef.current = 0;
    isDraggingRef.current = false;

    const threshold = (rotationStepDeg * Math.PI) / 180; // rad
    const dragThreshold = (dragDetectionDeg * Math.PI) / 180; // smaller threshold for drag detection

    // Mouse move handler (attached to window so it continues even if we leave the wheel)
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (lastAngleRef.current === null) return;

      const currentAngleRad = getAngleFromCenterRad(
        moveEvent.clientX,
        moveEvent.clientY
      );

      // Shortest angular difference
      let delta = currentAngleRad - lastAngleRef.current;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;

      rotationAccumulatorRef.current += delta;
      lastAngleRef.current = currentAngleRad;

      // Check for drag intent using either rotation or distance
      if (!isDraggingRef.current) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Detect drag if rotation exceeds threshold OR distance exceeds threshold
        if (Math.abs(rotationAccumulatorRef.current) > dragThreshold || distance > dragDetectionDistance) {
          isDraggingRef.current = true;
          isInMouseDragRef.current = true;
        }
      }

      // Emit rotation events whenever accumulated rotation crosses threshold
      while (rotationAccumulatorRef.current > threshold) {
        onWheelRotation("clockwise");
        rotationAccumulatorRef.current -= threshold;
      }

      while (rotationAccumulatorRef.current < -threshold) {
        onWheelRotation("counterclockwise");
        rotationAccumulatorRef.current += threshold;
      }
    };

    // Mouse up handler – determine if it was a click or a drag
    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      // If the user didn't drag beyond the threshold, treat as a click on a wheel section
      if (!isDraggingRef.current) {
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

      // Reset refs
      lastAngleRef.current = null;
      rotationAccumulatorRef.current = 0;
      isDraggingRef.current = false;
      fromMenuLabelRef.current = false;
      
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
          ? "bg-gray-300/60"
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
        onClick={() => {
          // Don't trigger click if long press was fired
          if (centerLongPressFiredRef.current) {
            centerLongPressFiredRef.current = false;
            return;
          }
          if (recentTouchRef.current || isInTouchDragRef.current || isInMouseDragRef.current) return;
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
          startCenterLongPress();
        }}
        onMouseUp={() => {
          clearCenterLongPress();
        }}
        onMouseLeave={() => {
          clearCenterLongPress();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          startCenterLongPress();
          // Mark recent touch to prevent double firing
          recentTouchRef.current = true;
          setTimeout(() => {
            recentTouchRef.current = false;
          }, 500);
        }}
        onTouchEnd={() => {
          clearCenterLongPress();
        }}
        onTouchCancel={() => {
          clearCenterLongPress();
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
