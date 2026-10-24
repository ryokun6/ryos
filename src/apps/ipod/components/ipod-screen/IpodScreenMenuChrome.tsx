import { type RefObject, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Repeat, RepeatOnce, Shuffle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  BatteryIndicator,
  Scrollbar,
  MenuListItem,
  ScrollingText,
  IpodModernPlayPauseIcon,
} from "../screen";
import { IPOD_MODERN_MENU_BODY_HEIGHT_PX } from "../../constants";
import type { MenuHistoryEntry, MenuItem } from "../../types";
import type { Track } from "@/shared/media/library";
import {
  MENU_ITEM_HEIGHT_MODERN_MEDIA,
  MODERN_MEDIA_BODY_SLACK_PX,
  MODERN_MENU_BODY_SLACK_PX,
  MODERN_TITLEBAR_HEIGHT,
  menuVariants,
} from "./constants";
import {
  useMenuSlideTransition,
  usePrefersReducedMotion,
} from "./useMenuSlideTransition";
import { formatPlaybackTime } from "./formatPlaybackTime";
import { ModernNowPlayingArtwork } from "./ModernNowPlayingArtwork";
import {
  SCRUB_DIAMOND_RING_PX,
  SCRUB_DIAMOND_SIZE_PX,
  scrubDiamondLeftCss,
  scrubDiamondRingColor,
} from "../../utils/wheelGesture";

