import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, type Transition } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getChannelLogo, type Channel } from "@/apps/tv/data/channels";
import {
  clampTvCompactDrawerHeightPx,
  defaultTvCompactDrawerHeightPx,
  getTvCompactDrawerHeightBounds,
  TV_COMPACT_DRAWER_HEIGHT_LS_KEY,
} from "@/apps/tv/utils/compactDrawerHeight";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSound, Sounds } from "@/hooks/useSound";
import { DotsSixVertical, Trash } from "@phosphor-icons/react";

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
  channels: Channel[];
  currentChannelId: string;
  currentVideoIndex: number;
  /** Tunes the TV to the picked channel. */
  onSelectChannel: (channelId: string) => void;
  /** Plays the picked video on the current channel. */
  onSelectVideo: (index: number) => void;
  /**
   * When set (editable channels only), rows show a remove control.
   * Deletes from the backing library (Videos / iPod / custom channel).
   */
  onRemoveVideo?: (videoId: string) => void;
}

function readStoredCompactDrawerHeightPx(): number | null {
  try {
    const raw = window.localStorage.getItem(TV_COMPACT_DRAWER_HEIGHT_LS_KEY);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function getViewportHeightForClamp(): number {
  if (typeof window === "undefined") return 600;
  return (
    window.visualViewport?.height ??
    window.innerHeight ??
    document.documentElement?.clientHeight ??
    600
  );
}

function getChannelInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "TV";
  const words = trimmed.split(/\s+/);
  const chars =
    words.length > 1
      ? words.slice(0, 2).map((word) => word[0])
      : Array.from(trimmed.replace(/\s+/g, "")).slice(0, 2);
  return chars.join("").toUpperCase() || "TV";
}

interface TvChannelLogoStripProps {
  isOpen: boolean;
  channels: Channel[];
  currentChannelId: string;
  onSelectChannel: (channelId: string) => void;
  isMacOSTheme: boolean;
  isSystem7: boolean;
  isXpTheme: boolean;
  isWin98: boolean;
}

const TvChannelLogoStrip = memo(function TvChannelLogoStrip({
  isOpen,
  channels,
  currentChannelId,
  onSelectChannel,
  isMacOSTheme,
  isSystem7,
  isXpTheme,
  isWin98,
}: TvChannelLogoStripProps) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!isOpen) return;
    buttonRefs.current
      .get(currentChannelId)
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [currentChannelId, isOpen]);

  return (
    <div
      className={cn(
        "sticky top-0 z-10 shrink-0 border-b",
        isMacOSTheme && "bg-[#f7f7f7]/95 border-black/15",
        isSystem7 && "bg-white border-black",
        isXpTheme && !isWin98 && "bg-[#ECE9D8] border-[#ACA899]",
        isWin98 && "bg-[#C0C0C0] border-[#808080]"
      )}
    >
      <div
        ref={scrollerRef}
        className="flex gap-2 overflow-x-auto overscroll-x-contain px-2 py-2 [scrollbar-width:thin]"
      >
        {channels.map((channel) => {
          const logo = getChannelLogo(channel.id);
          const isActive = channel.id === currentChannelId;
          const channelLabel = t("apps.tv.channelBadge", {
            number: String(channel.number).padStart(2, "0"),
            name: channel.name,
          });

          return (
            <button
              key={channel.id}
              ref={(node) => {
                if (node) buttonRefs.current.set(channel.id, node);
                else buttonRefs.current.delete(channel.id);
              }}
              type="button"
              onClick={() => onSelectChannel(channel.id)}
              aria-label={channelLabel}
              aria-current={isActive ? "true" : undefined}
              title={channelLabel}
              className={cn(
                "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden p-1 transition focus:outline-none focus-visible:ring-2",
                isMacOSTheme &&
                  "rounded-[5px] border border-black/20 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.18)] hover:bg-white",
                isMacOSTheme &&
                  isActive &&
                  "border-[#2f6fd6] bg-[#dbeaff] ring-2 ring-[#3d84e5]/70",
                isSystem7 &&
                  "rounded-none border border-black bg-white hover:bg-black hover:text-white",
                isSystem7 && isActive && "outline outline-2 outline-black outline-offset-[-4px]",
                isXpTheme &&
                  !isWin98 &&
                  "rounded-[4px] border border-[#7f9db9] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-[#f4f8ff]",
                isXpTheme &&
                  !isWin98 &&
                  isActive &&
                  "border-[#0054E3] bg-[#dce9ff] ring-2 ring-[#316AC5]/50",
                isWin98 &&
                  "rounded-none border-2 border-t-white border-l-white border-b-[#808080] border-r-[#808080] bg-[#C0C0C0]",
                isWin98 &&
                  isActive &&
                  "border-t-[#808080] border-l-[#808080] border-b-white border-r-white bg-[#d8d8d8]"
              )}
            >
              {logo ? (
                <img
                  src={logo}
                  alt=""
                  aria-hidden
                  className="max-h-full max-w-full object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                />
              ) : (
                <span
                  className={cn(
                    "font-geneva-12 text-[10px] font-bold leading-none",
                    isMacOSTheme && "text-black/70",
                    isSystem7 && "font-chicago text-black",
                    isXpTheme && "font-tahoma text-[#1f3f77]",
                    isWin98 && "text-[#202020]"
                  )}
                >
                  {getChannelInitials(channel.name)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

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
  channels,
  currentChannelId,
  currentVideoIndex,
  onSelectChannel,
  onSelectVideo,
  onRemoveVideo,
}: TvVideoDrawerProps) {
  const { t } = useTranslation();
  const isCompactDrawer = useMediaQuery(COMPACT_DRAWER_MEDIA);
  const isMobileUi = useIsMobile();
  const showTrashAlways = isMobileUi;
  const currentTheme = useThemeStore((s) => s.current);
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7 = currentTheme === "system7";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isWin98 = currentTheme === "win98";

  const videos = channel?.videos ?? [];
  const listRef = useRef<HTMLUListElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  /** Viewport height for clamping compact drawer resize (tracks visual viewport on mobile). */
  const [compactViewportH, setCompactViewportH] = useState(
    typeof window !== "undefined" ? getViewportHeightForClamp() : 600
  );
  /** User-resizable playlist height on compact layout; persists in localStorage */
  const [compactDrawerHeightPx, setCompactDrawerHeightPx] = useState(() =>
    typeof window !== "undefined"
      ? defaultTvCompactDrawerHeightPx(window.innerHeight)
      : 200
  );

  useEffect(() => {
    if (!isCompactDrawer) return;

    const syncViewport = () => {
      const vh = getViewportHeightForClamp();
      setCompactViewportH(vh);
      setCompactDrawerHeightPx((prev) =>
        clampTvCompactDrawerHeightPx(prev, vh)
      );
    };

    const vh = getViewportHeightForClamp();
    const stored = readStoredCompactDrawerHeightPx();
    const initialPx =
      stored != null ? clampTvCompactDrawerHeightPx(stored, vh) :
        defaultTvCompactDrawerHeightPx(vh);

    setCompactViewportH(vh);
    setCompactDrawerHeightPx(initialPx);

    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [isCompactDrawer]);

  const compactResizeGestureRef = useRef<{
    startY: number;
    startHeight: number;
    pointerId: number;
    moveListener: ((e: PointerEvent) => void) | null;
    upListener: (() => void) | null;
  } | null>(null);

  const persistCompactDrawerHeight = useCallback((px: number) => {
    try {
      window.localStorage.setItem(
        TV_COMPACT_DRAWER_HEIGHT_LS_KEY,
        String(px)
      );
    } catch {
      /* ignore quota / privacy mode */
    }
  }, []);

  const teardownCompactDrawerPointerResize = useCallback(() => {
    const g = compactResizeGestureRef.current;
    if (!g) return;
    if (g.moveListener) {
      window.removeEventListener("pointermove", g.moveListener);
    }
    if (g.upListener) {
      window.removeEventListener("pointerup", g.upListener);
      window.removeEventListener("pointercancel", g.upListener);
    }
    compactResizeGestureRef.current = null;
  }, []);

  const handleCompactDrawerResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isCompactDrawer || !isMobileUi) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      if (el.setPointerCapture) {
        el.setPointerCapture(e.pointerId);
      }

      const startedAt = compactDrawerHeightPx;
      teardownCompactDrawerPointerResize();
      compactResizeGestureRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: startedAt,
        moveListener: null,
        upListener: null,
      };

      const onMove = (pe: PointerEvent) => {
        const state = compactResizeGestureRef.current;
        if (!state || pe.pointerId !== state.pointerId) return;
        if (pe.pointerType === "mouse" && (pe.buttons & 1) === 0) return;
        const dy = pe.clientY - state.startY;
        const innerH = state.startHeight + dy;
        const vh = getViewportHeightForClamp();
        setCompactViewportH(vh);
        const next = clampTvCompactDrawerHeightPx(innerH, vh);
        setCompactDrawerHeightPx(next);
      };

      const onUp = () => {
        teardownCompactDrawerPointerResize();
        setCompactDrawerHeightPx((prev) => {
          const vh = getViewportHeightForClamp();
          const next = clampTvCompactDrawerHeightPx(prev, vh);
          persistCompactDrawerHeight(next);
          return next;
        });
        if (
          typeof el.releasePointerCapture === "function"
        ) {
          try {
            el.releasePointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);

      if (compactResizeGestureRef.current) {
        compactResizeGestureRef.current.moveListener = onMove;
        compactResizeGestureRef.current.upListener = onUp;
      }
    },
    [
      compactDrawerHeightPx,
      isCompactDrawer,
      isMobileUi,
      persistCompactDrawerHeight,
      teardownCompactDrawerPointerResize,
    ]
  );

  useEffect(
    () => () => teardownCompactDrawerPointerResize(),
    [teardownCompactDrawerPointerResize]
  );

  const { maxPx: compactMaxPx } = useMemo(
    () =>
      getTvCompactDrawerHeightBounds(
        compactViewportH > 0 ? compactViewportH : getViewportHeightForClamp()
      ),
    [compactViewportH]
  );

  const compactDrawerResizeGrip = (
    isCompactDrawer &&
    isMobileUi && (
      <button
        type="button"
        data-testid="tv-compact-drawer-resize-handle"
        aria-label={t("apps.tv.drawer.resizeHandle")}
        className={cn(
          "tv-compact-drawer-resize-handle shrink-0 flex w-full items-center justify-center py-2 touch-none outline-none cursor-ns-resize select-none",
          isMacOSTheme &&
            "border-t border-black/12 bg-black/[0.06] hover:bg-black/10 active:bg-black/[0.14]",
          isSystem7 &&
            "border-t border-black bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300",
          isXpTheme &&
            !isWin98 &&
            "border-t border-[#ACA899] bg-[#ECE9D8] hover:bg-[#dcd8ce] active:bg-[#d0cbc0]",
          isWin98 &&
            "border-t border-[#808080] bg-[#C0C0C0] hover:bg-[#b8b8b8]"
        )}
        style={{ touchAction: "none" }}
        onPointerDown={handleCompactDrawerResizePointerDown}
      >
        <DotsSixVertical
          size={22}
          weight="bold"
          className={cn(
            "pointer-events-none opacity-45",
            isMacOSTheme && "text-black/55",
            isSystem7 && "text-black",
            isXpTheme && !isWin98 && "text-[#1f3f77]/70",
            isWin98 && "text-[#303030]"
          )}
          aria-hidden
        />
      </button>
    )
  );

  // Auto-scroll the now-playing entry into view when the drawer opens
  // or the channel/index changes. Without this, opening the drawer on a
  // long playlist could land miles away from the actively-playing clip.
  useEffect(() => {
    if (!isOpen) return;
    const el = activeItemRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isOpen, channel?.id, currentVideoIndex]);

  // Drawer slide-out / slide-in feedback. Reuses the OS window
  // expand/collapse SFX so the drawer feels of a piece with the rest
  // of WindowFrame's chrome. Skip the initial mount so opening the TV
  // app doesn't fire a phantom drawer sound when the prop defaults to
  // its starting value.
  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const drawerSoundMountedRef = useRef(false);
  useEffect(() => {
    if (!drawerSoundMountedRef.current) {
      drawerSoundMountedRef.current = true;
      return;
    }
    if (isOpen) {
      void playDrawerOpen();
    } else {
      void playDrawerClose();
    }
  }, [isOpen, playDrawerOpen, playDrawerClose]);

  // Visible chrome is playlist-only; expose channel context to AT.
  const listAriaLabel = useMemo(() => {
    if (!channel) return t("apps.tv.drawer.title");
    return t("apps.tv.channelBadge", {
      number: String(channel.number).padStart(2, "0"),
      name: channel.name,
    });
  }, [channel, t]);

  const channelLogoStrip = (
    <TvChannelLogoStrip
      isOpen={isOpen}
      channels={channels}
      currentChannelId={currentChannelId}
      onSelectChannel={onSelectChannel}
      isMacOSTheme={isMacOSTheme}
      isSystem7={isSystem7}
      isXpTheme={isXpTheme}
      isWin98={isWin98}
    />
  );

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
        height: compactDrawerHeightPx,
        minHeight: compactDrawerHeightPx,
        maxHeight: compactMaxPx,
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
              {channelLogoStrip}
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
                        className="group relative min-w-0"
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
                        {onRemoveVideo && (
                          <button
                            type="button"
                            aria-label={t("apps.tv.drawer.removeVideo")}
                            title={t("apps.tv.drawer.removeVideo")}
                            className={cn(
                              "tv-drawer-remove-btn absolute right-1 top-1/2 z-[1] flex -translate-y-1/2 items-center justify-center rounded-[4px] p-1 transition-opacity duration-150",
                              "focus:outline-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#3875D7]/60",
                              showTrashAlways
                                ? "pointer-events-auto opacity-100"
                                : cn(
                                    "pointer-events-none opacity-0",
                                    "group-hover:pointer-events-auto group-hover:opacity-100",
                                    "group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                                  ),
                              "text-black/45 hover:bg-red-600/14 hover:text-red-700",
                              isActive &&
                                "text-white/75 hover:text-white hover:bg-white/18"
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onRemoveVideo(video.id);
                            }}
                          >
                            <Trash
                              size={14}
                              weight="regular"
                              className="pointer-events-none shrink-0"
                            />
                          </button>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
              {compactDrawerResizeGrip}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-2">
            {channelLogoStrip}
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
                      className="group relative min-w-0"
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
                      {onRemoveVideo && (
                        <button
                          type="button"
                          aria-label={t("apps.tv.drawer.removeVideo")}
                          title={t("apps.tv.drawer.removeVideo")}
                          className={cn(
                            "tv-drawer-remove-btn absolute right-1 top-1/2 z-[1] flex -translate-y-1/2 items-center justify-center p-1 transition-opacity duration-150",
                            "focus:outline-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-1",
                            showTrashAlways
                              ? "pointer-events-auto opacity-100"
                              : cn(
                                  "pointer-events-none opacity-0",
                                  "group-hover:pointer-events-auto group-hover:opacity-100",
                                  "group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                                ),
                            isSystem7 &&
                              cn(
                                "rounded-none border border-transparent",
                                isActive
                                  ? "text-white/75 hover:text-white hover:bg-white/15 hover:border-white/25 focus-visible:ring-white/60"
                                  : "text-black/55 hover:text-red-700 hover:bg-black/[0.06] hover:border-black/15"
                              ),
                            isXpTheme &&
                              !isWin98 &&
                              cn(
                                "rounded-sm",
                                isActive
                                  ? "text-white/85 hover:text-white hover:bg-white/18 focus-visible:ring-white/70"
                                  : "text-black/50 hover:text-red-700 hover:bg-red-500/12 focus-visible:ring-[#316AC5]/50"
                              ),
                            isWin98 &&
                              "rounded-none border border-transparent text-[#303030] hover:text-[#c00000] hover:bg-[#c0c0c0] hover:border-[#808080] focus-visible:ring-[#000080]/40"
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemoveVideo(video.id);
                          }}
                        >
                          <Trash
                            size={14}
                            weight="regular"
                            className="pointer-events-none shrink-0"
                          />
                        </button>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
            {compactDrawerResizeGrip}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export const TV_DRAWER_WIDTH = DRAWER_WIDTH;
