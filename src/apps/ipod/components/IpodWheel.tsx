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

  // Refs for tap/drag distinction
  const rotationOccurredInCurrentInteractionRef = useRef<boolean>(false);
  const buttonAreaInteractionStartedRef = useRef<WheelArea | "menu" | null>(null);

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
    e.preventDefault();
    const touch = e.touches[0];

    // Reset rotation flag for the new interaction
    rotationOccurredInCurrentInteractionRef.current = false; // NEW

    // Determine if touch started on a button area
    if (isTouchInCenter(touch.clientX, touch.clientY)) {
      buttonAreaInteractionStartedRef.current = "center"; 
    } else {
      // Check if it's the MENU label first, as it's a specific target
      // The MENU label has a class 'menu-button'
      const targetElement = e.target as HTMLElement;
      if (targetElement && targetElement.classList && targetElement.classList.contains("menu-button")) {
        buttonAreaInteractionStartedRef.current = "menu";
      } else {
        // Otherwise, it's one of the wheel sections
        const angleDeg = getAngleFromCenterDeg(touch.clientX, touch.clientY);
        buttonAreaInteractionStartedRef.current = getWheelSection(angleDeg);
      }
    }
    
    // Existing logic for setting up rotation
    const angleRad = getAngleFromCenterRad(touch.clientX, touch.clientY);
    lastAngleRef.current = angleRad;
    rotationAccumulatorRef.current = 0;
    isTouchDraggingRef.current = false; // Still useful for visual drag state or other subtle effects
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    // Discarded time-based refs from previous plan (ensure they are removed if present)
    // touchStartTimeRef.current = Date.now(); 
    // dragOccurredOnLastTouchRef.current = false;
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();

    if (lastAngleRef.current === null || !touchStartPosRef.current) return;

    const touch = e.touches[0];
    const currentAngleRad = getAngleFromCenterRad(touch.clientX, touch.clientY);

    // Calculate rotational delta first, as it's needed for both drag detection and wheel steps.
    let delta = currentAngleRad - lastAngleRef.current;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    
    // Accumulate rotation before checking drag, so current move's rotation contributes to drag check.
    rotationAccumulatorRef.current += delta;
    // Update lastAngleRef *after* using it for delta with current accumulator state.
    // This was previously before the accumulator update, now it's after.
    lastAngleRef.current = currentAngleRad; 

    // Trigger rotation events (using the original rotationStepDeg for sensitivity of wheel steps)
    // This part remains the same.
    const rotationEventThreshold = (rotationStepDeg * Math.PI) / 180;
    while (rotationAccumulatorRef.current > rotationEventThreshold) {
      rotationOccurredInCurrentInteractionRef.current = true; // NEW
      onWheelRotation("clockwise");
      rotationAccumulatorRef.current -= rotationEventThreshold;
    }

    while (rotationAccumulatorRef.current < -rotationEventThreshold) {
      rotationOccurredInCurrentInteractionRef.current = true; // NEW
      onWheelRotation("counterclockwise");
      rotationAccumulatorRef.current += rotationEventThreshold;
    }
  };

  // Handle touch end
  const handleTouchEnd = (_e: React.TouchEvent) => {
    const interactionStartedOn = buttonAreaInteractionStartedRef.current;
    const rotationOccurred = rotationOccurredInCurrentInteractionRef.current;

    // Check if the interaction started on a wheel section (not 'menu' or 'center')
    // and no rotation occurred.
    if (
      interactionStartedOn &&
      interactionStartedOn !== "menu" &&
      interactionStartedOn !== "center" &&
      !rotationOccurred &&
      touchStartPosRef.current // Ensure interaction was initialized (touchStartPosRef is set in handleTouchStart)
    ) {
      // It's a tap on a wheel section (top, bottom, left, right)
      onWheelClick(interactionStartedOn as WheelArea); // Type assertion

      // Mark that we just handled a touch event to prevent mouse event double firing
      recentTouchRef.current = true;
      setTimeout(() => {
        recentTouchRef.current = false;
      }, 500);
    }

    // Reset refs for the next interaction
    lastAngleRef.current = null;
    rotationAccumulatorRef.current = 0;
    touchStartPosRef.current = null; // Resetting the start position
    buttonAreaInteractionStartedRef.current = null; 
    // rotationOccurredInCurrentInteractionRef is reset in handleTouchStart
    // isTouchDraggingRef is reset in handleTouchStart
    // Obsolete refs like touchStartTimeRef, dragOccurredOnLastTouchRef are no longer used here.
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

    // Reset rotation flag for the new interaction
    rotationOccurredInCurrentInteractionRef.current = false; // NEW

    // Determine if mouse down started on a button area
    if (isTouchInCenter(e.clientX, e.clientY)) { // Using isTouchInCenter for mouse too
      buttonAreaInteractionStartedRef.current = "center";
    } else {
      fromMenuLabelRef.current = e.target && (e.target as HTMLElement).classList.contains("menu-button");
      if (fromMenuLabelRef.current) {
        buttonAreaInteractionStartedRef.current = "menu";
      } else {
        const angleDeg = getAngleFromCenterDeg(e.clientX, e.clientY);
        buttonAreaInteractionStartedRef.current = getWheelSection(angleDeg);
      }
    }

    // Existing logic for setting up rotation
    const startAngleRad = getAngleFromCenterRad(e.clientX, e.clientY);
    lastAngleRef.current = startAngleRad;
    rotationAccumulatorRef.current = 0;
    isDraggingRef.current = false; // Still useful
    mouseStartPosRef.current = { x: e.clientX, y: e.clientY };

    // Discarded time-based refs from previous plan (ensure they are removed if present)
    // mouseStartTimeRef.current = Date.now();
    // dragOccurredOnLastMouseRef.current = false;

    // Mouse move handler (attached to window so it continues even if we leave the wheel)
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (lastAngleRef.current === null || !mouseStartPosRef.current) return;

      const currentAngleRad = getAngleFromCenterRad(moveEvent.clientX, moveEvent.clientY);
      let delta = currentAngleRad - lastAngleRef.current;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;

      rotationAccumulatorRef.current += delta;
      lastAngleRef.current = currentAngleRad;

      // Emit rotation events whenever accumulated rotation crosses threshold
      const rotationEventThreshold = (rotationStepDeg * Math.PI) / 180; // Use original threshold for step sensitivity
      while (rotationAccumulatorRef.current > rotationEventThreshold) {
        rotationOccurredInCurrentInteractionRef.current = true; // NEW
        onWheelRotation("clockwise");
        rotationAccumulatorRef.current -= rotationEventThreshold;
      }

      while (rotationAccumulatorRef.current < -rotationEventThreshold) {
        rotationOccurredInCurrentInteractionRef.current = true; // NEW
        onWheelRotation("counterclockwise");
        rotationAccumulatorRef.current += rotationEventThreshold;
      }
    };

    // Mouse up handler – determine if it was a click or a drag
    const handleMouseUp = (_upEvent: MouseEvent) => { // upEvent might not be needed if using interactionStartedOn
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const interactionStartedOn = buttonAreaInteractionStartedRef.current;
      const rotationOccurred = rotationOccurredInCurrentInteractionRef.current;

      // Check if interaction started on a wheel section (not 'menu' or 'center'),
      // no rotation occurred, and it wasn't a click that started on the MENU label.
      if (
        interactionStartedOn &&
        interactionStartedOn !== "menu" &&
        interactionStartedOn !== "center" &&
        !rotationOccurred &&
        !fromMenuLabelRef.current // Crucial for mouse events to respect MENU label's own onClick
      ) {
        // It's a tap on a wheel section (top, bottom, left, right)
        onWheelClick(interactionStartedOn as WheelArea); // Type assertion
      }

      // Reset refs
      lastAngleRef.current = null;
      rotationAccumulatorRef.current = 0;
      fromMenuLabelRef.current = false; // Reset this as it's specific to mouse down on menu
      mouseStartPosRef.current = null;
      buttonAreaInteractionStartedRef.current = null;
      // rotationOccurredInCurrentInteractionRef is reset in handleMouseDown
      // isDraggingRef is reset in handleMouseDown
      // Obsolete refs like mouseStartTimeRef, dragOccurredOnLastMouseRef are no longer used here.
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
          if (recentTouchRef.current || rotationOccurredInCurrentInteractionRef.current) return;
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
            // If a rotation occurred during the interaction that led to this click event,
            // or if it's a rapid succession from a wheel touch event, do not fire.
            if (recentTouchRef.current || rotationOccurredInCurrentInteractionRef.current) {
              // rotationOccurredInCurrentInteractionRef is reset by handle(Touch|Mouse)Start.
              // recentTouchRef is managed by its own setTimeout.
              return;
            }

            // If we've reached here, it's a valid click for the MENU button.
            e.stopPropagation(); // Prevent triggering wheel mousedown/touchstart from this specific MENU click.
            onMenuButton();
            
            // No need to reset rotationOccurredInCurrentInteractionRef here, 
            // as it's reset at the start of the next interaction.
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
