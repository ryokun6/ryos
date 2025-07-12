import { useState, useRef, useEffect, useLayoutEffect } from "react";
import ReactPlayer from "react-player";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Track } from "@/stores/useIpodStore";
import { useAppStore } from "@/stores/useAppStore";
import { LyricsDisplay } from "./LyricsDisplay";
import { useLyrics } from "@/hooks/useLyrics";
import { LyricsAlignment, ChineseVariant, KoreanDisplay } from "@/types/lyrics";

// Battery component
function BatteryIndicator({ backlightOn }: { backlightOn: boolean }) {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [animationFrame, setAnimationFrame] = useState<number>(1);

  useEffect(() => {
    // Try to get battery information (deprecated API, may not work in all browsers)
    const getBattery = async () => {
      try {
          if ("getBattery" in navigator) {
            const battery = await (
              navigator as unknown as { getBattery: () => Promise<BatteryManager> }
            ).getBattery();
          setBatteryLevel(battery.level);
          setIsCharging(battery.charging);

          const updateLevel = () => setBatteryLevel(battery.level);
          const updateCharging = () => setIsCharging(battery.charging);

          battery.addEventListener("levelchange", updateLevel);
          battery.addEventListener("chargingchange", updateCharging);

          return () => {
            battery.removeEventListener("levelchange", updateLevel);
            battery.removeEventListener("chargingchange", updateCharging);
          };
        }
      } catch {
        // Fallback to a default level
        setBatteryLevel(1.0); // 100% as fallback
        setIsCharging(false);
      }
    };

    getBattery();
  }, []);

  // Animation effect for charging
  useEffect(() => {
    if (!isCharging) return;

    const interval = setInterval(() => {
      setAnimationFrame((prev) => (prev % 4) + 1);
    }, 500); // Change frame every 500ms

    return () => clearInterval(interval);
  }, [isCharging]);

  // Use fallback if no battery level detected
  const level = batteryLevel ?? 1.0;
  const filledBars = isCharging ? animationFrame : Math.ceil(level * 4);

  return (
    <div className="flex items-center">
      {/* Battery outline */}
      <div className="relative w-[19px] h-[10px] border border-[#0a3667] bg-transparent">
        {/* Battery bars */}
        <div className="absolute inset-[1px] flex gap-[1px]">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className={`flex-1 h-full transition-colors duration-200 ${
                bar <= filledBars ? "bg-[#0a3667]" : "bg-transparent"
              }`}
            />
          ))}
        </div>
      </div>
      {/* Battery tip */}
      <div className="w-[2px] h-[4px] bg-[#0a3667] relative">
        <div
          className={`w-[2px] h-[2px] absolute top-[1px] left-[-2px] right-[0px] mx-auto ${
            backlightOn ? "bg-[#c5e0f5]" : "bg-[#8a9da9]"
          }`}
        />
      </div>
    </div>
  );
}

