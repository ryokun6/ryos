import { memo, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getChannelLogo, type Channel } from "@/apps/tv/data/channels";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSound, Sounds } from "@/hooks/useSound";
import { Trash } from "@phosphor-icons/react";
import { AppDrawer, DRAWER_WIDTH, DRAWER_TRANSITION } from "@/components/shared/AppDrawer";

// ── Layout constants ──────────────────────────────────────────────────────────

/** Viewports below this width use a bottom sheet instead of a side drawer. */
const COMPACT_DRAWER_MEDIA = "(max-width: 767px)";

/** Horizontal inset for the compact bottom drawer (each side). */
const COMPACT_DRAWER_INSET_PX = 12;

/**
 * Negative overlap upward so the drawer covers the window body's bottom inset.
 * Matches macOS brushed-metal `mb-[8px]` on the TV window content in WindowFrame.
 */
const COMPACT_DRAWER_OVERLAP_TOP_PX = -8;

/** Compact drawer height cap — scroll inside for long playlists. */
const COMPACT_DRAWER_MAX_HEIGHT = "min(30dvh, 216px)";

// Re-export so callers that previously imported from this module still work.
export { DRAWER_WIDTH, DRAWER_TRANSITION };

// ── Channel logo strip ────────────────────────────────────────────────────────

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

// ── Main drawer component ─────────────────────────────────────────────────────

interface TvVideoDrawerProps {
  isOpen: boolean;
  channel: Channel | null;
  channels: Channel[];
  currentChannelId: string;
  currentVideoIndex: number;
  onSelectChannel: (channelId: string) => void;
  onSelectVideo: (index: number) => void;
  onRemoveVideo?: (videoId: string) => void;
}

