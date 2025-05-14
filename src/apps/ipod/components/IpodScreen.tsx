import { useState, useRef, useEffect } from "react";
import ReactPlayer from "react-player";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Track } from "@/stores/useIpodStore";
import { useAppStore } from "@/stores/useAppStore";

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
        "px-2 cursor-pointer font-chicago text-[16px] flex justify-between items-center",
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

  return (
    <div
      className={cn(
        "relative w-full h-[160px] border border-black border-2 rounded-[2px] overflow-hidden transition-all duration-500",
        lcdFilterOn ? "lcd-screen" : "",
        backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        // Add the soft blue glow when both LCD filter and backlight are on
        lcdFilterOn &&
          backlightOn &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
    >
      {/* LCD screen overlay with scan lines - only show when LCD filter is on */}
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-scan-lines"></div>
      )}

      {/* Glass reflection effect - only show when LCD filter is on */}
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-reflection"></div>
      )}

      {/* Video player */}
      {currentTrack && (
        <div
          className={cn(
            "absolute inset-0 z-20 transition-opacity duration-300 overflow-hidden",
            showVideo ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div className="w-full h-[calc(100%+120px)] mt-[-60px]">
            <ReactPlayer
              ref={playerRef}
              url={currentTrack.url}
              playing={isPlaying}
              controls={showVideo}
              width="100%"
              height="100%"
              onEnded={handleTrackEnd}
              onProgress={handleProgress}
              onDuration={handleDuration}
              onPlay={handlePlay}
              onPause={handlePause}
              onReady={handleReady}
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
            {/* Transparent overlay to capture clicks */}
            {showVideo && (
              <div
                className="absolute inset-0 z-30"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVideo();
                }}
              />
            )}
            {/* Status Display */}
            <AnimatePresence>
              {statusMessage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <StatusDisplay message={statusMessage} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Title bar - not animated, immediately swaps */}
      <div className="border-b border-[#0a3667] py-0 px-2 font-chicago text-[16px] flex justify-between items-center sticky top-0 z-10 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
        <div className="w-6 text-xs mt-0.5">{isPlaying ? "▶" : "❙❙"}</div>
        <div className="truncate max-w-[80%] text-center">
          {currentMenuTitle}
        </div>
        <div className="w-6 text-xs"></div>
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
              <div
                ref={menuScrollRef}
                className="flex-1 overflow-auto ipod-menu-container"
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
                  onToggleVideo();
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
