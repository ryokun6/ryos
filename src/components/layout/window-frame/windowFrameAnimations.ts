import type { TargetAndTransition } from "motion/react";

export const shakeTransition = {
  duration: 0.4,
  ease: "easeInOut" as const,
};

export type DockIconOffset = { x: number; y: number };

export function getInitialAnimation(params: {
  shouldAnimateRestore: boolean;
  dockIconOffset: DockIconOffset;
  isInitialMount: boolean;
  launchOriginOffset: DockIconOffset | null;
}) {
  const { shouldAnimateRestore, dockIconOffset, isInitialMount, launchOriginOffset } =
    params;
  if (shouldAnimateRestore) {
    return {
      scale: 0.1,
      opacity: 0,
      x: dockIconOffset.x,
      y: dockIconOffset.y,
    };
  }
  if (isInitialMount) {
    if (launchOriginOffset) {
      return {
        scale: 0.1,
        opacity: 0,
        x: launchOriginOffset.x,
        y: launchOriginOffset.y,
      };
    }
    return { scale: 0.95, opacity: 0 };
  }
  return false;
}

export function getExitAnimation(params: {
  keepMountedWhenMinimized: boolean;
  getDockIconOffset: () => DockIconOffset;
}): TargetAndTransition {
  const { keepMountedWhenMinimized, getDockIconOffset } = params;
  if (keepMountedWhenMinimized) {
    return {
      scale: 0.95,
      opacity: 0,
      x: 0,
      y: 0,
      transition: { duration: 0.2, ease: [0.32, 0, 0.67, 0] as const },
    };
  }
  // Motion resolves function-valued exit definitions when the exit animation
  // starts (see motion-dom's resolveVariantFromProps), so the dock icon is
  // measured at minimize time — icons shift as apps open/close and the dock
  // re-centers, and the icon may not even exist yet when the window mounts.
  const resolveMinimizeExit = () => {
    const dockIconOffset = getDockIconOffset();
    return {
      scale: 0.1,
      opacity: 0,
      x: dockIconOffset.x,
      y: dockIconOffset.y,
      transition: { duration: 0.25, ease: [0.32, 0, 0.67, 0] as const },
    };
  };
  // The public `exit` prop type doesn't include lazy resolvers even though
  // the runtime supports them, hence the cast.
  return resolveMinimizeExit as unknown as TargetAndTransition;
}

export function getAnimateState(params: {
  isClosing: boolean;
  keepMountedWhenMinimized: boolean;
  isMinimized: boolean;
  dockIconOffset: DockIconOffset;
  isShaking: boolean;
  shouldAnimateRestore: boolean;
  isInitialMount: boolean;
  launchOriginOffset: DockIconOffset | null;
}) {
  const {
    isClosing,
    keepMountedWhenMinimized,
    isMinimized,
    dockIconOffset,
    isShaking,
    shouldAnimateRestore,
    isInitialMount,
    launchOriginOffset,
  } = params;

  if (isClosing) {
    return {
      scale: 0.95,
      opacity: 0,
      x: 0,
      y: 0,
      transition: { duration: 0.2, ease: [0.32, 0, 0.67, 0] as const },
    };
  }
  if (keepMountedWhenMinimized && isMinimized) {
    return {
      scale: 0.1,
      opacity: 0,
      x: dockIconOffset.x,
      y: dockIconOffset.y,
      transition: { duration: 0.25, ease: [0.32, 0, 0.67, 0] as const },
    };
  }

  if (isShaking) {
    return {
      scale: 1,
      opacity: 1,
      x: [0, -5, 5, -5, 5, -3, 3, 0],
      y: 0,
      transition: {
        scale: { duration: 0 },
        opacity: { duration: 0 },
        y: { duration: 0 },
        x: shakeTransition,
      },
    };
  }

  const shouldUseLongerTransition =
    shouldAnimateRestore || (isInitialMount && launchOriginOffset);
  return {
    scale: 1,
    opacity: 1,
    x: 0,
    y: 0,
    transition: shouldUseLongerTransition
      ? { duration: 0.25, ease: [0.33, 1, 0.68, 1] as const }
      : { duration: 0.2, ease: [0.33, 1, 0.68, 1] as const },
  };
}
