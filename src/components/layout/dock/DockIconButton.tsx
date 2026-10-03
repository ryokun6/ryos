import React, {
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { usePointerLongPress } from "@/hooks/usePointerLongPress";
import { prefetchAppChunk } from "@/config/lazyAppComponent";
import { playHaptic } from "@/utils/nativeShellBridge";
import {
  DOCK_BASE_BUTTON_SIZE,
  DOCK_MAGNIFY_DISTANCE,
  DOCK_MAX_SCALE,
} from "./dockConstants";
import type { DockIconButtonProps } from "./dockTypes";
import type { DockPlacement } from "./dockPlacement";
import { DockPlacementContext } from "./DockPlacementContext";

const LOADING_BOUNCE = {
  repeat: Infinity,
  duration: 0.8,
  ease: "easeInOut",
  repeatType: "loop",
} as const;

/** The open-app indicator sits between the icon and the screen edge. */
function indicatorEdgeStyle(
  placement: DockPlacement,
  offset: number,
): React.CSSProperties {
  if (placement === "bottom") return { bottom: offset };
  const centered = { top: "50%", transform: "translateY(-50%)" };
  return placement === "right"
    ? { right: offset, ...centered }
    : { left: offset, ...centered };
}

/** Classic triangle pointing from the screen edge at the icon. */
function classicIndicatorArrow(
  placement: DockPlacement,
  color: string,
): React.CSSProperties {
  const solid = `4px solid ${color}`;
  const clear = "4px solid transparent";
  if (placement === "right") {
    return { borderTop: clear, borderBottom: clear, borderLeft: "0", borderRight: solid };
  }
  if (placement === "left") {
    return { borderTop: clear, borderBottom: clear, borderRight: "0", borderLeft: solid };
  }
  return { borderLeft: clear, borderRight: clear, borderTop: "0", borderBottom: solid };
}

export const DockIconButton = memo(function DockIconButton({
  ref: forwardedRef,
  label,
  onClick,
  icon,
  idKey,
  showIndicator = false,
  isLoading = false,
  isEmoji = false,
  onDragOver,
  onDrop,
  onDragLeave,
  onContextMenu,
  mouseX,
  magnifyEnabled,
  isNew,
  isHovered,
  isSwapping,
  onHover,
  onLeave,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
  isDraggedOutside = false,
  baseSize: baseSizeProp,
  intentPrefetchAppId,
}: DockIconButtonProps & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  const baseButtonSize = baseSizeProp ?? DOCK_BASE_BUTTON_SIZE;
  const maxButtonSize = Math.round(baseButtonSize * DOCK_MAX_SCALE);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isPresent = useIsPresent();
  const { isDarkMode, isAquaGlass } = useThemeFlags();
  const placement = useContext(DockPlacementContext);
  const isSideDock = placement !== "bottom";

  const targetSize = useMotionValue(baseButtonSize);

  useEffect(() => {
    if (!magnifyEnabled) {
      targetSize.set(baseButtonSize);
    }
  }, [baseButtonSize, magnifyEnabled, targetSize]);

  const distanceCalc = useTransform(mouseX, (val) => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds || !Number.isFinite(val)) return Infinity;
    return val - (bounds.left + bounds.width / 2);
  });

  useEffect(() => {
    if (!magnifyEnabled) return;

    const unsubscribe = distanceCalc.on("change", (dist) => {
      if (!Number.isFinite(dist)) {
        targetSize.set(baseButtonSize);
        return;
      }
      const absDist = Math.abs(dist);
      if (absDist > DOCK_MAGNIFY_DISTANCE) {
        targetSize.set(baseButtonSize);
      } else {
        const t = 1 - absDist / DOCK_MAGNIFY_DISTANCE;
        targetSize.set(baseButtonSize + t * (maxButtonSize - baseButtonSize));
      }
    });

    return unsubscribe;
  }, [magnifyEnabled, baseButtonSize, maxButtonSize, distanceCalc, targetSize]);

  const sizeSpring = useSpring(targetSize, {
    mass: 0.15,
    stiffness: 160,
    damping: 18,
  });
  const widthValue = isPresent ? sizeSpring : 0;

  const emojiScale = useTransform(sizeSpring, (val) => val / baseButtonSize);

  const longPressHandlers = usePointerLongPress((event) => {
    if (onContextMenu) {
      playHaptic("medium");
      const syntheticEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: event.clientX,
        clientY: event.clientY,
      } as unknown as React.MouseEvent<HTMLButtonElement>;
      onContextMenu(syntheticEvent);
    }
  });
  const { consumeClickIfLongPressFired: _consumeLongPressClick, ...longPressDomBindings } =
    longPressHandlers;

  const setCombinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef && "current" in (forwardedRef as object)) {
        (
          forwardedRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = node;
      }
    },
    [forwardedRef],
  );

  const runIntentPrefetch = useCallback(() => {
    if (intentPrefetchAppId) prefetchAppChunk(intentPrefetchAppId);
  }, [intentPrefetchAppId]);

  const dragWidth = isDraggedOutside ? 0 : widthValue;
  const dragHeight = isDraggedOutside ? 0 : widthValue;
  const dragMargin = isDraggedOutside ? 0 : isPresent ? 4 : 0;

  return (
    <motion.div
      ref={setCombinedRef}
      layout
      layoutId={`dock-icon-${idKey}`}
      data-dock-icon={idKey}
      initial={isNew ? { scale: 0, opacity: 0 } : undefined}
      animate={{
        scale: 1,
        opacity: isDragging ? 0 : 1,
      }}
      exit={{
        scale: 0,
        opacity: 0,
      }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 36,
        mass: 0.7,
        layout: {
          type: "spring",
          stiffness: 400,
          damping: 30,
        },
      }}
      style={{
        transformOrigin: isSideDock ? "center" : "bottom center",
        willChange: "width, height, transform",
        width: dragWidth,
        height: dragHeight,
        ...(isSideDock
          ? { marginTop: dragMargin, marginBottom: dragMargin }
          : { marginLeft: dragMargin, marginRight: dragMargin }),
        overflow: "visible",
        cursor: draggable ? (isDragging ? "grabbing" : "grab") : "pointer",
      }}
      className="flex-shrink-0 relative"
    >
      <AnimatePresence>
        {/* A side dock scrolls inside its strip, which would clip the label. */}
        {isHovered && !isSideDock && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{
              opacity: 1,
              y: 0,
              x: "-50%",
              transition: { duration: isSwapping ? 0 : 0.05 },
            }}
            exit={{
              opacity: 0,
              y: 5,
              x: "-50%",
              transition: { duration: isSwapping ? 0 : 0.15 },
            }}
            className="absolute bottom-full mb-3 left-1/2 px-3 py-1 bg-neutral-800 text-white/90 text-sm font-medium rounded-full shadow-xl whitespace-nowrap pointer-events-none z-50"
          >
            {label}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-[10px] h-[5px] bg-neutral-800"
              style={{
                clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        aria-label={label}
        title=""
        onClick={(event) => {
          if (_consumeLongPressClick()) return;
          onClick?.(event);
        }}
        onContextMenu={onContextMenu}
        onMouseEnter={() => {
          runIntentPrefetch();
          onHover();
        }}
        onMouseLeave={() => {
          longPressDomBindings.onMouseLeave();
          onLeave();
        }}
        onFocus={runIntentPrefetch}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          runIntentPrefetch();
        }}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        onMouseDown={longPressDomBindings.onMouseDown}
        onMouseMove={longPressDomBindings.onMouseMove}
        onMouseUp={longPressDomBindings.onMouseUp}
        onTouchStart={longPressDomBindings.onTouchStart}
        onTouchMove={longPressDomBindings.onTouchMove}
        onTouchEnd={longPressDomBindings.onTouchEnd}
        onTouchCancel={longPressDomBindings.onTouchCancel}
        className="relative flex items-end justify-center w-full h-full"
        style={{
          willChange: "transform",
        }}
      >
        <motion.div
          className="w-full h-full flex items-end justify-center"
          animate={
            !isLoading
              ? { x: 0, y: 0 }
              : isSideDock
                ? {
                    // Bounce away from the screen edge the dock sits on.
                    x: [0, placement === "left" ? 20 : -20, 0],
                    transition: { x: LOADING_BOUNCE },
                  }
                : {
                    y: [0, -20, 0],
                    transition: { y: LOADING_BOUNCE },
                  }
          }
          transition={{
            x: {
              type: "spring",
              stiffness: 200,
              damping: 20,
            },
            y: {
              type: "spring",
              stiffness: 200,
              damping: 20,
            },
          }}
        >
          {isEmoji ? (
            <motion.span
              className="select-none pointer-events-none flex items-end justify-center"
              style={{
                fontSize: baseButtonSize * 0.84,
                lineHeight: 1,
                originY: 1,
                originX: 0.5,
                scale: magnifyEnabled ? emojiScale : 1,
                y: -5,
                width: "100%",
                height: "100%",
              }}
            >
              {icon}
            </motion.span>
          ) : (
            <ThemedIcon
              name={icon}
              alt={label}
              className="select-none pointer-events-none"
              draggable={false}
              style={{
                imageRendering: "-webkit-optimize-contrast",
                width: "100%",
                height: "100%",
              }}
            />
          )}
        </motion.div>
        {showIndicator ? (
          isAquaGlass ? (
            <span
              aria-hidden
              className="absolute rounded-full"
              style={{
                ...indicatorEdgeStyle(placement, -5),
                width: 4,
                height: 4,
                backgroundColor: isDarkMode
                  ? "rgba(255, 255, 255, 0.6)"
                  : "rgba(0, 0, 0, 0.6)",
                filter: "none",
              }}
            />
          ) : (
            <span
              aria-hidden
              className="absolute"
              style={{
                ...indicatorEdgeStyle(placement, -3),
                width: 0,
                height: 0,
                ...classicIndicatorArrow(placement, isDarkMode ? "#fff" : "#000"),
                filter: "none",
              }}
            />
          )
        ) : null}
      </button>
    </motion.div>
  );
});