// Simplified Scrollbar component
function Scrollbar({
  containerRef,
  backlightOn,
  menuMode,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  backlightOn: boolean;
  menuMode: boolean;
}) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!container || !thumb || !track || !menuMode) return;

    const updateScrollbar = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const needsScrollbar = scrollHeight > clientHeight;

      if (needsScrollbar) {
        track.style.opacity = "1";
        thumb.style.display = "block";

        // Account for track's extended bounds: top-[-1px] bottom-[-2px] = +3px total height
        const trackHeight = clientHeight + 3;
        const thumbHeight = Math.max(
          (clientHeight / scrollHeight) * trackHeight,
          20
        );
        const maxScrollTop = scrollHeight - clientHeight;
        const thumbMaxTop = trackHeight - thumbHeight;
        const thumbTop =
          maxScrollTop > 0 ? (scrollTop / maxScrollTop) * thumbMaxTop : 0;

        thumb.style.height = `${thumbHeight - 4}px`;
        thumb.style.top = `${thumbTop + 2}px`; // 1px gap at top (accounting for -1px track offset)
      } else {
        track.style.opacity = "0";
        thumb.style.display = "none";
      }
    };

    // Initial update
    updateScrollbar();

    // Update on scroll
    container.addEventListener("scroll", updateScrollbar, { passive: true });

    // Update when content changes
    const observer = new ResizeObserver(updateScrollbar);
    observer.observe(container);

    return () => {
      container.removeEventListener("scroll", updateScrollbar);
      observer.disconnect();
    };
  }, [containerRef, menuMode]);

  if (!menuMode) return null;

  return (
    <div className="absolute right-0 top-[-1px] bottom-[-2px] w-2 z-20">
      {/* Track - visibility controlled by opacity */}
      <div
        ref={trackRef}
        className={cn(
          "w-full h-full border border-[#0a3667] transition-all duration-500",
          backlightOn
            ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
            : "bg-[#8a9da9]"
        )}
        style={{ opacity: 0 }}
      />
      {/* Thumb - visibility controlled by JS */}
      <div
        ref={thumbRef}
        className="absolute right-0 bg-[#0a3667]"
        style={{
          marginLeft: "2px",
          marginRight: "2px",
          width: "calc(100% - 4px)",
          display: "none", // Initially hidden
        }}
      />
    </div>
  );
}

// Helper component: MenuListItem
function MenuListItem({
  text,
  isSelected,
  onClick,
  backlightOn = true,
  showChevron = true,
  value,
}: {
  text: string;
  isSelected: boolean;
  onClick: () => void;
  backlightOn?: boolean;
  showChevron?: boolean;
  value?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "pl-2 cursor-pointer font-chicago text-[16px] flex justify-between items-center",
        showChevron || value ? "pr-4" : "pr-2", // Always use extra padding for items with chevron or value
        isSelected
          ? backlightOn
            ? "bg-[#0a3667] text-[#c5e0f5] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
            : "bg-[#0a3667] text-[#8a9da9] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
          : "text-[#0a3667] hover:bg-[#c0d8f0] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
      )}
    >
      <span className="whitespace-nowrap overflow-hidden text-ellipsis flex-1 mr-2">
        {text}
      </span>
      {value ? (
        <span className="flex-shrink-0">{value}</span>
      ) : (
        showChevron && <span className="flex-shrink-0">{">"}</span>
      )}
    </div>
  );
}

// Helper component: ScrollingText
function ScrollingText({
  text,
  className,
  isPlaying = true,
}: {
  text: string;
  className?: string;
  isPlaying?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const paddingWidth = 20; // Width of padding between text duplicates

  // Check if text needs to scroll (is wider than container)
  useEffect(() => {
    if (containerRef.current && textRef.current) {
      const newContainerWidth = containerRef.current.clientWidth;
      const newContentWidth = textRef.current.scrollWidth;

      setContentWidth(newContentWidth);
      setShouldScroll(newContentWidth > newContainerWidth);
    }
  }, [text, containerRef, textRef]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden",
        !shouldScroll && "flex justify-center",
        className
      )}
    >
      {shouldScroll ? (
        <div className="inline-block whitespace-nowrap">
          <motion.div
            animate={{
              x: isPlaying ? [0, -(contentWidth + paddingWidth)] : 0,
            }}
            transition={
              isPlaying
                ? {
                    duration: Math.max(text.length * 0.15, 8),
                    ease: "linear",
                    repeat: Infinity,
                  }
                : {
                    duration: 0.3,
                  }
            }
            style={{ display: "inline-flex" }}
          >
            <span ref={textRef} style={{ paddingRight: `${paddingWidth}px` }}>
              {text}
            </span>
            <span style={{ paddingRight: `${paddingWidth}px` }} aria-hidden>
              {text}
            </span>
          </motion.div>
        </div>
      ) : (
        <div ref={textRef} className="whitespace-nowrap text-center">
          {text}
        </div>
      )}
    </div>
  );
}

