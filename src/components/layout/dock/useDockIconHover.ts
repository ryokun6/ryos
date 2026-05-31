import { useCallback, useReducer, useRef } from "react";

type HoverState = {
  hoveredId: string | null;
  isSwapping: boolean;
};

type HoverAction =
  | { type: "hoverImmediate"; id: string }
  | { type: "hoverUpdate"; id: string }
  | { type: "clearHover" };

function hoverReducer(state: HoverState, action: HoverAction): HoverState {
  switch (action.type) {
    case "hoverImmediate":
      return { hoveredId: action.id, isSwapping: true };
    case "hoverUpdate":
      return {
        hoveredId: action.id,
        isSwapping: state.hoveredId !== null && state.hoveredId !== action.id,
      };
    case "clearHover":
      return { hoveredId: null, isSwapping: false };
    default:
      return state;
  }
}

/** Manages dock icon label hover with debounced clear and swap detection. */
export function useDockIconHover() {
  const [hoverState, dispatchHover] = useReducer(hoverReducer, {
    hoveredId: null,
    isSwapping: false,
  });
  const { hoveredId, isSwapping } = hoverState;
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleIconHover = useCallback((id: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
      dispatchHover({ type: "hoverImmediate", id });
      return;
    }

    dispatchHover({ type: "hoverUpdate", id });
  }, []);

  const handleIconLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      dispatchHover({ type: "clearHover" });
      hoverTimeoutRef.current = null;
    }, 50);
  }, []);

  return { hoveredId, isSwapping, handleIconHover, handleIconLeave };
}
