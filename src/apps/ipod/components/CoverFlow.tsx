import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { getYouTubeVideoId, formatKugouImageUrl } from "../constants";
import type { Track } from "@/stores/useIpodStore";

// Long press delay in milliseconds
const LONG_PRESS_DELAY = 500;

interface CoverFlowProps {
  tracks: Track[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
  onExit: () => void;
  onRotation: () => void;
  isVisible: boolean;
  /** Use iPod-specific styling (fixed sizes, ipod-force-font) */
  ipodMode?: boolean;
}

export interface CoverFlowRef {
  navigateNext: () => void;
  navigatePrevious: () => void;
  selectCurrent: () => void;
}

// Individual cover component - uses track's cover directly (fetched during sync)
function CoverImage({ 
  track, 
  position,
  ipodMode = true,
}: { 
  track: Track;
  position: number;
  ipodMode?: boolean;
}) {
  // Use track's cover (from Kugou, fetched during library sync), fallback to YouTube thumbnail
  // Use higher resolution images for karaoke mode (non-iPod)
  const videoId = track?.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/${ipodMode ? "mqdefault" : "hqdefault"}.jpg`
    : null;
  const kugouImageSize = ipodMode ? 400 : 800;
  const coverUrl = formatKugouImageUrl(track?.cover, kugouImageSize) ?? youtubeThumbnail;

  // Cover size: larger for karaoke mode (non-iPod)
  const coverSize = ipodMode ? 60 : 60; // cqmin units
  // Side cover spacing adjusts based on cover size
  const baseSpacing = ipodMode ? 28 : 28;
  const positionSpacing = ipodMode ? 18 : 20;

  // Calculate 3D transform based on position - uses relative units (cqmin = % of container's smaller dimension)
  const getTransform = (pos: number) => {
    if (pos === 0) {
      // Center cover - slightly larger and forward
      return {
        x: "0cqmin",
        rotateY: 0,
        z: 20,
        scale: 1,
        opacity: 1,
      };
    }
    
    const direction = pos > 0 ? 1 : -1;
    const absPos = Math.abs(pos);
    
    // Side covers - spacing scales with container
    return {
      x: `${direction * (baseSpacing + absPos * positionSpacing)}cqmin`,
      rotateY: direction * -65,
      z: -absPos * 10,
      scale: 0.95,
      opacity: Math.max(0, 1 - absPos * 0.3),
    };
  };

  const transform = getTransform(position);
  
  // Initial position for entering covers (from off-screen in the direction they're coming from)
  const initialTransform = getTransform(position > 0 ? position + 1 : position - 1);

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        // Cover size scales with container
        width: `${coverSize}cqmin`,
        height: `${coverSize}cqmin`,
        perspective: 400,
        transformStyle: "preserve-3d",
      }}
      initial={{
        x: initialTransform.x,
        rotateY: initialTransform.rotateY,
        z: initialTransform.z,
        scale: initialTransform.scale,
        opacity: 0,
      }}
      animate={{
        x: transform.x,
        rotateY: transform.rotateY,
        z: transform.z,
        scale: transform.scale,
        opacity: transform.opacity,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 35,
      }}
    >
      {/* Cover art */}
      <div
        className="w-full h-full rounded-lg shadow-xl overflow-hidden"
        style={{
          background: "#1a1a1a",
        }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={track?.title || ""}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="rgba(255,255,255,0.3)"
            >
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
      </div>
      
      {/* Reflection */}
      <div
        className="absolute w-full pointer-events-none"
        style={{
          height: "50%",
          top: "100%",
        }}
      >
        <img
          src={coverUrl || ""}
          alt=""
          className="w-full h-auto rounded-lg"
          style={{
            transform: "scaleY(-1)",
            opacity: 0.3,
            maskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            display: coverUrl ? "block" : "none",
          }}
          draggable={false}
        />
      </div>
    </motion.div>
  );
}

export const CoverFlow = forwardRef<CoverFlowRef, CoverFlowProps>(function CoverFlow({
  tracks,
  currentIndex,
  onSelectTrack,
  onExit,
  onRotation,
  isVisible,
  ipodMode = true,
}, ref) {
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track swipe state
  const swipeStartX = useRef<number | null>(null);
  const lastMoveX = useRef<number | null>(null);
  const isPanningRef = useRef(false);
  
  // Long press handling for exit
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const startLongPress = useCallback(() => {
    clearLongPress();
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onExit();
    }, LONG_PRESS_DELAY);
  }, [onExit, clearLongPress]);

  const endLongPress = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  // Reset selected index when opening
  useEffect(() => {
    if (isVisible) {
      setSelectedIndex(currentIndex);
    }
  }, [isVisible, currentIndex]);

  // Navigate to next/previous
  const navigateNext = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(tracks.length - 1, prev + 1);
      return next;
    });
    onRotation();
  }, [tracks.length, onRotation]);

  const navigatePrevious = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1);
      return next;
    });
    onRotation();
  }, [onRotation]);

  // Select the current track
  const selectCurrent = useCallback(() => {
    onSelectTrack(selectedIndex);
  }, [onSelectTrack, selectedIndex]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    navigateNext,
    navigatePrevious,
    selectCurrent,
  }), [navigateNext, navigatePrevious, selectCurrent]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          navigateNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          navigatePrevious();
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onSelectTrack(selectedIndex);
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, selectedIndex, navigateNext, navigatePrevious, onSelectTrack, onExit]);

  // Handle swipe/pan gestures
  const handlePanStart = useCallback((_: unknown, info: PanInfo) => {
    swipeStartX.current = info.point.x;
    lastMoveX.current = info.point.x;
    isPanningRef.current = true;
    // Cancel long press when drag starts
    clearLongPress();
  }, [clearLongPress]);

  const handlePan = useCallback((_: unknown, info: PanInfo) => {
    if (lastMoveX.current === null) return;
    
    // Cancel long press on any pan movement
    clearLongPress();
    
    const deltaX = info.point.x - lastMoveX.current;
    const threshold = 30; // Pixels to move before triggering navigation
    
    if (Math.abs(deltaX) > threshold) {
      if (deltaX < 0) {
        navigateNext();
      } else {
        navigatePrevious();
      }
      lastMoveX.current = info.point.x;
    }
  }, [navigateNext, navigatePrevious, clearLongPress]);

  const handlePanEnd = useCallback(() => {
    swipeStartX.current = null;
    lastMoveX.current = null;
    // Reset panning flag after a short delay to allow click event to check it
    setTimeout(() => {
      isPanningRef.current = false;
    }, 50);
  }, []);

  // Handle wheel scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaX > 20 || e.deltaY > 20) {
      navigateNext();
    } else if (e.deltaX < -20 || e.deltaY < -20) {
      navigatePrevious();
    }
  }, [navigateNext, navigatePrevious]);

  // Get visible covers (optimize rendering)
  const getVisibleCovers = () => {
    const visibleRange = 3; // Show 3 covers on each side
    const covers: { track: Track; index: number; position: number }[] = [];
    
    for (let i = Math.max(0, selectedIndex - visibleRange); i <= Math.min(tracks.length - 1, selectedIndex + visibleRange); i++) {
      covers.push({
        track: tracks[i],
        index: i,
        position: i - selectedIndex,
      });
    }
    
    // Sort by z-index (center last so it renders on top)
    return covers.sort((a, b) => Math.abs(b.position) - Math.abs(a.position));
  };
  
  const visibleCovers = getVisibleCovers();

  const currentTrack = tracks[selectedIndex];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={`absolute inset-0 z-50 bg-black overflow-hidden ${ipodMode ? "ipod-force-font" : ""}`}
          style={{ containerType: "size" }}
          initial={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          transition={{ duration: ipodMode ? 0.2 : 0.35, ease: "easeOut" }}
        >
          {/* Reflective floor gradient - bottom only */}
          <div 
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, transparent 40%, rgba(38,38,38,0.5) 70%, rgba(64,64,64,0.3) 100%)",
              pointerEvents: "none",
            }}
          />
          
          {/* Cover Flow container */}
          <motion.div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing"
            onPanStart={handlePanStart}
            onPan={handlePan}
            onPanEnd={handlePanEnd}
            onWheel={handleWheel}
            onClick={() => {
              // Don't select if panning or long press was fired
              if (isPanningRef.current || longPressFiredRef.current) {
                longPressFiredRef.current = false;
                return;
              }
              selectCurrent();
            }}
            onMouseDown={() => startLongPress()}
            onMouseUp={() => endLongPress()}
            onMouseLeave={() => endLongPress()}
            onTouchStart={() => startLongPress()}
            onTouchEnd={() => endLongPress()}
            onTouchCancel={() => endLongPress()}
            style={{ touchAction: "none", overflow: "visible" }}
          >
            {/* Covers - centered with slight upward offset for track info space */}
            <div 
              className="relative flex items-center justify-center w-full"
              style={{ 
                height: "75%",
                marginTop: ipodMode ? "-12%" : "-5%",
                perspective: 400,
                transformStyle: "preserve-3d",
              }}
            >
              <AnimatePresence mode="popLayout">
                {visibleCovers.map(({ track, position }) => (
                  <CoverImage
                    key={track.id}
                    track={track}
                    position={position}
                    ipodMode={ipodMode}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Track info - fixed size for iPod, responsive for Karaoke */}
          <motion.div
            className="absolute left-0 right-0 text-center px-2 font-geneva-12"
            style={{ bottom: ipodMode ? "8px" : "5cqmin" }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div 
              className={`text-white truncate leading-tight ${ipodMode ? "text-[10px]" : ""}`}
              style={ipodMode ? undefined : { fontSize: "clamp(14px, 5cqmin, 24px)" }}
            >
              {currentTrack?.title || "No track"}
            </div>
            {currentTrack?.artist && (
              <div 
                className={`text-white/60 truncate leading-tight ${ipodMode ? "text-[8px]" : ""}`}
                style={ipodMode ? undefined : { fontSize: "clamp(12px, 4cqmin, 18px)" }}
              >
                {currentTrack.artist}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
