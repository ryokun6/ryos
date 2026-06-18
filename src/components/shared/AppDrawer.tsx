/**
 * AppDrawer — shared drawer component for ryOS.
 *
 * Default placement:
 *
 *   Desktop (≥ 768 px):  right-side panel that slides out from behind the
 *     window's right edge (translateX).
 *
 *   Mobile (< 768 px):  compact bottom sheet that hangs below the window
 *     frame (top: 100 %) and slides downward to reveal (translateY).
 *
 * If the preferred expansion side would not fit inside the viewport, the
 * drawer first tries the opposite side (left on desktop, top on mobile).
 * If neither side fits, it asks `WindowFrame` to reposition (and if needed
 * also resize) the host window so the canonical side fits.
 *
 * Pass to `WindowFrame` via the `drawer` prop so the panel lives inside the
 * window's coordinate space and follows drag / resize automatically.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { motion, type Transition } from "motion/react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useWindowFrameDrawerContext } from "@/components/shared/WindowFrameDrawerContext";
import {
  resolveDrawerLayout,
  type DrawerPlacement,
} from "@/components/shared/appDrawerLayout";
import {
  osDrawerSurfaceClassName,
  osSeparatorBorderClassName,
} from "@/components/shared/osThemePrimitives";

// ── Shared constants (also re-exported for TvVideoDrawer) ────────────────────

/** Width of the side-drawer panel on desktop. */
export const DRAWER_WIDTH = 268;

// Side-drawer geometry (desktop)
const DRAWER_EDGE_INSET_PX = 4;
const DRAWER_VERTICAL_INSET_PX = 22;
const DRAWER_OPEN_UNDERLAP_PX = 6;

/** How far the drawer protrudes past the window edge when open (used for fit checks). */
const DRAWER_SIDE_PROTRUSION_PX =
  DRAWER_WIDTH - DRAWER_OPEN_UNDERLAP_PX + DRAWER_EDGE_INSET_PX;

// Compact bottom-sheet geometry (mobile) — matches TvVideoDrawer exactly
const COMPACT_DRAWER_MEDIA = "(max-width: 767px)";
const COMPACT_DRAWER_INSET_PX = 12;
/** Negative = overlaps the window's bottom edge upward (covers bottom padding). */
const COMPACT_DRAWER_OVERLAP_TOP_PX = -8;
const COMPACT_DRAWER_MAX_HEIGHT = "min(30dvh, 216px)";
/** Numeric upper bound used for fit calculations (matches the CSS clamp above). */
const COMPACT_DRAWER_MAX_HEIGHT_PX = 216;

/**
 * Spring transition shared by all drawers in ryOS.
 * Import this wherever a panel should feel "of a piece" with the TV chrome.
 */
export const DRAWER_TRANSITION: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 32,
  mass: 0.8,
};

// ── Component ────────────────────────────────────────────────────────────────

export interface AppDrawerProps {
  isOpen: boolean;
  /**
   * Optional close handler.  When provided an × button appears in the header
   * (only shown when `title` is also set, or on its own).
   */
  onClose?: () => void;
  /**
   * Optional title rendered in a themed header bar.
   * When neither `title` nor `onClose` is provided the header is omitted.
   */
  title?: string;
  children: ReactNode;
  /** Extra Tailwind classes forwarded to the outer `motion.div`. */
  className?: string;
  /** Forward arbitrary HTML data-* attributes to the motion wrapper. */
  [key: `data-${string}`]: unknown;
}

