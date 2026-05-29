/** DOM id of the React root that hosts the full ryOS shell. */
export const RYOS_FULLSCREEN_ROOT_ID = "root";

export function getRyosFullscreenRoot(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.getElementById(RYOS_FULLSCREEN_ROOT_ID);
}

/** Whether the browser exposes a usable Fullscreen API. */
export function isRyosFullscreenSupported(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const root = getRyosFullscreenRoot();
  if (!root) {
    return false;
  }
  return (
    typeof document.fullscreenEnabled === "boolean" &&
    document.fullscreenEnabled &&
    typeof root.requestFullscreen === "function" &&
    typeof document.exitFullscreen === "function"
  );
}

/** True when the ryOS shell root is the active fullscreen element. */
export function isRyosFullscreenActive(): boolean {
  const root = getRyosFullscreenRoot();
  if (!root) {
    return false;
  }
  return document.fullscreenElement === root;
}

export async function enterRyosFullscreen(): Promise<void> {
  if (!isRyosFullscreenSupported()) {
    return;
  }
  const root = getRyosFullscreenRoot();
  if (!root || isRyosFullscreenActive()) {
    return;
  }
  try {
    await root.requestFullscreen();
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
