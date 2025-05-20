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

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    // Prevent the browser from interpreting this touch as a scroll/zoom gesture
    e.preventDefault();

    const touch = e.touches[0];
    const angleRad = getAngleFromCenterRad(touch.clientX, touch.clientY);
    lastAngleRef.current = angleRad;
    rotationAccumulatorRef.current = 0;
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
    lastAngleRef.current = null;
    rotationAccumulatorRef.current = 0;
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
    fromMenuLabelRef.current =
      e.target && (e.target as HTMLElement).classList.contains("menu-button");

    // Prevent default text selection behaviour while dragging
    e.preventDefault();

    // Initialise rotation tracking
    const startAngleRad = getAngleFromCenterRad(e.clientX, e.clientY);
    lastAngleRef.current = startAngleRad;
    rotationAccumulatorRef.current = 0;
    isDraggingRef.current = false;

    const threshold = (rotationStepDeg * Math.PI) / 180; // rad

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

      // Once movement exceeds threshold, treat interaction as a drag (not a simple click)
      if (
        !isDraggingRef.current &&
        Math.abs(rotationAccumulatorRef.current) > threshold
      ) {
        isDraggingRef.current = true;
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
        onClick={() => onWheelClick("center")}
        className={cn(
          "absolute w-16 h-16 rounded-full z-10 flex items-center justify-center",
          theme === "classic"
            ? "bg-white/30"
            : theme === "u2"
            ? "bg-red-900/40"
            : "bg-black/40"
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
          className="absolute top-2 left-1/2 transform -translate-x-1/2 font-chicago text-xs text-white menu-button cursor-default select-none"
          onClick={(e) => {
            e.stopPropagation(); // Prevent triggering wheel mousedown
            onMenuButton();
          }}
        >
          MENU
        </div>
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 font-chicago text-[9px] text-white cursor-default select-none">
          ▶︎▶︎
        </div>
        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 font-chicago text-[9px] text-white cursor-default select-none">
          ▶︎❙❙
        </div>
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 font-chicago text-[9px] text-white cursor-default select-none">
          ◀︎◀︎
        </div>
      </div>
    </div>
  );
}