/**
 * Classic Mac-OS-X-style drawer attached to the right edge of the TV window.
 *
 * Desktop (≥ 768 px):  delegates to the shared AppDrawer component (side
 * panel, slides right).  The TV-specific brushed-metal shell is handled by
 * AppDrawer; this component only supplies the channel strip + video list.
 *
 * Narrow (< 768 px):   renders a compact bottom sheet that hangs below the
 * window frame and slides down to reveal.  That layout is too TV-specific
 * (hangs outside the window, overlaps the bottom edge) for a shared component,
 * so it is implemented locally with its own motion.div.
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

  useEffect(() => {
    if (!isOpen) return;
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isOpen, channel?.id, currentVideoIndex]);

  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const drawerSoundMountedRef = useRef(false);
  useEffect(() => {
    if (!drawerSoundMountedRef.current) {
      drawerSoundMountedRef.current = true;
      return;
    }
    if (isOpen) void playDrawerOpen();
    else void playDrawerClose();
  }, [isOpen, playDrawerOpen, playDrawerClose]);

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

  const listUlClass = cn("flex-1 min-h-0 overflow-y-auto", !isMacOSTheme && "bg-white");

  // ── Shared video list renderer ─────────────────────────────────────────────
  const renderMacVideoItems = () =>
    videos.length === 0 ? (
      <li className="px-3 py-2 font-lucida-grande text-[11px] opacity-60">
        {t("apps.tv.drawer.empty")}
      </li>
    ) : (
      videos.map((video, index) => {
        const isActive = index === currentVideoIndex;
        return (
          <li key={`${video.id}-${index}`} ref={isActive ? activeItemRef : undefined} className="group relative min-w-0">
            <button
              type="button"
              onClick={() => onSelectVideo(index)}
              className={cn(
                "w-full text-left px-3 py-1.5 flex items-center gap-2 focus:outline-none transition-colors duration-100",
                "font-lucida-grande text-[11px] text-black/90 hover:bg-[#3875D7]/12",
                isActive && "tv-drawer-mac-row-active"
              )}
            >
              <span className={cn("shrink-0 w-5 text-right tabular-nums opacity-70", isActive && "opacity-100")}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 min-w-0 truncate">{video.title}</span>
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
                    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                  "text-black/45 hover:bg-red-600/14 hover:text-red-700",
                  isActive && "text-white/75 hover:text-white hover:bg-white/18"
                )}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveVideo(video.id); }}
              >
                <Trash size={14} weight="regular" className="pointer-events-none shrink-0" />
              </button>
            )}
          </li>
        );
      })
    );

  const renderOtherVideoItems = () =>
    videos.length === 0 ? (
      <li className={cn("px-3 py-2 text-[11px] opacity-60", isSystem7 && "font-chicago", isXpTheme && "font-tahoma")}>
        {t("apps.tv.drawer.empty")}
      </li>
    ) : (
      videos.map((video, index) => {
        const isActive = index === currentVideoIndex;
        return (
          <li key={`${video.id}-${index}`} ref={isActive ? activeItemRef : undefined} className="group relative min-w-0">
            <button
              type="button"
              onClick={() => onSelectVideo(index)}
              className={cn(
                "w-full text-left px-3 py-1.5 flex items-center gap-2 focus:outline-none transition-colors duration-100",
                isSystem7 && "font-chicago text-[12px] hover:bg-black hover:text-white",
                isXpTheme && "font-tahoma text-[11px] hover:bg-[#316AC5]/15",
                isActive && isSystem7 && "bg-black text-white hover:bg-black hover:text-white",
                isActive && isXpTheme && "bg-[#316AC5] text-white hover:bg-[#316AC5]"
              )}
            >
              <span className={cn("shrink-0 w-5 text-right tabular-nums opacity-70", isActive && "opacity-100")}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 min-w-0 truncate">{video.title}</span>
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
                    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                  isSystem7 && cn(
                    "rounded-none border border-transparent",
                    isActive
                      ? "text-white/75 hover:text-white hover:bg-white/15 hover:border-white/25 focus-visible:ring-white/60"
                      : "text-black/55 hover:text-red-700 hover:bg-black/[0.06] hover:border-black/15"
                  ),
                  isXpTheme && !isWin98 && cn(
                    "rounded-sm",
                    isActive
                      ? "text-white/85 hover:text-white hover:bg-white/18 focus-visible:ring-white/70"
                      : "text-black/50 hover:text-red-700 hover:bg-red-500/12 focus-visible:ring-[#316AC5]/50"
                  ),
                  isWin98 && "rounded-none border border-transparent text-[#303030] hover:text-[#c00000] hover:bg-[#c0c0c0] hover:border-[#808080] focus-visible:ring-[#000080]/40"
                )}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveVideo(video.id); }}
              >
                <Trash size={14} weight="regular" className="pointer-events-none shrink-0" />
              </button>
            )}
          </li>
        );
      })
    );

  // ── Content (shared between side and compact paths) ────────────────────────
  const drawerContent = (
    <>
      {channelLogoStrip}
      <ul ref={listRef} className={listUlClass} aria-label={listAriaLabel}>
        {isMacOSTheme ? renderMacVideoItems() : renderOtherVideoItems()}
      </ul>
    </>
  );

  // ── Desktop side drawer — delegates to shared AppDrawer ───────────────────
  // AppDrawer owns positioning, spring animation, and the themed panel shell.
  // The TV passes its channel strip + video list as children.
  if (!isCompactDrawer) {
    return (
      <AppDrawer isOpen={isOpen} data-tv-drawer data-tv-drawer-layout="side">
        {drawerContent}
      </AppDrawer>
    );
  }

  // ── Compact bottom sheet (narrow viewports) ───────────────────────────────
  // This layout hangs *below* the window frame (top: 100 %) and slides down
  // to reveal.  That positioning is too TV-specific for the shared AppDrawer,
  // so it is implemented with its own motion.div.
  const compactPanelClass = cn(
    "flex flex-1 flex-col overflow-hidden min-h-0",
    isMacOSTheme && "tv-drawer-metal rounded-b-[0.45rem]",
    !isMacOSTheme && isSystem7 && "bg-white border-2 border-black border-t-0 rounded-b shadow-[2px_4px_0_0_rgba(0,0,0,0.45)]",
    !isMacOSTheme && isXpTheme && !isWin98 && "bg-[#ECE9D8] border-[3px] border-t-0 border-[#0054E3] rounded-b-[0.5rem]",
    !isMacOSTheme && isWin98 && "bg-[#C0C0C0] border-2 border-t-0 border-l-white border-r-[#808080] border-b-[#808080]"
  );

  return (
    <motion.div
      className={cn("absolute select-none flex flex-col", !isOpen && "pointer-events-none")}
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
      data-tv-drawer
      data-tv-drawer-layout="bottom"
    >
      <div className={compactPanelClass}>
        {isMacOSTheme ? (
          <div className="tv-drawer-metal-inner flex flex-1 min-h-0 flex-col p-2">
            <div className="tv-drawer-mac-list-well flex flex-1 min-h-0 flex-col overflow-hidden" style={{ borderRadius: "0 0 4px 4px" }}>
              {drawerContent}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-2">
            {drawerContent}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export const TV_DRAWER_WIDTH = DRAWER_WIDTH;
