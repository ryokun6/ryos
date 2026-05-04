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
import { motion, type Transition } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useWindowFrameDrawerContext } from "@/components/shared/WindowFrameDrawerContext";
import {
  resolveDrawerLayout,
  type DrawerPlacement,
} from "@/components/shared/appDrawerLayout";

// ── Shared constants (also re-exported for TvVideoDrawer) ────────────────────

/** Width of the side-drawer panel on desktop. */
export const DRAWER_WIDTH = 240;

// Side-drawer geometry (desktop)
const DRAWER_EDGE_INSET_PX = 4;
const DRAWER_VERTICAL_INSET_PX = 22;
const DRAWER_OPEN_UNDERLAP_PX = 6;

/** How far the drawer protrudes past the window edge when open (used for fit checks). */
const DRAWER_SIDE_PROTRUSION_PX =
  DRAWER_WIDTH - DRAWER_OPEN_UNDERLAP_PX + DRAWER_EDGE_INSET_PX;

/**
 * When open, the drawer must paint above the main `.window` body (drawer slot
 * is rendered before it in DOM order). Otherwise the tray is only visible in
 * the narrow strip past the window’s right edge — often clipped off-screen when
 * the window is flush with the viewport. Stay below `WindowFrame`’s resize
 * layer (`z-[60]` on macOS) so resize handles still receive events.
 */
const DRAWER_OPEN_Z_INDEX = 55;

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
  const currentTheme = useThemeStore((s) => s.current);
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7 = currentTheme === "system7";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isWin98 = currentTheme === "win98";
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
  const panelOuterClass = cn(
    "flex flex-1 flex-col overflow-hidden min-h-0",
    isMacOSTheme &&
      cn(
        "os-drawer-metal",
        placement === "right" && "rounded-r-[0.45rem]",
        placement === "left" && "rounded-l-[0.45rem]",
        placement === "bottom" && "rounded-b-[0.45rem]",
        placement === "top" && "rounded-t-[0.45rem]"
      ),
    !isMacOSTheme && isSystem7 && (
      placement === "right"
        ? "bg-white border-2 border-black border-l-0 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]"
        : placement === "left"
        ? "bg-white border-2 border-black border-r-0 rounded-l shadow-[-2px_2px_0_0_rgba(0,0,0,0.5)]"
        : placement === "bottom"
        ? "bg-white border-2 border-black border-t-0 rounded-b shadow-[2px_4px_0_0_rgba(0,0,0,0.45)]"
        : "bg-white border-2 border-black border-b-0 rounded-t shadow-[2px_-4px_0_0_rgba(0,0,0,0.45)]"
    ),
    !isMacOSTheme && isXpTheme && !isWin98 && (
      placement === "right"
        ? "bg-[#ECE9D8] border-[3px] border-l-0 border-[#0054E3] rounded-r-[0.5rem]"
        : placement === "left"
        ? "bg-[#ECE9D8] border-[3px] border-r-0 border-[#0054E3] rounded-l-[0.5rem]"
        : placement === "bottom"
        ? "bg-[#ECE9D8] border-[3px] border-t-0 border-[#0054E3] rounded-b-[0.5rem]"
        : "bg-[#ECE9D8] border-[3px] border-b-0 border-[#0054E3] rounded-t-[0.5rem]"
    ),
    !isMacOSTheme && isWin98 && (
      placement === "right"
        ? "bg-[#C0C0C0] border-2 border-l-0 border-t-white border-r-[#808080] border-b-[#808080]"
        : placement === "left"
        ? "bg-[#C0C0C0] border-2 border-r-0 border-t-white border-l-white border-b-[#808080]"
        : placement === "bottom"
        ? "bg-[#C0C0C0] border-2 border-t-0 border-l-white border-r-[#808080] border-b-[#808080]"
        : "bg-[#C0C0C0] border-2 border-b-0 border-l-white border-r-[#808080] border-t-white"
    )
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
    isXpTheme && !isWin98 && "border-b border-[#ACA899]",
    isWin98 && "border-b border-[#808080]"
  );

  const titleClass = cn(
    // Regular weight — not bold (matches OS label conventions)
    "text-[11px] font-normal truncate flex-1",
    useGeneva && "font-geneva-12",
    isXpTheme && "font-tahoma",
    isMacOSTheme
      ? "text-[#222]"
      : "opacity-60 text-[9px] uppercase tracking-wide"
  );

  const closeBtnClass = cn(
    "shrink-0 ml-1 flex items-center justify-center rounded p-0.5",
    "focus:outline-none focus-visible:ring-1",
    isMacOSTheme && "text-black/50 hover:bg-black/10 hover:text-black/80 focus-visible:ring-black/30",
    (isSystem7 || isXpTheme || isWin98) && "text-black/50 hover:bg-black/10 hover:text-black/80"
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
          zIndex: isOpen ? DRAWER_OPEN_Z_INDEX : 0,
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
          zIndex: isOpen ? DRAWER_OPEN_Z_INDEX : 0,
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
        zIndex: isOpen ? DRAWER_OPEN_Z_INDEX : 0,
        left: DRAWER_EDGE_INSET_PX,
      }
    : {
        top: DRAWER_VERTICAL_INSET_PX,
        bottom: DRAWER_VERTICAL_INSET_PX,
        width: DRAWER_WIDTH,
        zIndex: isOpen ? DRAWER_OPEN_Z_INDEX : 0,
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