// Helper component: StatusDisplay
function StatusDisplay({ message }: { message: string }) {
  return (
    <div className="absolute top-4 left-4 pointer-events-none">
      <div className="relative">
        <div className="font-chicago text-white text-xl relative z-10">
          {message}
        </div>
        <div
          className="font-chicago text-black text-xl absolute inset-0"
          style={{
            WebkitTextStroke: "3px black",
            textShadow: "none",
          }}
        >
          {message}
        </div>
      </div>
    </div>
  );
}

// Define the props interface for IpodScreen
interface IpodScreenProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  elapsedTime: number;
  totalTime: number;
  menuMode: boolean;
  menuHistory: {
    title: string;
    items: {
      label: string;
      action: () => void;
      showChevron?: boolean;
      value?: string;
    }[];
    selectedIndex: number;
  }[];
  selectedMenuItem: number;
  onSelectMenuItem: (index: number) => void;
  currentIndex: number;
  tracksLength: number;
  backlightOn: boolean;
  menuDirection: "forward" | "backward";
  onMenuItemAction: (action: () => void) => void;
  showVideo: boolean;
  playerRef: React.RefObject<ReactPlayer>;
  handleTrackEnd: () => void;
  handleProgress: (state: { playedSeconds: number }) => void;
  handleDuration: (duration: number) => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleReady: () => void;
  loopCurrent: boolean;
  statusMessage: string | null;
  onToggleVideo: () => void;
  lcdFilterOn: boolean;
  ipodVolume: number;
  showStatusCallback: (message: string) => void;
  showLyrics: boolean;
  lyricsAlignment: LyricsAlignment;
  chineseVariant: ChineseVariant;
  koreanDisplay: KoreanDisplay;
  lyricOffset: number;
  adjustLyricOffset: (deltaMs: number) => void;
  registerActivity: () => void;
  isFullScreen: boolean;
  lyricsControls: ReturnType<typeof useLyrics>;
}

