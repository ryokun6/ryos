import { memo, useEffect, useMemo, useRef } from "react";
import { motion, type Transition } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Channel } from "@/apps/tv/data/channels";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DRAWER_WIDTH = 240;

/** Small gap from the window’s right edge; keeps a hint of tuck without clipping the playlist. */
const DRAWER_EDGE_INSET_PX = 4;

/** Pixels of drawer width that stay behind the main pane when open — keep low so row numbers stay visible. */
const DRAWER_OPEN_UNDERLAP_PX = 6;

/** Equal top/bottom inset inside the window frame — lower = taller drawer. */
const DRAWER_VERTICAL_INSET_PX = 22;

/** Viewports below this width use a bottom sheet instead of a side drawer (matches WindowFrame mobile layout). */
const COMPACT_DRAWER_MEDIA = "(max-width: 767px)";

/** Horizontal inset for the compact bottom drawer (each side). */
const COMPACT_DRAWER_INSET_PX = 12;

/**
 * Negative overlap upward so the drawer covers the window body’s bottom inset.
 * Matches macOS brushed-metal `mb-[8px]` on the TV window content in WindowFrame.
 */
const COMPACT_DRAWER_OVERLAP_TOP_PX = -8;

/** Compact drawer height cap — scroll inside for long playlists. */
const COMPACT_DRAWER_MAX_HEIGHT = "min(28dvh, 200px)";

// Slow enough to read as a real "panel sliding out" but fast enough to
// not feel laggy. Matches the cadence of the channel-switch animation
// in the rest of the TV app.
const DRAWER_TRANSITION: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 32,
  mass: 0.8,
};

interface TvVideoDrawerProps {
  isOpen: boolean;
  channel: Channel | null;
  currentVideoIndex: number;
  /** Plays the picked video on the current channel. */
  onSelectVideo: (index: number) => void;
}

/**
 * Classic Mac-OS-X-style drawer attached to the right edge of the TV
 * window. Playlist only (no header chrome); toggle via Controls → Show Videos.
 *
 * Rendered inside `WindowFrame`'s drawer slot, which positions it in
 * the window's coordinate space — meaning it pins to the window during
 * drag/resize and inherits its z-stack. Closed: `translateX(0)` (fully
 * behind the window body). Open: translates by slightly less than the
 * panel width so only a few pixels stay overlapped by the main window.
 *
 * On narrow viewports (max-width: 767px), the panel hangs below the window
 * frame (same stacking as the side drawer) and slides downward when opened —
 * it does not cover the video area.
 */
