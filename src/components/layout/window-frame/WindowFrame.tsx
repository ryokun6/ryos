import { useAppStoreShallow } from "@/stores/useAppStore";
import { useAppStore } from "@/stores/useAppStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useWindowInsets } from "@/hooks/useWindowInsets";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useIsPhone } from "@/hooks/useIsPhone";
import { cn } from "@/lib/utils";
import {
  WindowFrameDrawerContext,
} from "@/components/shared/WindowFrameDrawerContext";
import { motion, AnimatePresence } from "motion/react";
import { selectExposeWindow } from "@/utils/appEventBus";
import type { WindowFrameProps } from "./windowFrameTypes";
import { getSwipeStyle } from "./windowFrameUtils";
import {
  getAnimateState,
  getExitAnimation,
  getInitialAnimation,
} from "./windowFrameAnimations";
import { WindowFrameResizeHandles } from "./WindowFrameResizeHandles";
import { WindowFrameSnapZoneIndicator } from "./WindowFrameSnapZoneIndicator";
import { WindowFrameTitleBar } from "./WindowFrameTitleBar";
import { useWindowFrameConstraints } from "./hooks/useWindowFrameConstraints";
import { useWindowFrameTitlebarAutoHide } from "./hooks/useWindowFrameTitlebarAutoHide";
import { useWindowFrameCloseLifecycle } from "./hooks/useWindowFrameCloseLifecycle";
import { useWindowFrameMaximize } from "./hooks/useWindowFrameMaximize";
import { useWindowFrameDragResize } from "./hooks/useWindowFrameDragResize";
import { useWindowFrameExposeTransform } from "./hooks/useWindowFrameExposeTransform";
import { useWindowFrameDockOffsets } from "./hooks/useWindowFrameDockOffsets";
import { useWindowFrameDrawerSlot } from "./hooks/useWindowFrameDrawerSlot";
import { useWindowFramePhoneSwipe } from "./hooks/useWindowFramePhoneSwipe";
import { useWindowFrameNoTitlebarMouseHandlers } from "./hooks/useWindowFrameNoTitlebarMouseHandlers";

export type { WindowFrameProps } from "./windowFrameTypes";

