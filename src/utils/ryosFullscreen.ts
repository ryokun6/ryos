/** DOM id of the React root that hosts the full ryOS shell. */
export const RYOS_FULLSCREEN_ROOT_ID = "root";

/** Element that enters browser fullscreen for the whole ryOS page. */
export function getRyosFullscreenElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.documentElement;
}

export function getRyosFullscreenRoot(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.getElementById(RYOS_FULLSCREEN_ROOT_ID);
}

/** Whether the browser exposes a usable Fullscreen API. */
export function isRyosFullscreenSupported(): boolean {
  const target = getRyosFullscreenElement();
  if (!target || !getRyosFullscreenRoot()) {
    return false;
  }
  return (
    typeof document.fullscreenEnabled === "boolean" &&
    document.fullscreenEnabled &&
    typeof target.requestFullscreen === "function" &&
    typeof document.exitFullscreen === "function"
  );
}

/** True when the ryOS page is in browser fullscreen. */
export function isRyosFullscreenActive(): boolean {
  const target = getRyosFullscreenElement();
  if (!target) {
    return false;
  }
  return document.fullscreenElement === target;
}

export async function enterRyosFullscreen(): Promise<void> {
  if (!isRyosFullscreenSupported()) {
    return;
  }
  const target = getRyosFullscreenElement();
  if (!target || isRyosFullscreenActive()) {
    return;
  }
  try {
    await target.requestFullscreen();
  } catch (err) {
    console.warn("[ryOS] Failed to enter fullscreen:", err);
  }
}

export async function exitRyosFullscreen(): Promise<void> {
  if (!isRyosFullscreenActive()) {
    return;
  }
  try {
    await document.exitFullscreen();
  } catch (err) {
    console.warn("[ryOS] Failed to exit fullscreen:", err);
  }
}

export async function toggleRyosFullscreen(): Promise<void> {
  if (isRyosFullscreenActive()) {
    await exitRyosFullscreen();
  } else {
    await enterRyosFullscreen();
  }
}