export const TvVideoDrawer = memo(function TvVideoDrawer({
  isOpen,
  channel,
  currentVideoIndex,
  onSelectVideo,
}: TvVideoDrawerProps) {
  const { t } = useTranslation();
  const isCompactDrawer = useMediaQuery(COMPACT_DRAWER_MEDIA);
  const currentTheme = useThemeStore((s) => s.current);
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7 = currentTheme === "system7";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isWin98 = currentTheme === "win98";

  const videos = channel?.videos ?? [];
  const listRef = useRef<HTMLUListElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  // Auto-scroll the now-playing entry into view when the drawer opens
  // or the channel/index changes. Without this, opening the drawer on a
  // long playlist could land miles away from the actively-playing clip.
  useEffect(() => {
    if (!isOpen) return;
    const el = activeItemRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isOpen, channel?.id, currentVideoIndex]);

  // Visible chrome is playlist-only; expose channel context to AT.
  const listAriaLabel = useMemo(() => {
    if (!channel) return t("apps.tv.drawer.title");
    return t("apps.tv.channelBadge", {
      number: String(channel.number).padStart(2, "0"),
      name: channel.name,
    });
  }, [channel, t]);

  const wrapperClass = cn(
    "absolute select-none flex flex-col"
  );

  // Outer shell: macOS uses `.tv-drawer-metal` in themes.css (brushed
  // aluminum + inset gloss like the TV window). Other themes keep flat chrome.
  const panelOuterClass = cn(
    "flex flex-1 flex-col overflow-hidden min-h-0",
    isMacOSTheme &&
      cn(
        "tv-drawer-metal",
        !isCompactDrawer && "rounded-r-[0.45rem]",
        isCompactDrawer && "rounded-b-[0.45rem]"
      ),
    !isMacOSTheme &&
      isSystem7 &&
      (isCompactDrawer
        ? "bg-white border-2 border-black border-t-0 rounded-b shadow-[2px_4px_0_0_rgba(0,0,0,0.45)]"
        : "bg-white border-2 border-black border-l-0 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]"),
    !isMacOSTheme &&
      isXpTheme &&
      !isWin98 &&
      (isCompactDrawer
        ? "bg-[#ECE9D8] border-[3px] border-t-0 border-[#0054E3] rounded-b-[0.5rem]"
        : "bg-[#ECE9D8] border-[3px] border-l-0 border-[#0054E3] rounded-r-[0.5rem]"),
    !isMacOSTheme &&
      isWin98 &&
      (isCompactDrawer
        ? "bg-[#C0C0C0] border-2 border-t-0 border-l-white border-r-[#808080] border-b-[#808080]"
        : "bg-[#C0C0C0] border-2 border-l-0 border-t-white border-r-[#808080] border-b-[#808080]")
  );

  const listUlClass = cn(
    "flex-1 min-h-0 overflow-y-auto",
    !isMacOSTheme && "bg-white"
  );

  const positionStyle = isCompactDrawer
    ? ({
        left: COMPACT_DRAWER_INSET_PX,
        right: COMPACT_DRAWER_INSET_PX,
        top: "100%",
        bottom: "auto",
        maxHeight: COMPACT_DRAWER_MAX_HEIGHT,
        height: "auto",
        zIndex: 0,
        marginTop: COMPACT_DRAWER_OVERLAP_TOP_PX,
        paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))",
      } as const)
    : ({
        top: DRAWER_VERTICAL_INSET_PX,
        bottom: DRAWER_VERTICAL_INSET_PX,
        width: DRAWER_WIDTH,
        zIndex: 0,
        right: DRAWER_EDGE_INSET_PX,
      } as const);

  const animateProps = isCompactDrawer
    ? {
        x: 0,
        // Closed: tucked upward under the window bottom edge; open: drops down.
        y: isOpen ? 0 : "-100%",
        opacity: isOpen ? 1 : 0,
      }
    : {
        x: isOpen ? DRAWER_WIDTH - DRAWER_OPEN_UNDERLAP_PX : 0,
        y: 0,
        opacity: isOpen ? 1 : 0,
      };

  return (
    <motion.div
      className={cn(wrapperClass, !isOpen && "pointer-events-none")}
      style={positionStyle}
      initial={false}
      animate={animateProps}
      transition={DRAWER_TRANSITION}
      // Side drawer: closed behind content. Compact: hangs below the window;
      // closed state is tucked up with translateY — suppress hits when closed.
      aria-hidden={!isOpen}
      data-tv-drawer
      data-tv-drawer-layout={isCompactDrawer ? "bottom" : "side"}
    >
      <div className={panelOuterClass}>
        {isMacOSTheme ? (
          <div className="tv-drawer-metal-inner flex flex-1 min-h-0 flex-col p-2">
            <div className="tv-drawer-mac-list-well flex flex-1 min-h-0 flex-col overflow-hidden">
              <ul
                ref={listRef}
                className={listUlClass}
                aria-label={listAriaLabel}
              >
                {videos.length === 0 ? (
                  <li className="px-3 py-2 font-lucida-grande text-[11px] opacity-60">
                    {t("apps.tv.drawer.empty")}
                  </li>
                ) : (
                  videos.map((video, index) => {
                    const isActive = index === currentVideoIndex;
                    return (
                      <li
                        key={`${video.id}-${index}`}
                        ref={isActive ? activeItemRef : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectVideo(index)}
                          className={cn(
                            "w-full text-left px-3 py-1.5 flex items-center gap-2",
                            "focus:outline-none transition-colors duration-100",
                            "font-lucida-grande text-[11px] text-black/90 hover:bg-[#3875D7]/12",
                            isActive && "tv-drawer-mac-row-active"
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0 w-5 text-right tabular-nums opacity-70",
                              isActive && "opacity-100"
                            )}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="flex-1 min-w-0 truncate">
                            {video.title}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-2">
            <ul
              ref={listRef}
              className={listUlClass}
              aria-label={listAriaLabel}
            >
              {videos.length === 0 ? (
                <li
                  className={cn(
                    "px-3 py-2 text-[11px] opacity-60",
                    isSystem7 && "font-chicago",
                    isXpTheme && "font-tahoma"
                  )}
                >
                  {t("apps.tv.drawer.empty")}
                </li>
              ) : (
                videos.map((video, index) => {
                  const isActive = index === currentVideoIndex;
                  return (
                    <li
                      key={`${video.id}-${index}`}
                      ref={isActive ? activeItemRef : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectVideo(index)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 flex items-center gap-2",
                          "focus:outline-none transition-colors duration-100",
                          isSystem7 &&
                            "font-chicago text-[12px] hover:bg-black hover:text-white",
                          isXpTheme &&
                            "font-tahoma text-[11px] hover:bg-[#316AC5]/15",
                          isActive &&
                            isSystem7 &&
                            "bg-black text-white hover:bg-black hover:text-white",
                          isActive &&
                            isXpTheme &&
                            "bg-[#316AC5] text-white hover:bg-[#316AC5]"
                        )}
                      >
                        <span
                          className={cn(
                            "shrink-0 w-5 text-right tabular-nums opacity-70",
                            isActive && "opacity-100"
                          )}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 min-w-0 truncate">
                          {video.title}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
});

export const TV_DRAWER_WIDTH = DRAWER_WIDTH;
