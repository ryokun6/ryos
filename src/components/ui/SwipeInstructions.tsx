import { useEffect, useReducer } from "react";
import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

interface SwipeInstructionsProps {
  className?: string;
}

interface SwipeInstructionsState {
  isVisible: boolean;
  shouldRender: boolean;
}

const initialState: SwipeInstructionsState = {
  isVisible: false,
  shouldRender: false,
};

type SwipeInstructionsAction =
  | { type: "showContainer" }
  | { type: "setVisible"; value: boolean }
  | { type: "hideContainer" };

function reducer(
  state: SwipeInstructionsState,
  action: SwipeInstructionsAction
): SwipeInstructionsState {
  switch (action.type) {
    case "showContainer":
      return { ...state, shouldRender: true };
    case "setVisible":
      return { ...state, isVisible: action.value };
    case "hideContainer":
      return { ...state, shouldRender: false };
    default:
      return state;
  }
}

export function SwipeInstructions({ className }: SwipeInstructionsProps) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { isVisible, shouldRender } = state;
  const isMobile = useIsMobile();

  useEffect(() => {
    // Only show on mobile devices and if not previously dismissed
    // Check both new and legacy keys
    const hasSeenInstructions = localStorage.getItem("ryos:has-seen-swipe-instructions") || 
                                localStorage.getItem("hasSeenSwipeInstructions");
    const shouldShow = isMobile && !hasSeenInstructions;

    if (shouldShow) {
      // Delay showing the instructions to not interfere with initial app loading
      const timer = setTimeout(() => {
        dispatch({ type: "showContainer" });
        // Use a separate state for animation
        const animationTimer = setTimeout(
          () => dispatch({ type: "setVisible", value: true }),
          100
        );
        return () => clearTimeout(animationTimer);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  const handleDismiss = () => {
    dispatch({ type: "setVisible", value: false });
    localStorage.setItem("ryos:has-seen-swipe-instructions", "true");
    // Clean up legacy key
    localStorage.removeItem("hasSeenSwipeInstructions");

    // Remove from DOM after animation completes
    setTimeout(() => dispatch({ type: "hideContainer" }), 300);
  };

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 left-4 right-4 bg-white rounded-lg p-4 shadow-lg z-50 border-2 border-black transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg">{t("common.swipeInstructions.title")}</h3>
        <button
          onClick={handleDismiss}
          className="bg-transparent p-1 rounded-full hover:bg-gray-100"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-center space-x-8 py-4">
        <div className="flex flex-col items-center">
          <div className="relative size-16 flex items-center justify-center">
            <div className="absolute border-2 border-black rounded-md size-12 bg-gray-100" />
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15 4L7 12L15 20"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="mt-2 text-sm">{t("common.swipeInstructions.previous")}</span>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative size-16 flex items-center justify-center">
            <div className="absolute border-2 border-black rounded-md size-12 bg-gray-100" />
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 4L17 12L9 20"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="mt-2 text-sm">{t("common.swipeInstructions.next")}</span>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-2 text-center">
        {t("common.swipeInstructions.description")}
      </p>
    </div>
  );
}