export function AppDrawer({
  isOpen,
  onClose,
  title,
  children,
  className,
  ...dataAttrs
}: AppDrawerProps) {
  const {
    isMacOSTheme,
    isSystem7Theme: isSystem7,
    isWindowsTheme,
    isWin98,
  } = useThemeFlags();
  const useGeneva = isMacOSTheme || isSystem7;

  /** True on narrow viewports — mirrors TvVideoDrawer's compact detection. */
  const isCompact = useMediaQuery(COMPACT_DRAWER_MEDIA);

  // ── Placement: prefer the canonical side; fall back to the opposite side
  //    or request a window reposition/resize as needed ─────────────────────
  const windowFrame = useWindowFrameDrawerContext();
  const [placement, setPlacement] = useState<DrawerPlacement>(
    isCompact ? "bottom" : "right"
  );

  // Reset to canonical when toggling between compact and side modes.
  useEffect(() => {
    setPlacement(isCompact ? "bottom" : "right");
  }, [isCompact]);

  // Track viewport size so the layout decision recomputes on resize.
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));
  useEffect(() => {
    const handle = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  // Throttle window-frame requests so we never apply the same adjustment
  // twice in a row (avoids feedback loops with the position useEffect below).
  const lastAdjustRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      lastAdjustRef.current = null;
      return;
    }
    if (!windowFrame) return;
    // Don't fight the user while they drag/resize the window manually.
    if (windowFrame.isInteracting) return;

    const insets = windowFrame.computeInsets();
    const layout = resolveDrawerLayout({
      isCompact,
      window: {
        x: windowFrame.position.x,
        y: windowFrame.position.y,
        width: windowFrame.size.width,
        height: windowFrame.size.height,
      },
      viewport,
      topInset: insets.topInset,
      bottomInset: insets.bottomInset,
      sideProtrusionPx: DRAWER_SIDE_PROTRUSION_PX,
      sheetMaxHeightPx:
        COMPACT_DRAWER_MAX_HEIGHT_PX + Math.abs(COMPACT_DRAWER_OVERLAP_TOP_PX),
      minSize: {
        width: windowFrame.constraints.minWidth,
        height: windowFrame.constraints.minHeight,
      },
      sideMarginPx: 0,
      sheetMarginPx: COMPACT_DRAWER_INSET_PX,
    });

    setPlacement(layout.placement);

    if (layout.windowAdjust) {
      const sig = `${layout.windowAdjust.x},${layout.windowAdjust.y},${layout.windowAdjust.width},${layout.windowAdjust.height}`;
      if (lastAdjustRef.current !== sig) {
        lastAdjustRef.current = sig;
        windowFrame.applyWindowFrame(layout.windowAdjust);
      }
    } else {
      lastAdjustRef.current = null;
    }
  }, [
    isOpen,
    isCompact,
    windowFrame,
    viewport,
    // The hook reads through to position/size; explicit deps so the layout
    // re-evaluates when the user drags or resizes the window manually.
    windowFrame?.position.x,
    windowFrame?.position.y,
    windowFrame?.size.width,
    windowFrame?.size.height,
    windowFrame?.isInteracting,
  ]);

  const showHeader = !!(title || onClose);

  const isSideLayout = placement === "right" || placement === "left";
  const isLeftSide = placement === "left";
  const isTopSheet = placement === "top";

  // ── Panel outer ───────────────────────────────────────────────────────────
  // Side (desktop): rounded on the outward edge.
  // Compact (mobile): rounded on the edge that sticks out of the window.
  const panelOuterClass = osDrawerSurfaceClassName(
    { isMacOSTheme, isSystem7Theme: isSystem7, isWindowsTheme, isWin98 },
    placement
  );

  // ── Header ────────────────────────────────────────────────────────────────
  const headerStyle: React.CSSProperties | undefined = isMacOSTheme
    ? {
        background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
        color: "#222",
        textShadow: "0 1px 0 #e1e1e1",
        borderTop: "1px solid rgba(255,255,255,0.5)",
        borderBottom: "1px solid #787878",
      }
    : undefined;

  const headerClass = cn(
    "shrink-0 flex items-center justify-between select-none",
    isMacOSTheme && "px-2 py-0.5 min-h-[20px]",
    !isMacOSTheme && "px-2 pt-1.5 pb-1",
    isSystem7 && "border-b border-black",
    isWindowsTheme && !isWin98 && cn("border-b", osSeparatorBorderClassName()),
    isWin98 && cn("border-b", osSeparatorBorderClassName())
  );

  const titleClass = cn(
    // Regular weight — not bold (matches OS label conventions)
    "text-[11px] font-normal truncate flex-1",
    useGeneva && "font-geneva-12",
    isWindowsTheme && "font-tahoma",
    isMacOSTheme
      ? "text-[#222]"
      : "opacity-60 text-[9px] uppercase tracking-wide"
  );

  const closeBtnClass = cn(
    "shrink-0 ml-1 flex items-center justify-center rounded p-0.5",
    "focus:outline-none focus-visible:ring-1",
    isMacOSTheme && "text-black/50 hover:bg-black/10 hover:text-black/80 focus-visible:ring-black/30",
    (isSystem7 || isWindowsTheme || isWin98) && "text-black/50 hover:bg-black/10 hover:text-black/80"
  );

  // ── Inner content wrapper (handles macOS layering) ────────────────────────
  const renderInner = () => {
    if (isMacOSTheme) {
      return (
        <div className="os-drawer-metal-inner flex flex-1 min-h-0 flex-col p-2">
          <div
            className="os-drawer-list-well flex flex-1 min-h-0 flex-col overflow-hidden"
            data-placement={placement}
          >
            {showHeader && (
              <div className={headerClass} style={headerStyle}>
                {title && <span className={titleClass}>{title}</span>}
                {onClose && (
                  <button type="button" onClick={onClose} className={closeBtnClass} aria-label="Close">
                    <X size={11} weight="bold" />
                  </button>
                )}
              </div>
            )}
            {children}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-2">
        {showHeader && (
          <div className={headerClass}>
            {title && <span className={titleClass}>{title}</span>}
            {onClose && (
              <button type="button" onClick={onClose} className={closeBtnClass} aria-label="Close">
                <X size={11} weight="bold" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    );
  };

  // ── Compact bottom / top sheet (mobile) ───────────────────────────────────
  if (!isSideLayout) {
    const sheetStyle: React.CSSProperties = isTopSheet
      ? {
          left: COMPACT_DRAWER_INSET_PX,
          right: COMPACT_DRAWER_INSET_PX,
          bottom: "100%",
          top: "auto",
          maxHeight: COMPACT_DRAWER_MAX_HEIGHT,
          height: "auto",
          zIndex: 0,
          marginBottom: COMPACT_DRAWER_OVERLAP_TOP_PX,
          paddingTop: "max(0px, env(safe-area-inset-top, 0px))",
        }
      : {
          left: COMPACT_DRAWER_INSET_PX,
          right: COMPACT_DRAWER_INSET_PX,
          top: "100%",
          bottom: "auto",
          maxHeight: COMPACT_DRAWER_MAX_HEIGHT,
          height: "auto",
          zIndex: 0,
          marginTop: COMPACT_DRAWER_OVERLAP_TOP_PX,
          paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))",
        };

    const closedY = isTopSheet ? "100%" : "-100%";

    return (
      <motion.div
        className={cn("absolute select-none flex flex-col", !isOpen && "pointer-events-none", className)}
        style={sheetStyle}
        initial={false}
        animate={{ x: 0, y: isOpen ? 0 : closedY, opacity: isOpen ? 1 : 0 }}
        transition={DRAWER_TRANSITION}
        aria-hidden={!isOpen}
        data-app-drawer-layout={placement}
        {...(dataAttrs as Record<string, unknown>)}
      >
        <div className={panelOuterClass}>{renderInner()}</div>
      </motion.div>
    );
  }

  // ── Desktop side-drawer (left or right) ───────────────────────────────────
  const openOffset = DRAWER_WIDTH - DRAWER_OPEN_UNDERLAP_PX;
  const sideStyle: React.CSSProperties = isLeftSide
    ? {
        top: DRAWER_VERTICAL_INSET_PX,
        bottom: DRAWER_VERTICAL_INSET_PX,
        width: DRAWER_WIDTH,
        zIndex: 0,
        left: DRAWER_EDGE_INSET_PX,
      }
    : {
        top: DRAWER_VERTICAL_INSET_PX,
        bottom: DRAWER_VERTICAL_INSET_PX,
        width: DRAWER_WIDTH,
        zIndex: 0,
        right: DRAWER_EDGE_INSET_PX,
      };

  return (
    <motion.div
      className={cn("absolute select-none flex flex-col", !isOpen && "pointer-events-none", className)}
      style={sideStyle}
      initial={false}
      animate={{
        x: isOpen ? (isLeftSide ? -openOffset : openOffset) : 0,
        y: 0,
        opacity: isOpen ? 1 : 0,
      }}
      transition={DRAWER_TRANSITION}
      aria-hidden={!isOpen}
      data-app-drawer-layout={placement}
      {...(dataAttrs as Record<string, unknown>)}
    >
      <div className={panelOuterClass}>{renderInner()}</div>
    </motion.div>
  );
}
