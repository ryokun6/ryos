import { useEffect, useReducer } from "react";
import { AppId } from "@/config/appRegistry";

interface SwipeNavigationOptions {
  threshold?: number; // Minimum swipe distance to trigger navigation
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  currentAppId: AppId;
  isActive: boolean;
}

interface SwipeState {
  touchStartX: number | null;
  touchEndX: number | null;
  isSwiping: boolean;
  swipeDirection: "left" | "right" | null;
}

const initialState: SwipeState = {
  touchStartX: null,
  touchEndX: null,
  isSwiping: false,
  swipeDirection: null,
};

type SwipeAction =
  | { type: "reset" }
  | { type: "touchStart"; x: number }
  | { type: "touchMove"; x: number; direction: "left" | "right" | null }
  | { type: "setIsSwiping"; value: boolean };

function reducer(state: SwipeState, action: SwipeAction): SwipeState {
  switch (action.type) {
    case "reset":
      return initialState;
    case "touchStart":
      return {
        ...state,
        touchStartX: action.x,
        touchEndX: null,
        isSwiping: true,
        swipeDirection: null,
      };
    case "touchMove":
      return {
        ...state,
        touchEndX: action.x,
        swipeDirection: action.direction,
      };
    case "setIsSwiping":
      return {
        ...state,
        isSwiping: action.value,
      };
    default:
      return state;
  }
}

export function useSwipeNavigation({
  threshold = 100,
  onSwipeLeft,
  onSwipeRight,
  currentAppId,
  isActive,
}: SwipeNavigationOptions) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { touchStartX, touchEndX, isSwiping, swipeDirection } = state;

  // Reset swipe state when the currentAppId changes
  useEffect(() => {
    dispatch({ type: "reset" });
  }, [currentAppId]);

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (!isActive) return;
    dispatch({ type: "touchStart", x: e.touches[0].clientX });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (!isActive || touchStartX === null) return;

    const currentX = e.touches[0].clientX;

    // Calculate direction for visual feedback
    const diff = touchStartX - currentX;
    dispatch({
      type: "touchMove",
      x: currentX,
      direction: Math.abs(diff) > 20 ? (diff > 0 ? "left" : "right") : null,
    });
  };

  const handleTouchEnd = () => {
    if (!isActive || touchStartX === null || touchEndX === null) {
      dispatch({ type: "setIsSwiping", value: false });
      return;
    }

    const diff = touchStartX - touchEndX;
    const absDiff = Math.abs(diff);

    if (absDiff > threshold) {
      if (diff > 0) {
        // Swiped left
        onSwipeLeft?.();
      } else {
        // Swiped right
        onSwipeRight?.();
      }
    }

    // Reset touch coordinates
    dispatch({ type: "reset" });
  };

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isSwiping,
    swipeDirection,
  };
}