export interface IpodScreenMenuChromeProps {
  isModernUi: boolean;
  showSplitMenuArt: boolean;
  titlebarTitle: string;
  modernScrollingMarqueeAllowed: boolean;
  isPlaying: boolean;
  backlightOn: boolean;
  uiVariant: "classic" | "modern";
  menuMode: boolean;
  appleMusicMenuTitlebarLoading: boolean;
  showVideo: boolean;
  showInlineCoverFlow: boolean;
  menuDirection: "forward" | "backward";
  coverFlowSlot?: ReactNode;
  menuHistory: MenuHistoryEntry[];
  currentMenuTitle: string;
  setMenuScrollRef: (el: HTMLDivElement | null) => void;
  menuItemHeight: number;
  currentMenuItems: MenuItem[];
  visibleRange: { start: number; end: number };
  selectedMenuItem: number;
  onSelectMenuItem: (index: number) => void;
  onMenuItemAction: (action: () => void) => void;
  currentMenuModernMediaList: boolean;
  menuLabelLayoutKey: string;
  menuScrollRef: RefObject<HTMLDivElement | null>;
  fastScrollLetter: string | null;
  currentTrack: Track | null;
  nowPlayingDisplayTrack: Track | null;
  isAppleMusicCollectionShell: boolean;
  tracksLength: number;
  currentIndex: number;
  isShuffled: boolean;
  loopCurrent: boolean;
  loopAll: boolean;
  coverUrl: string | null;
  elapsedTime: number;
  totalTime: number;
  displayElapsedSeconds: number;
  displayRemainingSeconds: number;
  showVolumeOverlay: boolean;
  scrubbing: boolean;
  ipodVolume: number;
  registerActivity: () => void;
  handlePlay: () => void;
  showVideoProp: boolean;
  onToggleVideo: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function IpodScreenMenuChrome({
  isModernUi,
  showSplitMenuArt,
  titlebarTitle,
  modernScrollingMarqueeAllowed,
  isPlaying,
  backlightOn,
  uiVariant,
  menuMode,
  appleMusicMenuTitlebarLoading,
  showVideo,
  showInlineCoverFlow,
  menuDirection,
  coverFlowSlot,
  menuHistory,
  currentMenuTitle,
  setMenuScrollRef,
  menuItemHeight,
  currentMenuItems,
  visibleRange,
  selectedMenuItem,
  onSelectMenuItem,
  onMenuItemAction,
  currentMenuModernMediaList,
  menuLabelLayoutKey,
  menuScrollRef,
  fastScrollLetter,
  currentTrack,
  nowPlayingDisplayTrack,
  isAppleMusicCollectionShell,
  tracksLength,
  currentIndex,
  isShuffled,
  loopCurrent,
  loopAll,
  coverUrl,
  elapsedTime,
  totalTime,
  displayElapsedSeconds,
  displayRemainingSeconds,
  showVolumeOverlay,
  scrubbing,
  ipodVolume,
  registerActivity,
  handlePlay,
  showVideoProp,
  onToggleVideo,
  t,
}: IpodScreenMenuChromeProps) {
  const reducedMotion = usePrefersReducedMotion();
  const menuSlide = useMenuSlideTransition(
    menuDirection,
    `${menuDirection}:${menuHistory.length}:${currentMenuTitle}:${showInlineCoverFlow}:${menuMode}`,
    reducedMotion
  );
  const rtl =
    typeof document !== "undefined" && document.documentElement.dir === "rtl";
  return (
    <>
      {/* Title bar
       *
       * Modern (nano 6G/7G + iPod classic 6G silver header):
       *   - Slim 16px silver strip, 12px semibold black text.
       *   - Title left-aligned with 6px padding to match the menu
       *     row text indent (`MenuListItem` uses `pl-1.5 pr-2`).
       *   - Status icons (play/pause + battery) clustered on the right.
       *   - Clamped to the LEFT HALF of the screen in split menu mode
       *     so the album art column extends to the very top edge.
       *
       * Classic (1st-gen LCD): unchanged — Chicago glyphs centered with
       *   play indicator on the left and battery on the right. */}
      <div
        className={cn(
          // Above menu / now-playing content (z-10) so the blue selection
          // highlight cannot paint over the titlebar hairline. The parent
          // panel stays z-10, so full-bleed video (sibling z-20) still
          // stacks over this chrome when playing.
          "shrink-0 py-0 flex items-center sticky top-0 z-20",
          isModernUi
            ? "ipod-modern-titlebar text-black font-ipod-modern-ui font-semibold pl-1.5 pr-1.5 gap-1.5"
            : "h-6 min-h-6 px-2 border-b border-[#0a3667] font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]",
        )}
        style={
          isModernUi
            ? {
                height: MODERN_TITLEBAR_HEIGHT,
                minHeight: MODERN_TITLEBAR_HEIGHT,
              }
            : undefined
        }
      >
        {!isModernUi && (
          <div
            className={cn(
              "flex items-center justify-start",
              `w-6 font-chicago ${isPlaying ? "text-xs" : "text-[18px]"}`
            )}
          >
            <div className="flex items-center justify-center size-4 mt-0.5">
              {isPlaying ? "▶" : "⏸︎"}
            </div>
          </div>
        )}
        <ScrollingText
          text={titlebarTitle}
          isPlaying
          scrollStartDelaySec={1}
          fadeEdges={isModernUi}
          allowMarquee={modernScrollingMarqueeAllowed}
          // ScrollingText defaults align to "center", which forces
          // `justify-center` and overrides any `text-left` class. The
          // modern titlebar wants the title hard-aligned to the left
          // (matching the iPod nano 6G/7G "iPod" / "Now Playing"
          // header in the reference photo); the classic skin keeps
          // its centered Chicago glyphs.
          align={isModernUi ? "left" : "center"}
          className={cn(
            "flex-1 min-w-0 leading-none",
            isModernUi
              ? cn(
                  // Slimmer 12px header type matches the iPod 6G/7G photo
                  // we were referenced to — one full pixel above the
                  // 11px Helvetica Neue used by iOS 6 status bars but
                  // still well under the 15px MyriadPro list rows so the
                  // header reads as secondary chrome.
                  "text-[12px] font-semibold",
                  "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]"
                )
              : "px-1"
          )}
        />
        {isModernUi && menuMode && appleMusicMenuTitlebarLoading ? (
          <ActivityIndicator
            size={12}
            className="shrink-0 text-[#636567] [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]"
          />
        ) : null}
        <div
          className={cn(
            "flex items-center justify-end",
            isModernUi ? "shrink-0 gap-1" : "w-6"
          )}
        >
          {isModernUi && (
            // Play/pause status glyph painted with the same top-to-
            // bottom blue gradient as the row-selection highlight,
            // matching the iOS 6 / iPod nano 6G "tinted" status-bar
            // look. Inline SVG with an embedded gradient so it stays
            // a single sharp shape on any DPI. Sized at 14px to
            // dominate the titlebar (visually matches the title
            // type x-height + ascender).
            //
            // `translateY(-0.5px)` nudges the glyph up half a pixel
            // to compensate for the titlebar's 1px inset bottom
            // hairline + the icon's own downward
            // `drop-shadow(0 1px 0 …)`, which together pulled the
            // shape's optical center half a pixel below the titlebar's
            // visible (above-the-hairline) midline. A full pixel
            // overshoots and reads slightly high.
            <div
              className={cn(
                "flex items-center justify-center size-[14px] [transform:translateY(-0.5px)]",
                // Same light top highlight as the title line — title uses
                // [text-shadow:0_1px_0_rgba(255,255,255,0.9)]; SVG paths
                // use filter drop-shadow so the blue gradient reads with
                // identical gloss on the status bar chrome.
                "[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]"
              )}
            >
              <IpodModernPlayPauseIcon playing={isPlaying} size={14} />
            </div>
          )}
          <BatteryIndicator backlightOn={backlightOn} variant={uiVariant} />
        </div>
      </div>

      {/* Content area - z-10 (below the titlebar z-20) when video is not
          showing so list/now-playing paint under the silver header.
          The screen wrapper stays above the z-0 video layer in menu mode
          via the parent panel. Content height subtracts the titlebar
          height so the menu/now-playing area is the same in both skins.
          Width clamps to the LEFT HALF of the screen when the split
          menu Ken Burns art column is showing so the menu list doesn't
          bleed under the album art. */}
      <div
        className={cn(
          "relative",
          !showVideo && "z-10",
          isModernUi && showSplitMenuArt && "bg-white",
          isModernUi && "flex-1 min-h-0"
        )}
        style={
          isModernUi
            ? { height: IPOD_MODERN_MENU_BODY_HEIGHT_PX }
            : {
                height: "calc(100% - 24px)",
              }
        }
      >
        <AnimatePresence initial={false} custom={menuSlide.custom} mode="sync">
          {showInlineCoverFlow ? (
            // Cover Flow inline state — rendered as the third option
            // in the menu panel's AnimatePresence so the existing
            // chrome width transition (the wrapping `ipod-modern-menu-
            // panel` div animates 50%↔100% via `transition-[width]
            // duration-300 ease-in-out` while the split-art column
            // collapses to 0%) carries the user smoothly into and out
            // of Cover Flow — exactly the same motion as menu→now
            // playing. The slot itself is a `<CoverFlow inline />`
            // node supplied by the parent.
            <motion.div
              key="coverflow"
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={menuSlide.transition}
              custom={menuSlide.custom}
            >
              {coverFlowSlot}
            </motion.div>
          ) : menuMode ? (
            <motion.div
              key={`menu-${menuHistory.length}-${currentMenuTitle}`}
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={menuSlide.transition}
              custom={menuSlide.custom}
            >
              <div className="flex-1 relative">
                <div
                  ref={setMenuScrollRef}
                  className="absolute inset-0 overflow-y-auto overflow-x-hidden ipod-menu-container"
                  style={
                    isModernUi
                      ? {
                          paddingBottom:
                            menuItemHeight === MENU_ITEM_HEIGHT_MODERN_MEDIA
                              ? MODERN_MEDIA_BODY_SLACK_PX
                              : MODERN_MENU_BODY_SLACK_PX,
                        }
                      : undefined
                  }
                >
                  <div
                    style={{
                      position: "relative",
                      height: currentMenuItems.length * menuItemHeight,
                    }}
                  >
                    {currentMenuItems
                      .slice(visibleRange.start, visibleRange.end)
                      .map((item, i) => {
                        const index = visibleRange.start + i;
                        return (
                          <div
                            key={`${index}:${item.label}:${item.value ?? ""}`}
                            className={cn(
                              "ipod-menu-item",
                              index === selectedMenuItem && "selected"
                            )}
                            style={{
                              position: "absolute",
                              top: index * menuItemHeight,
                              left: 0,
                              right: 0,
                              height: menuItemHeight,
                            }}
                          >
                            <MenuListItem
                              text={item.label}
                              isSelected={index === selectedMenuItem}
                              backlightOn={backlightOn}
                              variant={uiVariant}
                              allowScrollingMarquee={modernScrollingMarqueeAllowed}
                              labelLayoutKey={menuLabelLayoutKey}
                              onClick={() => {
                                onSelectMenuItem(index);
                                onMenuItemAction(item.action);
                              }}
                              showChevron={item.showChevron !== false}
                              value={item.value}
                              isLoading={item.isLoading}
                              mediaRow={isModernUi && currentMenuModernMediaList}
                              subtitle={item.subtitle}
                              thumbnailUrl={item.coverUrl}
                              emptyArtworkKind={item.emptyArtworkKind}
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
                <Scrollbar
                  containerRef={menuScrollRef}
                  backlightOn={backlightOn}
                  menuMode={menuMode}
                  variant={uiVariant}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="nowplaying"
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={menuSlide.transition}
              custom={menuSlide.custom}
              onClick={() => {
                if (!menuMode && currentTrack) {
                  registerActivity();
                  if (!isPlaying) {
                    if (!showVideoProp) {
                      onToggleVideo();
                      setTimeout(() => {
                        handlePlay();
                      }, 100);
                    } else {
                      handlePlay();
                    }
                  } else {
                    onToggleVideo();
                  }
                }
              }}
            >
              <div
                className={cn(
                  "flex-1 flex flex-col px-2",
                  isModernUi
                    ? "overflow-x-hidden overflow-y-visible pt-1.5 pb-0.5"
                    : "overflow-visible py-1"
                )}
              >
                {currentTrack && nowPlayingDisplayTrack ? (
                  <>
                    <div
                      className={cn(
                        "flex items-center justify-between gap-2",
                        isModernUi
                          ? "font-ipod-modern-ui text-[12px] font-normal leading-[1.06] text-[rgb(99,101,103)]"
                          : "font-chicago text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]",
                        nowPlayingDisplayTrack.album ? "mb-1" : "mb-1.5"
                      )}
                    >
                      <span>
                        {currentTrack?.appleMusicPlayParams?.stationId
                          ? t("apps.ipod.nowPlaying.live")
                          : isAppleMusicCollectionShell
                            ? t("apps.ipod.nowPlaying.mix")
                            : t("apps.ipod.nowPlaying.trackPosition", {
                                current: currentIndex + 1,
                                total: tracksLength,
                                defaultValue: `${currentIndex + 1} of ${tracksLength}`,
                              })}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {isShuffled && (
                          <Shuffle
                            className="shrink-0"
                            size={isModernUi ? 12 : 13}
                            weight="bold"
                            aria-label={t("apps.ipod.ariaLabels.shuffleOn")}
                          />
                        )}
                        {loopCurrent ? (
                          <RepeatOnce
                            className="shrink-0"
                            size={isModernUi ? 12 : 13}
                            weight="bold"
                            aria-label={t("apps.ipod.menu.repeatOne")}
                          />
                        ) : loopAll ? (
                          <Repeat
                            className="shrink-0"
                            size={isModernUi ? 12 : 13}
                            weight="bold"
                            aria-label={t("apps.ipod.menu.repeatAll")}
                          />
                        ) : null}
                      </span>
                    </div>
                    {isModernUi ? (
                      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-visible pt-1 pb-0">
                        <ModernNowPlayingArtwork coverUrl={coverUrl} />
                        <div
                          className={cn(
                            "flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-0 overflow-visible text-left [&>*:not(:first-child)]:-mt-px",
                            // Small downward nudge so the first line
                            // doesn't hug the cover's top edge — matches
                            // the iPod nano 6G/7G "Now Playing" baseline.
                            "pt-1",
                            "font-ipod-modern-ui"
                          )}
                        >
                          <ScrollingText
                            text={nowPlayingDisplayTrack.title}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            allowMarquee={modernScrollingMarqueeAllowed}
                            className="leading-[1.06] text-[15px] font-semibold text-black"
                          />
                          <ScrollingText
                            text={nowPlayingDisplayTrack.artist || ""}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            allowMarquee={modernScrollingMarqueeAllowed}
                            className="leading-[1.06] text-[12px] font-normal text-[rgb(99,101,103)]"
                          />
                          {nowPlayingDisplayTrack.album && (
                            <ScrollingText
                              text={nowPlayingDisplayTrack.album}
                              isPlaying={isPlaying}
                              scrollStartDelaySec={1}
                              align="left"
                              fadeEdges
                              allowMarquee={modernScrollingMarqueeAllowed}
                              className="leading-[1.06] text-[12px] font-normal text-[rgb(99,101,103)]"
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex min-h-0 flex-col gap-0 overflow-visible text-center leading-[1.05]",
                          "font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                        )}
                      >
                        <ScrollingText
                          text={nowPlayingDisplayTrack.title}
                          isPlaying={isPlaying}
                          scrollStartDelaySec={1}
                          className="leading-[1.05] py-px"
                        />
                        <ScrollingText
                          text={nowPlayingDisplayTrack.artist || ""}
                          isPlaying={isPlaying}
                          scrollStartDelaySec={1}
                          className="leading-[1.05] py-px"
                        />
                        {nowPlayingDisplayTrack.album && (
                          <ScrollingText
                            text={nowPlayingDisplayTrack.album}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            className="leading-[1.05] py-px"
                          />
                        )}
                      </div>
                    )}
                    <div className="relative mt-auto flex-shrink-0 w-full">
                      {/* Clip the volume slide on this inner row only. The
                          diamond is a sibling so it can hang past the bar
                          ends without opening a gap in the slide. */}
                      <div
                        className={cn(
                          "w-full overflow-hidden",
                          nowPlayingDisplayTrack.album ? "pt-1.5" : "pt-3"
                        )}
                      >
                      {reducedMotion ? (
                        showVolumeOverlay ? (
                          <VolumeTransport
                            isModernUi={isModernUi}
                            fraction={ipodVolume}
                          />
                        ) : (
                          <TimeTransport
                            isModernUi={isModernUi}
                            fraction={totalTime > 0 ? elapsedTime / totalTime : 0}
                            elapsedLabel={formatPlaybackTime(displayElapsedSeconds)}
                            remainingLabel={`-${formatPlaybackTime(displayRemainingSeconds)}`}
                            scrubbing={scrubbing}
                          />
                        )
                      ) : (
                        <div
                          className="flex w-[200%]"
                          style={{
                            transform: showVolumeOverlay
                              ? `translateX(${rtl ? "50%" : "-50%"})`
                              : "translateX(0%)",
                            transition: "transform 300ms ease-out",
                          }}
                        >
                          <div className="w-1/2 min-w-0">
                            <TimeTransport
                              isModernUi={isModernUi}
                              fraction={totalTime > 0 ? elapsedTime / totalTime : 0}
                              elapsedLabel={formatPlaybackTime(displayElapsedSeconds)}
                              remainingLabel={`-${formatPlaybackTime(displayRemainingSeconds)}`}
                              scrubbing={scrubbing}
                            />
                          </div>
                          <div className="w-1/2 min-w-0">
                            <VolumeTransport
                              isModernUi={isModernUi}
                              fraction={ipodVolume}
                            />
                          </div>
                        </div>
                      )}
                      </div>
                      {scrubbing && !showVolumeOverlay ? (
                        <ScrubDiamond
                          isModernUi={isModernUi}
                          backlightOn={backlightOn}
                          fraction={totalTime > 0 ? elapsedTime / totalTime : 0}
                          album={Boolean(nowPlayingDisplayTrack.album)}
                        />
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div
                    className={cn(
                      "text-center h-full flex flex-col justify-center items-center",
                      isModernUi
                        ? "font-ipod-modern-ui text-[15px] text-[rgb(99,101,103)]"
                        : "font-geneva-12 text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                    )}
                  >
                    <p>Don&apos;t steal music</p>
                    <p>Ne volez pas la musique</p>
                    <p>Bitte keine Musik stehlen</p>
                    <p>音楽を盗用しないでください</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Letter chip overlay — painted on top of the menu rows when
         *  the user is fast-scrolling through an alphabetic menu
         *  (Artists / Albums). Mirrors classic iPod behavior: every
         *  rotation jumps to the next letter group and the letter
         *  the user just landed on appears in a small rounded chip
         *  centered on the menu. Cleared by `useIpodLogic` after a
         *  brief idle. */}
        <AnimatePresence>
          {menuMode && fastScrollLetter ? (
            <motion.div
              key="fast-scroll-letter"
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              aria-hidden
            >
              <div
                className={cn(
                  "grid place-items-center leading-none select-none",
                  isModernUi
                    ? "text-white font-ipod-modern-ui font-semibold"
                    : "text-[#e6f1fa] font-chicago"
                )}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background:
                    "linear-gradient(to bottom, rgba(42,42,42,0.95), rgba(0,0,0,0.9))",
                  fontSize: 20,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  textShadow: isModernUi
                    ? "0 1px 2px rgba(0,0,0,0.45)"
                    : "1px 1px 0 rgba(0,0,0,0.25)",
                  boxShadow: isModernUi
                    ? "0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.04)"
                    : "0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <span style={{ transform: "translateY(0.75px)" }}>
                  {fastScrollLetter}
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}

function transportLabelClass(isModernUi: boolean): string {
  return cn(
    "w-full flex justify-between",
    isModernUi
      ? "font-ipod-modern-ui text-[12px] min-h-[14px] leading-[1.06] mt-1 text-[rgb(99,101,103)] font-normal tabular-nums"
      : "font-chicago text-[16px] h-[22px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
  );
}

function TransportBar({
  isModernUi,
  fraction,
  scrubbing = false,
}: {
  isModernUi: boolean;
  fraction: number;
  scrubbing?: boolean;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const width = `${clamped * 100}%`;
  const bar = isModernUi ? (
    <div className="aqua-progress h-[9px] w-full rounded-none">
      <div
        className={cn(
          "aqua-progress-fill h-full rounded-none",
          scrubbing ? "" : "transition-all duration-200 ease-out"
        )}
        style={{ width }}
      />
    </div>
  ) : (
    <div className="w-full h-[8px] rounded-full border border-[#0a3667] overflow-hidden">
      <div className="h-full bg-[#0a3667]" style={{ width }} />
    </div>
  );
  return <div className="relative w-full">{bar}</div>;
}

/**
 * Diamond centered on the fill tip. It sits outside the volume-slide clip
 * so the ends stay whole. The column's px-2 gutter is the room it hangs into.
 */
function ScrubDiamond({
  isModernUi,
  backlightOn,
  fraction,
  album,
}: {
  isModernUi: boolean;
  backlightOn: boolean;
  fraction: number;
  album: boolean;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[2]",
        album ? "top-1.5" : "top-3",
        isModernUi ? "h-[9px]" : "h-[8px]"
      )}
      aria-hidden
    >
      <span
        data-scrub-diamond=""
        className="absolute top-1/2 block"
        style={{
          left: scrubDiamondLeftCss(clamped),
          width: SCRUB_DIAMOND_SIZE_PX,
          height: SCRUB_DIAMOND_SIZE_PX,
          transform: "translate(-50%, -50%) rotate(45deg)",
          backgroundColor: isModernUi ? "transparent" : "#0a3667",
          boxShadow: `0 0 0 ${SCRUB_DIAMOND_RING_PX}px ${scrubDiamondRingColor(isModernUi, backlightOn)}`,
        }}
      >
        {isModernUi ? (
          // Clip the progress-bar fill to the diamond. The fill is
          // counter-rotated so its vertical gradient stays screen-up,
          // matching the bar. The inset edge sits on the diamond outline
          // and is not clipped away with the oversized fill square.
          <>
            <span className="absolute inset-0 overflow-hidden">
              <span
                className="ipod-scrub-aqua-gem absolute left-1/2 top-1/2 block"
                style={{
                  position: "absolute",
                  width: SCRUB_DIAMOND_SIZE_PX * Math.SQRT2 + 2,
                  height: SCRUB_DIAMOND_SIZE_PX * Math.SQRT2 + 2,
                  transform: "translate(-50%, -50%) rotate(-45deg)",
                  borderRadius: 0,
                }}
              />
            </span>
            <span className="ipod-scrub-aqua-edge pointer-events-none absolute inset-0" />
          </>
        ) : null}
      </span>
    </div>
  );
}

function TimeTransport({
  isModernUi,
  fraction,
  elapsedLabel,
  remainingLabel,
  scrubbing = false,
}: {
  isModernUi: boolean;
  fraction: number;
  elapsedLabel: string;
  remainingLabel: string;
  scrubbing?: boolean;
}) {
  return (
    <>
      <TransportBar
        isModernUi={isModernUi}
        fraction={fraction}
        scrubbing={scrubbing}
      />
      <div className={transportLabelClass(isModernUi)}>
        <span>{elapsedLabel}</span>
        <span>{remainingLabel}</span>
      </div>
    </>
  );
}

/** LCD speaker drawn for the volume strip. Low is the cone alone; high adds waves. */
function VolumeSpeaker({ level }: { level: "low" | "high" }) {
  const high = level === "high";
  return (
    <svg
      viewBox={high ? "0 0 18 12" : "0 0 8 12"}
      width={high ? 18 : 8}
      height={12}
      className="shrink-0"
      aria-hidden
    >
      <path fill="currentColor" d="M0.6 4.15h1.9L5.1 1.7v8.6L2.5 7.85H0.6z" />
      {high ? (
        <>
          <path
            d="M8.1 3.35a3.1 3.1 0 0 1 0 5.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
          <path
            d="M10.6 1.85a5.2 5.2 0 0 1 0 8.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
          <path
            d="M13.1 0.55a7.2 7.2 0 0 1 0 10.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
        </>
      ) : null}
    </svg>
  );
}

function VolumeTransport({
  isModernUi,
  fraction,
}: {
  isModernUi: boolean;
  fraction: number;
}) {
  return (
    <>
      <div
        className={cn(
          "flex min-h-[14px] items-center gap-1",
          isModernUi ? "text-[rgb(99,101,103)]" : "text-[#0a3667]"
        )}
      >
        <VolumeSpeaker level="low" />
        <div className="min-w-0 flex-1">
          <TransportBar isModernUi={isModernUi} fraction={fraction} />
        </div>
        <VolumeSpeaker level="high" />
      </div>
      <div className={transportLabelClass(isModernUi)} aria-hidden>
        <span />
        <span />
      </div>
    </>
  );
}
