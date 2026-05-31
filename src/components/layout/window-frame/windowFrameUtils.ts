export function isFromTitlebarControls(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest("[data-titlebar-controls]")) return true;
  if (el.closest(".title-bar-controls")) return true; // XP/98
  if (el.closest('button,[role="button"]')) return true;
  return false;
}

export function getSwipeStyle(
  isPhone: boolean,
  isSwiping: boolean,
  swipeDirection: "left" | "right" | null
): React.CSSProperties {
  if (!isPhone || !isSwiping || !swipeDirection) {
    return {};
  }

  // Apply a slight translation effect during swipe
  const translateAmount = swipeDirection === "left" ? -10 : 10;
  return {
    transform: `translateX(${translateAmount}px)`,
    transition: "transform 0.1s ease",
  };
}
