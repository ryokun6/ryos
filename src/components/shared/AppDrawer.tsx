/**
 * AppDrawer — shared drawer component for ryOS.
 *
 * Behaviour matches TvVideoDrawer exactly:
 *
 *   Desktop (≥ 768 px):  right-side panel that slides out from behind the
 *     window's right edge (translateX).  Same spring animation, same
 *     brushed-metal / OS-themed panel shell.
 *
 *   Mobile (< 768 px):  compact bottom sheet that hangs below the window
 *     frame (top: 100 %) and slides downward to reveal (translateY).
 *     Same positioning constants and panel rounding as TV compact mode.
 *
 * Pass to WindowFrame via the `drawer` prop so the panel lives inside the
 * window's coordinate space and follows drag / resize automatically —
 * exactly as TvVideoDrawer does.
 */

import { type ReactNode } from "react";
import { motion, type Transition } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// ── Shared constants (also re-exported for TvVideoDrawer) ────────────────────

/** Width of the side-drawer panel on desktop. */
export const DRAWER_WIDTH = 240;

// Side-drawer geometry (desktop)
const DRAWER_EDGE_INSET_PX = 4;
const DRAWER_VERTICAL_INSET_PX = 22;
const DRAWER_OPEN_UNDERLAP_PX = 6;

// Compact bottom-sheet geometry (mobile) — matches TvVideoDrawer exactly
const COMPACT_DRAWER_MEDIA = "(max-width: 767px)";
const COMPACT_DRAWER_INSET_PX = 12;
/** Negative = overlaps the window's bottom edge upward (covers bottom padding). */
const COMPACT_DRAWER_OVERLAP_TOP_PX = -8;
const COMPACT_DRAWER_MAX_HEIGHT = "min(30dvh, 216px)";

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
  const { t } = useTranslation();
  const currentTheme = useThemeStore((s) => s.current);
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7 = currentTheme === "system7";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isWin98 = currentTheme === "win98";
  const useGeneva = isMacOSTheme || isSystem7;

  /** True on narrow viewports — mirrors TvVideoDrawer's compact detection. */
  const isCompact = useMediaQuery(COMPACT_DRAWER_MEDIA);

  const showHeader = !!(title || onClose);

  // ── Panel outer ───────────────────────────────────────────────────────────
  // Side (desktop): matches TvVideoDrawer's panelOuterClass for side layout.
  // Compact (mobile): matches TvVideoDrawer's compactPanelClass.
  const panelOuterClass = cn(
    "flex flex-1 flex-col overflow-hidden min-h-0",
    isMacOSTheme && cn(
      "os-drawer-metal",
      isCompact ? "rounded-b-[0.45rem]" : "rounded-r-[0.45rem]"
    ),
    !isMacOSTheme && isSystem7 && (
      isCompact
        ? "bg-white border-2 border-black border-t-0 rounded-b shadow-[2px_4px_0_0_rgba(0,0,0,0.45)]"
        : "bg-white border-2 border-black border-l-0 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]"
    ),
    !isMacOSTheme && isXpTheme && !isWin98 && (
      isCompact
        ? "bg-[#ECE9D8] border-[3px] border-t-0 border-[#0054E3] rounded-b-[0.5rem]"
        : "bg-[#ECE9D8] border-[3px] border-l-0 border-[#0054E3] rounded-r-[0.5rem]"
    ),
    !isMacOSTheme && isWin98 && (
      isCompact
        ? "bg-[#C0C0C0] border-2 border-t-0 border-l-white border-r-[#808080] border-b-[#808080]"
        : "bg-[#C0C0C0] border-2 border-l-0 border-t-white border-r-[#808080] border-b-[#808080]"
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
    // macOS: os-drawer-metal → os-drawer-metal-inner → os-drawer-list-well
    if (isMacOSTheme) {
      return (
        <div className="os-drawer-metal-inner flex flex-1 min-h-0 flex-col p-2">
          <div
            className="os-drawer-list-well flex flex-1 min-h-0 flex-col overflow-hidden"
            // Compact: square top edge (flush under window bottom); side: square left edge
            data-compact={isCompact ? "true" : undefined}
          >
            {showHeader && (
              <div className={headerClass} style={headerStyle}>
                {title && <span className={titleClass}>{title}</span>}
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className={closeBtnClass}
                    aria-label={t("common.menu.close")}
                  >
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

    // Non-macOS: flat panel, 2 px padding
    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-2">
        {showHeader && (
          <div className={headerClass}>
            {title && <span className={titleClass}>{title}</span>}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className={closeBtnClass}
                aria-label={t("common.menu.close")}
              >
                <X size={11} weight="bold" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    );
  };

  // ── Compact bottom-sheet (mobile) — matches TV compact mode exactly ───────
  if (isCompact) {
    return (
      <motion.div
        className={cn("absolute select-none flex flex-col", !isOpen && "pointer-events-none", className)}
        style={{
          left: COMPACT_DRAWER_INSET_PX,
          right: COMPACT_DRAWER_INSET_PX,
          top: "100%",
          bottom: "auto",
          maxHeight: COMPACT_DRAWER_MAX_HEIGHT,
          height: "auto",
          zIndex: 0,
          marginTop: COMPACT_DRAWER_OVERLAP_TOP_PX,
          paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))",
        }}
        initial={false}
        animate={{ x: 0, y: isOpen ? 0 : "-100%", opacity: isOpen ? 1 : 0 }}
        transition={DRAWER_TRANSITION}
        aria-hidden={!isOpen}
        data-app-drawer-layout="bottom"
        {...(dataAttrs as Record<string, unknown>)}
      >
        <div className={panelOuterClass}>{renderInner()}</div>
      </motion.div>
    );
  }

  // ── Desktop side-drawer — slides right, same as TV side mode ─────────────
  return (
    <motion.div
      className={cn("absolute select-none flex flex-col", !isOpen && "pointer-events-none", className)}
      style={{
        top: DRAWER_VERTICAL_INSET_PX,
        bottom: DRAWER_VERTICAL_INSET_PX,
        width: DRAWER_WIDTH,
        zIndex: 0,
        right: DRAWER_EDGE_INSET_PX,
      }}
      initial={false}
      animate={{
        x: isOpen ? DRAWER_WIDTH - DRAWER_OPEN_UNDERLAP_PX : 0,
        y: 0,
        opacity: isOpen ? 1 : 0,
      }}
      transition={DRAWER_TRANSITION}
      aria-hidden={!isOpen}
      data-app-drawer-layout="side"
      {...(dataAttrs as Record<string, unknown>)}
    >
      <div className={panelOuterClass}>{renderInner()}</div>
    </motion.div>
  );
}