// Main IpodScreen component
export function IpodScreen({
  currentTrack,
  isPlaying,
  elapsedTime,
  totalTime,
  menuMode,
  menuHistory,
  selectedMenuItem,
  onSelectMenuItem,
  currentIndex,
  tracksLength,
  backlightOn,
  menuDirection,
  onMenuItemAction,
  showVideo,
  playerRef,
  handleTrackEnd,
  handleProgress,
  handleDuration,
  handlePlay,
  handlePause,
  handleReady,
  loopCurrent,
  statusMessage,
  onToggleVideo,
  lcdFilterOn,
  ipodVolume,
  showStatusCallback,
  showLyrics,
  lyricsAlignment,
  chineseVariant,
  koreanDisplay,
  lyricOffset,
  adjustLyricOffset,
  registerActivity,
  isFullScreen,
  lyricsControls,
}: IpodScreenProps) {
  // Animation variants for menu transitions
  const menuVariants = {
    enter: (direction: "forward" | "backward") => ({
      x: direction === "forward" ? "100%" : "-100%",
    }),
    center: {
      x: 0,
    },
    exit: (direction: "forward" | "backward") => ({
      x: direction === "forward" ? "-100%" : "100%",
    }),
  };

  // Current menu title
  const currentMenuTitle = menuMode
    ? menuHistory.length > 0
      ? menuHistory[menuHistory.length - 1].title
      : "iPod"
    : "Now Playing";

  // Refs
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Need scroll flag
  const needScrollRef = useRef(false);

  const masterVolume = useAppStore((s) => s.masterVolume);
  const finalIpodVolume = ipodVolume * masterVolume;

  // Reset refs when menu items change
  const resetItemRefs = (count: number) => {
    menuItemsRef.current = Array(count).fill(null);
  };

  // More direct scroll approach that doesn't rely on refs being attached yet
  const forceScrollToSelected = () => {
    // Return if we're not in menu mode
    if (!menuMode || menuHistory.length === 0) return;

    // Get the current menu's container
    const container = document.querySelector(
      ".ipod-menu-container"
    ) as HTMLElement;
    if (!container) return;

    // Get all menu items
    const menuItems = Array.from(container.querySelectorAll(".ipod-menu-item"));
    if (!menuItems.length) return;

    // Exit if selectedMenuItem is out of bounds
    if (selectedMenuItem < 0 || selectedMenuItem >= menuItems.length) return;

    // Get the selected item
    const selectedItem = menuItems[selectedMenuItem] as HTMLElement;
    if (!selectedItem) return;

    // Calculate scroll position
    const containerHeight = container.clientHeight;
    const itemTop = selectedItem.offsetTop;
    const itemHeight = selectedItem.offsetHeight;
    const scrollTop = container.scrollTop;

    // Use smooth scrolling with a small buffer to prevent edge flickering
    // Add a 2px buffer at top and bottom to prevent edge flickering
    const buffer = 2;

    // If item is below the visible area
    if (itemTop + itemHeight > scrollTop + containerHeight - buffer) {
      container.scrollTo({
        top: itemTop + itemHeight - containerHeight + buffer,
        behavior: "instant" as ScrollBehavior,
      });
    }
    // If item is above the visible area
    else if (itemTop < scrollTop + buffer) {
      container.scrollTo({
        top: Math.max(0, itemTop - buffer),
        behavior: "instant" as ScrollBehavior,
      });
    }

    // Force scroll to top for first item
    if (selectedMenuItem === 0) {
      container.scrollTo({
        top: 0,
        behavior: "instant" as ScrollBehavior,
      });
    }

    // For last item, ensure it's fully visible
    if (selectedMenuItem === menuItems.length - 1) {
      container.scrollTo({
        top: Math.max(0, itemTop - (containerHeight - itemHeight) + buffer),
        behavior: "instant" as ScrollBehavior,
      });
    }

    // Reset need scroll flag
    needScrollRef.current = false;
  };

  // Trigger scroll on various conditions
  useEffect(() => {
    if (menuMode && menuHistory.length > 0) {
      // Flag that we need to scroll
      needScrollRef.current = true;

      // Try immediately (in case DOM is ready)
      forceScrollToSelected();

      // Schedule multiple attempts with increasing delays
      const attempts = [50, 100, 250, 500, 1000];

      attempts.forEach((delay) => {
        setTimeout(() => {
          if (needScrollRef.current) {
            forceScrollToSelected();
          }
        }, delay);
      });
    }
  }, [menuMode, selectedMenuItem, menuHistory.length]);

  // Prepare for a newly opened menu
  useEffect(() => {
    if (menuMode && menuHistory.length > 0) {
      const currentMenu = menuHistory[menuHistory.length - 1];
      resetItemRefs(currentMenu.items.length);
    }
  }, [menuMode, menuHistory.length]);

  const shouldShowLyrics = showLyrics;

  return (
    <div
      className={cn(
        "relative w-full h-[150px] border border-black border-2 rounded-[2px] overflow-hidden transition-all duration-500 select-none",
        lcdFilterOn ? "lcd-screen" : "",
        backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        // Add the soft blue glow when both LCD filter and backlight are on
        lcdFilterOn &&
          backlightOn &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
      style={{
        minWidth: '100%',
        minHeight: '150px',
        maxWidth: '100%',
        maxHeight: '150px',
        position: 'relative',
        contain: 'layout style paint'
      }}
    >
      {/* LCD screen overlay with scan lines - only show when LCD filter is on */}
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-scan-lines"></div>
      )}

      {/* Glass reflection effect - only show when LCD filter is on */}
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-reflection"></div>
      )}

      {/* Video & Lyrics Overlay */}
      {currentTrack && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 overflow-hidden",
            menuMode ? "z-0" : "z-20",
            menuMode || !showVideo
              ? "opacity-0 pointer-events-none"
              : "opacity-100"
          )}
        >
          <div
            className="w-full h-[calc(100%+120px)] mt-[-60px]"
            onClick={(e) => {
              // Ensure taps on the lyrics overlay also toggle play / video as expected
              e.stopPropagation();
              registerActivity();
              if (!isPlaying) {
                // When not playing, show video and resume playback
                if (!showVideo) {
                  onToggleVideo();
                  // Give React a moment to render the player before playing
                  setTimeout(() => {
                    handlePlay();
                  }, 100);
                } else {
                  // Video already visible; just resume playback
                  handlePlay();
                }
              } else {
                // Playing → hide video
                onToggleVideo();
              }
            }}
          >
            <ReactPlayer
              ref={playerRef}
              url={currentTrack.url}
              playing={isPlaying}
              controls={showVideo}
              width="100%"
              height="100%"
              onEnded={!isFullScreen ? handleTrackEnd : undefined}
              onProgress={!isFullScreen ? handleProgress : undefined}
              onDuration={!isFullScreen ? handleDuration : undefined}
              onPlay={!isFullScreen ? handlePlay : undefined}
              onPause={!isFullScreen ? handlePause : undefined}
              onReady={!isFullScreen ? handleReady : undefined}
              loop={loopCurrent}
              volume={finalIpodVolume}
              playsinline={true}
              config={{
                youtube: {
                  playerVars: {
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    iv_load_policy: 3,
                    fs: 0,
                    disablekb: 1,
                    playsinline: 1,
                  },
                },
              }}
            />
            {/* Dark overlay when lyrics are shown */}
            {showVideo && shouldShowLyrics && (
              <div className="absolute inset-0 bg-black/30 z-25" />
            )}
            {/* Transparent overlay to capture clicks */}
            {showVideo && (
              <div
                className="absolute inset-0 z-30"
                onClick={(e) => {
                  e.stopPropagation();
                  // Only resume playback; keep video visible
                  if (!isPlaying) {
                    handlePlay();
                  } else {
                    onToggleVideo();
                  }
                }}
              />
            )}
            {/* Status Display */}
            <AnimatePresence>
              {statusMessage && (
                <motion.div
                  className="absolute inset-0 z-40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <StatusDisplay message={statusMessage} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lyrics Overlay */}
            <LyricsDisplay
              lines={lyricsControls.lines}
              currentLine={lyricsControls.currentLine}
              isLoading={lyricsControls.isLoading}
              error={lyricsControls.error}
              visible={shouldShowLyrics}
              videoVisible={showVideo}
              alignment={lyricsAlignment}
              chineseVariant={chineseVariant}
              koreanDisplay={koreanDisplay}
              isTranslating={lyricsControls.isTranslating}
              onAdjustOffset={(deltaMs) => {
                adjustLyricOffset(deltaMs);
                const newOffset = lyricOffset + deltaMs;
                const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                showStatusCallback(
                  `Offset ${sign}${(newOffset / 1000).toFixed(2)}s`
                );
                // Force immediate update of lyrics display with new offset
                const updatedTime = elapsedTime + newOffset / 1000;
                lyricsControls.updateCurrentTimeManually(updatedTime);
              }}
            />
          </div>
        </div>
      )}

      {/* Title bar - not animated, immediately swaps */}
      <div className="border-b border-[#0a3667] py-0 px-2 font-chicago text-[16px] flex items-center sticky top-0 z-10 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
        <div
          className={`w-6 flex items-center justify-start font-chicago ${
            isPlaying ? "text-xs" : "text-[18px]"
          }`}
        >
          <div className="w-4 h-4 mt-0.5 flex items-center justify-center">
            {isPlaying ? "▶" : "⏸︎"}
          </div>
        </div>
        <div className="flex-1 truncate text-center">{currentMenuTitle}</div>
        <div className="w-6 flex items-center justify-end">
          <BatteryIndicator backlightOn={backlightOn} />
        </div>
      </div>

      {/* Content area - this animates/slides */}
      <div className="relative h-[calc(100%-26px)]">
        <AnimatePresence initial={false} custom={menuDirection} mode="sync">
          {menuMode ? (
            <motion.div
              key={`menu-${menuHistory.length}-${currentMenuTitle}`}
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              custom={menuDirection}
              onAnimationComplete={() => {
                // Flag that we need to scroll and trigger the scroll logic
                needScrollRef.current = true;
                forceScrollToSelected();
              }}
            >
              <div className="flex-1 relative">
                <div
                  ref={menuScrollRef}
                  className="absolute inset-0 overflow-auto ipod-menu-container"
                >
                  {menuHistory.length > 0 &&
                    menuHistory[menuHistory.length - 1].items.map(
                      (item, index) => (
                        <div
                          key={index}
                          ref={(el) => (menuItemsRef.current[index] = el)}
                          className={`ipod-menu-item ${
                            index === selectedMenuItem ? "selected" : ""
                          }`}
                        >
                          <MenuListItem
                            text={item.label}
                            isSelected={index === selectedMenuItem}
                            backlightOn={backlightOn}
                            onClick={() => {
                              onSelectMenuItem(index);
                              onMenuItemAction(item.action);
                            }}
                            showChevron={item.showChevron !== false}
                            value={item.value}
                          />
                        </div>
                      )
                    )}
                </div>
                <Scrollbar
                  containerRef={menuScrollRef}
                  backlightOn={backlightOn}
                  menuMode={menuMode}
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
              transition={{ duration: 0.2, ease: "easeInOut" }}
              custom={menuDirection}
              onClick={() => {
                if (!menuMode && currentTrack) {
                  registerActivity();
                  if (!isPlaying) {
                    // If the video is currently hidden, show it first so the
                    // user gesture also applies to the player element.
                    if (!showVideo) {
                      onToggleVideo();
                      // Give React a moment to render the player before
                      // resuming playback so the gesture is linked.
                      setTimeout(() => {
                        handlePlay();
                      }, 100);
                    } else {
                      // Resume playback immediately when video already visible
                      handlePlay();
                    }
                  } else {
                    // Already playing — simply toggle video visibility
                    onToggleVideo();
                  }
                }
              }}
            >
              <div className="flex-1 flex flex-col p-1 px-2 overflow-auto">
                {currentTrack ? (
                  <>
                    <div className="font-chicago text-[12px] mb-1 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
                      {currentIndex + 1} of {tracksLength}
                    </div>
                    <div className="font-chicago text-[16px] text-center text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
                      <ScrollingText
                        text={currentTrack.title}
                        isPlaying={isPlaying}
                      />
                      <ScrollingText
                        text={currentTrack.artist || ""}
                        isPlaying={isPlaying}
                      />
                    </div>
                    <div className="mt-auto w-full h-[8px] rounded-full border border-[#0a3667] overflow-hidden">
                      <div
                        className="h-full bg-[#0a3667]"
                        style={{
                          width: `${
                            totalTime > 0 ? (elapsedTime / totalTime) * 100 : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="font-chicago text-[16px] w-full h-[22px] flex justify-between text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
                      <span>
                        {Math.floor(elapsedTime / 60)}:
                        {String(Math.floor(elapsedTime % 60)).padStart(2, "0")}
                      </span>
                      <span>
                        -{Math.floor((totalTime - elapsedTime) / 60)}:
                        {String(
                          Math.floor((totalTime - elapsedTime) % 60)
                        ).padStart(2, "0")}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-center font-geneva-12 text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)] h-full flex flex-col justify-center items-center">
                    <p>Don't steal music</p>
                    <p>Ne volez pas la musique</p>
                    <p>Bitte keine Musik stehlen</p>
                    <p>音楽を盗用しないでください</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
