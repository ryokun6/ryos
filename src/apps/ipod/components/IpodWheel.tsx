import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

type WheelArea = "top" | "right" | "bottom" | "left" | "center";
type RotationDirection = "clockwise" | "counterclockwise";

interface IpodWheelProps {
  theme: string;
  onWheelClick: (area: WheelArea) => void;
  onWheelRotation: (direction: RotationDirection) => void;
  onMenuButton: () => void;
}

// How many degrees of wheel rotation should equal one scroll step
const rotationStepDeg = 15; // increase this value to reduce sensitivity

export function IpodWheel({
  theme,
  onWheelClick,
  onWheelRotation,
  onMenuButton,
}: IpodWheelProps) {
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
  const mouseStartPosRef = useRef<{ x: number; y: number } | null>(null); // Starting mouse position
  const recentTouchRef = useRef(false); // Track if we just handled a touch event to prevent double firing

  // Track if the current interaction started on the "MENU" label so we can suppress duplicate click handling
  const fromMenuLabelRef = useRef(false);

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

    // Ensure touchStartPosRef and lastAngleRef are initialized
    if (lastAngleRef.current === null || !touchStartPosRef.current) return;

    const touch = e.touches[0];
    const currentAngleRad = getAngleFromCenterRad(touch.clientX, touch.clientY);

    // --- Start of new linear movement check ---
    if (!isTouchDraggingRef.current) { // Only check if not already considered dragging
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      const distanceMoved = Math.sqrt(dx * dx + dy * dy);
      const linearDragThreshold = 2; // pixels

      if (distanceMoved > linearDragThreshold) {
        isTouchDraggingRef.current = true;
      }
    }
    // --- End of new linear movement check ---

    // Calculate shortest angular difference (-π, π] for rotation
    let delta = currentAngleRad - lastAngleRef.current;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    rotationAccumulatorRef.current += delta;
    lastAngleRef.current = currentAngleRad;

    // Rotational movement check (existing logic, but ensure it only runs if not already dragging)
    if (!isTouchDraggingRef.current) {
      const rotationDragThreshold = (rotationStepDeg * Math.PI) / 180; // convert step to radians
      if (Math.abs(rotationAccumulatorRef.current) > rotationDragThreshold) {
        isTouchDraggingRef.current = true;
      }
    }

    // Trigger rotation events when threshold exceeded (only if dragging)
    // This part might also need isTouchDraggingRef.current check if onWheelRotation should only happen after drag confirmed.
    // However, the original issue is about clicks, so let's focus on setting isTouchDraggingRef correctly.
    // The original code implies rotation events can happen as soon as threshold is passed, which might be fine.
    const rotationTriggerThreshold = (rotationStepDeg * Math.PI) / 180;
    while (rotationAccumulatorRef.current > rotationTriggerThreshold) {
      onWheelRotation("clockwise");
      rotationAccumulatorRef.current -= rotationTriggerThreshold;
    }

    while (rotationAccumulatorRef.current < -rotationTriggerThreshold) {
      onWheelRotation("counterclockwise");
      rotationAccumulatorRef.current += rotationTriggerThreshold;
    }
  };

  // Handle touch end
  const handleTouchEnd = (_e: React.TouchEvent) => {
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
    mouseStartPosRef.current = { x: e.clientX, y: e.clientY }; // ADD THIS
    const startAngleRad = getAngleFromCenterRad(e.clientX, e.clientY);
    lastAngleRef.current = startAngleRad;
    rotationAccumulatorRef.current = 0;
    isDraggingRef.current = false;

    // const rotationDragThreshold = (rotationStepDeg * Math.PI) / 180; // Renamed for clarity if used directly

    // Mouse move handler (attached to window so it continues even if we leave the wheel)
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (lastAngleRef.current === null || !mouseStartPosRef.current) return; // ADD null check for mouseStartPosRef

      // --- Start of new linear movement check for mouse ---
      if (!isDraggingRef.current) {
        const dx = moveEvent.clientX - mouseStartPosRef.current.x;
        const dy = moveEvent.clientY - mouseStartPosRef.current.y;
        const distanceMoved = Math.sqrt(dx * dx + dy * dy);
        const linearDragThreshold = 2; // pixels

        if (distanceMoved > linearDragThreshold) {
          isDraggingRef.current = true;
        }
      }
      // --- End of new linear movement check for mouse ---

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

      // Rotational movement check, conditioned if not already dragging
      if (!isDraggingRef.current) {
        const rotationDragThreshold = (rotationStepDeg * Math.PI) / 180;
        if (Math.abs(rotationAccumulatorRef.current) > rotationDragThreshold) {
          isDraggingRef.current = true;
        }
      }
      
      // Emit rotation events whenever accumulated rotation crosses threshold
      const rotationTriggerThreshold = (rotationStepDeg * Math.PI) / 180;
      while (rotationAccumulatorRef.current > rotationTriggerThreshold) {
        onWheelRotation("clockwise");
        rotationAccumulatorRef.current -= rotationTriggerThreshold;
      }

      while (rotationAccumulatorRef.current < -rotationTriggerThreshold) {
        onWheelRotation("counterclockwise");
        rotationAccumulatorRef.current += rotationTriggerThreshold;
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
      mouseStartPosRef.current = null; // ADD THIS to reset
    };

    // Attach listeners to the window so the interaction continues smoothly outside the wheel bounds
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className={cn(
        "mt-6 relative w-[180px] h-[180px] rounded-full flex items-center justify-center select-none",
        theme === "classic"
          ? "bg-gray-300/60"
          : theme === "u2"
          ? "bg-red-700/60"
          : "bg-neutral-800/50"
      )}
    >
      {/* Center button */}
      <button
        onClick={() => {
          if (recentTouchRef.current) return;
          onWheelClick("center");
        }}
        className={cn(
          "absolute w-16 h-16 rounded-full z-10 flex items-center justify-center",
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
        className="absolute w-full h-full rounded-full touch-none select-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleMouseWheel}
      >
        {/* Wheel labels - no click handlers */}
        <div
          className="absolute top-1.5 text-center left-1/2 transform -translate-x-1/2 font-chicago text-xs text-white menu-button cursor-default select-none"
          onClick={(e) => {
            if (recentTouchRef.current || isTouchDraggingRef.current) return; // Added isTouchDraggingRef.current
            e.stopPropagation(); // Prevent triggering wheel mousedown
            onMenuButton();
          }}
        >
          MENU
        </div>
        <div className="absolute right-2 text-right top-1/2 transform -translate-y-1/2 font-chicago text-[12px] text-white cursor-default select-none">
          ⏭
        </div>
        <div className="absolute bottom-1 text-center left-1/2 transform -translate-x-1/2 font-chicago text-[12px] text-white cursor-default select-none">
          ⏯
        </div>
        <div className="absolute left-2 text-left top-1/2 transform -translate-y-1/2 font-chicago text-[12px] text-white cursor-default select-none">
          ⏮
        </div>
      </div>
    </div>
  );
}