export function WindowFrame({
  children,
  title,
  onClose,
  isForeground = true,
  isShaking = false,
  appId,
  material = "default",
  skipInitialSound = false,
  windowConstraints = {},
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
  interceptClose = false,
  menuBar,
  keepMountedWhenMinimized = false,
  onFullscreenToggle,
  onCoverFlowToggle,
  isCoverFlowActive = false,
  disableTitlebarAutoHide = false,
  titleBarRightContent,
  drawer,
}: WindowFrameProps) {
  const { mergedConstraints } = useWindowFrameConstraints(appId, windowConstraints);

  const {
    bringInstanceToForeground,
    updateInstanceWindowState,
    minimizeInstance,
    closeAppInstance,
    updateInstanceTitle,
    exposeMode,
    openInstanceCount,
  } = useAppStoreShallow((state) => ({
    bringInstanceToForeground: state.bringInstanceToForeground,
    updateInstanceWindowState: state.updateInstanceWindowState,
    minimizeInstance: state.minimizeInstance,
    closeAppInstance: state.closeAppInstance,
    updateInstanceTitle: state.updateInstanceTitle,
    exposeMode: state.exposeMode,
    openInstanceCount: state.exposeMode
      ? Object.values(state.instances).filter(
          (inst) => inst.isOpen && !inst.isMinimized
        ).length
      : 0,
  }));

  const showResizers = useDisplaySettingsStore((s) => s.showResizers);
  const isMinimized = useAppStore((state) =>
    instanceId ? state.instances[instanceId]?.isMinimized ?? false : false
  );

  const {
    isOpen,
    isClosing,
    isInitialMount,
    isClosingRef,
    shouldAnimateRestore,
    handleClose,
    handleCloseAnimationComplete,
    handleMinimize,
  } = useWindowFrameCloseLifecycle({
    appId,
    instanceId,
    title,
    interceptClose,
    skipInitialSound,
    onClose,
    updateInstanceTitle,
    minimizeInstance,
    closeAppInstance,
    isMinimized,
  });

  const {
    isWindowsTheme: isXpTheme,
    isMacOSTheme,
    isSystem7Theme,
    isWinXp,
  } = useWindowInsets();
  const { isAquaGlass } = useThemeFlags();

  const isTransparent = material === "transparent" || material === "notitlebar";
  const isNoTitlebar = material === "notitlebar";
  const isBrushedMetal = material === "brushedmetal";
  // Regular (default-material) windows under Aqua Glass use the single frosted
  // glass pane. Brushed-metal windows keep their `window-material-brushedmetal`
  // class and are converted to glass purely via CSS overrides (so apps can
  // still opt into the metal material). Transparent / notitlebar materials keep
  // their own treatment.
  const isGlassRegular =
    isAquaGlass && !isTransparent && !isBrushedMetal;
  const effectiveTransparentBackground =
    isMacOSTheme ? true : isTransparent;

  const { isTitlebarHovered, showTitlebarWithAutoHide, hideTitlebar } =
    useWindowFrameTitlebarAutoHide(isNoTitlebar, disableTitlebarAutoHide);

  const noTitlebarMouseHandlers = useWindowFrameNoTitlebarMouseHandlers(
    isNoTitlebar,
    disableTitlebarAutoHide,
    showTitlebarWithAutoHide,
    hideTitlebar
  );

  const isMobile = useIsMobile();
  const isPhone = useIsPhone();

  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isSwiping,
    swipeDirection,
  } = useWindowFramePhoneSwipe({
    appId,
    isPhone,
    isForeground,
    onNavigateNext,
    onNavigatePrevious,
  });

  const {
    windowPosition,
    windowSize,
    windowLeftMotionValue,
    windowTopMotionValue,
    windowWidthMotionValue,
    windowHeightMotionValue,
    isDragging,
    resizeType,
    setWindowSize,
    setWindowPosition,
    snapZone,
    computeWindowInsets,
    shouldAnimateWindowTransition,
    resizerZIndexClass,
    handleMouseDownWithForeground,
    handleResizeStartWithForeground,
  } = useWindowFrameDragResize({
    appId,
    instanceId,
    isForeground,
    isMacOSTheme,
    isXpTheme,
    bringInstanceToForeground,
  });

  const {
    handleHeightOnlyMaximize,
    handleFullMaximize,
    handleTitleBarTap,
  } = useWindowFrameMaximize({
    mergedConstraints,
    windowSize,
    windowPosition,
    instanceId,
    isClosingRef,
    computeWindowInsets,
    setWindowSize,
    setWindowPosition,
    updateInstanceWindowState,
  });

  const { dockIconOffset, launchOriginOffset } = useWindowFrameDockOffsets({
    appId,
    instanceId,
    windowPosition,
    windowSize,
  });

  const exposeTransform = useWindowFrameExposeTransform({
    exposeMode,
    instanceId,
    openInstanceCount,
    windowPosition,
    windowSize,
    isMobile,
  });

  const { drawerContextValue, snapZoneStyle } = useWindowFrameDrawerSlot({
    windowPosition,
    windowSize,
    mergedConstraints,
    isDragging,
    resizeType,
    computeWindowInsets,
    setWindowPosition,
    setWindowSize,
    instanceId,
    updateInstanceWindowState,
    snapZone,
  });

  const shouldShow = keepMountedWhenMinimized
    ? isOpen
    : !isMinimized && isOpen;

  return (
    <>
      <WindowFrameSnapZoneIndicator
        snapZone={snapZone}
        snapZoneStyle={snapZoneStyle}
        isForeground={isForeground}
        isMacOSTheme={isMacOSTheme}
      />
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            key={`pos-${instanceId || appId}`}
            className={cn(
              "absolute p-2 md:p-0",
              keepMountedWhenMinimized &&
                isMinimized &&
                "pointer-events-none"
            )}
            initial={false}
            animate={{
              left: windowPosition.x,
              top: Math.max(0, windowPosition.y),
              width: window.innerWidth >= 768 ? windowSize.width : "100%",
              height: Math.max(
                windowSize.height,
                mergedConstraints.minHeight || 0
              ),
              x: exposeTransform?.translateX ?? 0,
              y: exposeTransform?.translateY ?? 0,
              scale: exposeTransform?.scale ?? 1,
            }}
            transition={
              exposeMode
                ? {
                    duration: 0.4,
                    ease: [0.32, 0.72, 0, 1],
                  }
                : shouldAnimateWindowTransition
                  ? {
                      duration: 0.15,
                      ease: [0.25, 0.1, 0.25, 1],
                    }
                  : {
                      duration: 0,
                    }
            }
            style={{
              // Drag / resize writes window geometry straight into these
              // motion values (no per-frame React render); the `animate` prop
              // above animates the same values for programmatic transitions.
              left: windowLeftMotionValue,
              top: windowTopMotionValue,
              width: windowWidthMotionValue,
              height: windowHeightMotionValue,
              minWidth:
                window.innerWidth >= 768 ? mergedConstraints.minWidth : "100%",
              minHeight: mergedConstraints.minHeight,
              maxWidth: mergedConstraints.maxWidth || undefined,
              maxHeight: mergedConstraints.maxHeight || undefined,
              zIndex: exposeTransform
                ? 10000 + exposeTransform.index
                : undefined,
              cursor: exposeMode ? "pointer" : undefined,
              transformOrigin: "center center",
            }}
            whileHover={
              exposeMode && exposeTransform
                ? {
                    scale: exposeTransform.scale * 1.05,
                    transition: { duration: 0.2 },
                  }
                : undefined
            }
            onClick={(e) => {
              if (exposeMode && instanceId) {
                e.stopPropagation();
                selectExposeWindow({ instanceId });
              }
            }}
          >
            <motion.div
              key={instanceId || appId}
              initial={getInitialAnimation({
                shouldAnimateRestore,
                dockIconOffset,
                isInitialMount,
                launchOriginOffset,
              })}
              animate={getAnimateState({
                isClosing,
                keepMountedWhenMinimized,
                isMinimized,
                dockIconOffset,
                isShaking,
                shouldAnimateRestore,
                isInitialMount,
                launchOriginOffset,
              })}
              onAnimationComplete={() => {
                if (isClosing) {
                  handleCloseAnimationComplete();
                }
              }}
              exit={getExitAnimation({
                keepMountedWhenMinimized,
                dockIconOffset,
              })}
              className={cn(
                "size-full select-none",
                isClosing && "pointer-events-none",
                keepMountedWhenMinimized &&
                  isMinimized &&
                  "pointer-events-none",
                exposeMode && "pointer-events-none"
              )}
              onClick={() => {
                if (!isForeground && instanceId) {
                  bringInstanceToForeground(instanceId);
                }
              }}
              style={{
                transformOrigin: "center",
              }}
            >
              <div className="relative size-full">
                <WindowFrameDrawerContext.Provider value={drawerContextValue}>
                  {drawer}
                </WindowFrameDrawerContext.Provider>

                <WindowFrameResizeHandles
                  resizerZIndexClass={resizerZIndexClass}
                  showResizers={showResizers}
                  resizeType={resizeType}
                  isMobile={isMobile}
                  isXpTheme={isXpTheme}
                  isMacOSTheme={isMacOSTheme}
                  handleResizeStartWithForeground={
                    handleResizeStartWithForeground
                  }
                  handleHeightOnlyMaximize={handleHeightOnlyMaximize}
                />

                <div
                  className={cn(
                    isXpTheme
                      ? "window flex flex-col h-full"
                      : isNoTitlebar && isMacOSTheme
                        ? "window size-full flex flex-col rounded-os overflow-hidden relative"
                        : "window size-full flex flex-col border-[length:var(--os-metrics-border-width)] border-os-window rounded-os overflow-hidden relative",
                    !effectiveTransparentBackground &&
                      !isXpTheme &&
                      "bg-os-window-bg",
                    !isXpTheme &&
                      (!isSystem7Theme || isForeground)
                      ? "shadow-os-window"
                      : "",
                    isForeground ? "is-foreground" : "",
                    isBrushedMetal &&
                      isMacOSTheme &&
                      "window-material-brushedmetal",
                    isGlassRegular && "window-material-glass"
                  )}
                  style={{
                    ...(!isXpTheme
                      ? getSwipeStyle(isPhone, isSwiping, swipeDirection)
                      : undefined),
                  }}
                  onMouseEnter={noTitlebarMouseHandlers.onMouseEnter}
                  onMouseMove={noTitlebarMouseHandlers.onMouseMove}
                  onMouseLeave={noTitlebarMouseHandlers.onMouseLeave}
                >
                  <WindowFrameTitleBar
                    isXpTheme={isXpTheme}
                    isMacOSTheme={isMacOSTheme}
                    isWinXp={isWinXp}
                    isForeground={isForeground}
                    isNoTitlebar={isNoTitlebar}
                    disableTitlebarAutoHide={disableTitlebarAutoHide}
                    isTitlebarHovered={isTitlebarHovered}
                    effectiveTransparentBackground={
                      effectiveTransparentBackground
                    }
                    isBrushedMetal={isBrushedMetal}
                    isGlassSurface={isGlassRegular}
                    isTransparent={isTransparent}
                    showResizers={showResizers}
                    appId={appId}
                    title={title}
                    isPhone={isPhone}
                    titleBarRightContent={titleBarRightContent}
                    onCoverFlowToggle={onCoverFlowToggle}
                    isCoverFlowActive={isCoverFlowActive}
                    onFullscreenToggle={onFullscreenToggle}
                    handleMouseDownWithForeground={
                      handleMouseDownWithForeground
                    }
                    handleFullMaximize={handleFullMaximize}
                    handleTitleBarTap={handleTitleBarTap}
                    handleTouchStart={handleTouchStart}
                    handleTouchMove={handleTouchMove}
                    handleTouchEnd={handleTouchEnd}
                    handleClose={handleClose}
                    handleMinimize={handleMinimize}
                    showTitlebarWithAutoHide={showTitlebarWithAutoHide}
                  />

                  {isXpTheme && menuBar && (
                    <div
                      className="menubar-container"
                      style={{
                        background: "var(--button-face)",
                        borderBottom: "1px solid var(--button-shadow)",
                      }}
                    >
                      {menuBar}
                    </div>
                  )}

                  <div
                    className={cn(
                      "window-body flex flex-1 min-h-0 flex-col md:flex-row relative",
                      isBrushedMetal &&
                        isMacOSTheme &&
                        "ml-[8px] mr-[8px] mb-[8px] rounded-none overflow-hidden"
                    )}
                    style={
                      isXpTheme
                        ? { margin: isWinXp ? "0px 3px" : "0" }
                        : isMacOSTheme
                          ? isTransparent || isBrushedMetal || isAquaGlass
                            ? // Aqua Glass: let the single frosted `.window`
                              // surface show through so the titlebar + body read
                              // as one continuous pane (like brushed metal).
                              undefined
                            : isForeground
                                ? {
                                    backgroundColor: "var(--os-color-window-bg)",
                                    backgroundImage:
                                      "var(--os-pinstripe-window)",
                                  }
                                : {
                                    backgroundColor: "rgba(255,255,255,0.6)",
                                    backgroundImage:
                                      "var(--os-pinstripe-window)",
                                  }
                          : undefined
                    }
                  >
                    {children}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
