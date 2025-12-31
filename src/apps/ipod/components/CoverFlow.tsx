import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { getYouTubeVideoId, formatKugouImageUrl } from "../constants";
import type { Track } from "@/stores/useIpodStore";
import { Disc } from "lucide-react";

// Long press delay in milliseconds
const LONG_PRESS_DELAY = 500;

// Spinning CD component
function SpinningCD({ coverUrl, size }: { coverUrl: string | null; size: string }) {
  return (
    <div 
      className="absolute inset-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* CD disc */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: "92%",
          height: "92%",
          background: `
            radial-gradient(circle at 50% 50%, 
              transparent 0%, 
              transparent 15%, 
              rgba(30, 30, 30, 1) 15.5%,
              rgba(40, 40, 40, 1) 16%,
              rgba(60, 60, 60, 1) 20%,
              rgba(80, 80, 80, 1) 25%,
              rgba(50, 50, 50, 1) 30%,
              rgba(40, 40, 40, 1) 100%
            )
          `,
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)",
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        {/* Album art on CD (circular mask) */}
        {coverUrl && (
          <div
            className="absolute rounded-full overflow-hidden"
            style={{
              top: "20%",
              left: "20%",
              width: "60%",
              height: "60%",
            }}
          >
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
        )}
        
        {/* Center hole */}
        <div
          className="absolute rounded-full bg-black"
          style={{
            top: "50%",
            left: "50%",
            width: "16%",
            height: "16%",
            transform: "translate(-50%, -50%)",
            boxShadow: "inset 0 2px 4px rgba(255,255,255,0.1)",
          }}
        />
        
        {/* Shine overlay */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `
              linear-gradient(
                135deg,
                rgba(255, 255, 255, 0.15) 0%,
                transparent 40%,
                transparent 60%,
                rgba(255, 255, 255, 0.05) 100%
              )
            `,
          }}
        />
        
        {/* Track grooves effect */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `
              repeating-radial-gradient(
                circle at center,
                transparent 0px,
                transparent 2px,
                rgba(0, 0, 0, 0.03) 2px,
                rgba(0, 0, 0, 0.03) 4px
              )
            `,
          }}
        />
      </motion.div>
    </div>
  );
}

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
  showCD = false,
}: { 
  track: Track;
  position: number;
  ipodMode?: boolean;
  showCD?: boolean;
}) {
  // Use track's cover (from Kugou, fetched during library sync), fallback to YouTube thumbnail
  // Use higher resolution images for karaoke mode (non-iPod)
  const videoId = track?.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/${ipodMode ? "mqdefault" : "hqdefault"}.jpg`
    : null;
  const kugouImageSize = ipodMode ? 400 : 800;
  const coverUrl = formatKugouImageUrl(track?.cover, kugouImageSize) ?? youtubeThumbnail;

  // Cover size: larger for iPod mode (extends downward more)
  const coverSize = ipodMode ? 65 : 60; // cqmin units
  // Side cover spacing adjusts based on cover size
  const baseSpacing = ipodMode ? 26 : 16;
  const positionSpacing = ipodMode ? 18 : 11;

  // Scale values: no scaling for iPod mode, subtle for karaoke
  const centerScale = 1.0;
  const sideScale = ipodMode ? 1.0 : 0.9;
  
  const isCenter = position === 0;

  // Calculate 3D transform based on position - uses relative units (cqmin = % of container's smaller dimension)
  const getTransform = (pos: number) => {
    if (pos === 0) {
      // Center cover - pushed forward in karaoke mode to appear larger
      return {
        x: "0cqmin",
        rotateY: 0,
        z: ipodMode ? 0 : 30,
        scale: centerScale,
        opacity: 1,
        zIndex: 10,
        isCenter: true,
      };
    }
    
    const direction = pos > 0 ? 1 : -1;
    const absPos = Math.abs(pos);
    
    // Side covers - spacing scales with container
    // Push side covers back more to prevent clipping with center cover
    // Opacity 1 for direct neighbors (absPos === 1), fade out the rest
    return {
      x: `${direction * (baseSpacing + absPos * positionSpacing)}cqmin`,
      rotateY: direction * -60,
      z: -50 - absPos * 20,
      scale: sideScale,
      opacity: absPos === 1 ? 1 : Math.max(0, 1 - (absPos - 1) * 0.3),
      zIndex: 5 - absPos,
      isCenter: false,
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
        perspective: 300,
        transformStyle: "preserve-3d",
      }}
      initial={{
        x: initialTransform.x,
        rotateY: initialTransform.rotateY,
        z: initialTransform.z,
        scale: initialTransform.scale,
        opacity: 0,
        zIndex: initialTransform.zIndex,
      }}
      animate={{
        x: transform.x,
        rotateY: transform.rotateY,
        z: transform.z,
        scale: transform.scale,
        opacity: transform.opacity,
        zIndex: transform.zIndex,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 50,
      }}
    >
      {/* CD (behind the sleeve) - only for center */}
      {isCenter && (
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{
            opacity: showCD ? 1 : 0,
          }}
          transition={{ duration: 0.3 }}
        >
          <SpinningCD coverUrl={coverUrl} size="100%" />
        </motion.div>
      )}
      
      {/* Cover art / Sleeve */}
      <motion.div
        className={`absolute inset-0 w-full h-full overflow-hidden ${ipodMode ? "rounded-lg" : "rounded-sm"}`}
        style={{
          background: "#1a1a1a",
          filter: transform.isCenter ? "brightness(1)" : "brightness(0.7)",
          boxShadow: isCenter && showCD ? "4px 0 12px rgba(0,0,0,0.4)" : "none",
        }}
        initial={false}
        animate={{
          x: isCenter && showCD ? "40%" : "0%",
          rotateY: isCenter && showCD ? -15 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
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
      </motion.div>
      
      {/* Reflection - only when CD is not shown */}
      <motion.div
        className="absolute w-full pointer-events-none"
        style={{
          height: "50%",
          top: "100%",
        }}
        initial={false}
        animate={{
          opacity: isCenter && showCD ? 0 : 1,
          x: isCenter && showCD ? "40%" : "0%",
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
      >
        <img
          src={coverUrl || ""}
          alt=""
          className={`w-full h-auto ${ipodMode ? "rounded-lg" : "rounded-sm"}`}
          style={{
            transform: "scaleY(-1)",
            opacity: 0.3,
            maskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            display: coverUrl ? "block" : "none",
          }}
          draggable={false}
        />
      </motion.div>
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
  const [showCD, setShowCD] = useState(false);
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
    setShowCD(false); // Hide CD when navigating
    onRotation();
  }, [tracks.length, onRotation]);

  const navigatePrevious = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1);
      return next;
    });
    setShowCD(false); // Hide CD when navigating
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
    const threshold = 20; // Pixels to move before triggering navigation
    
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
          className={`absolute inset-0 z-50 bg-black overflow-hidden ${ipodMode ? "ipod-force-font" : "karaoke-force-font"}`}
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
                perspective: 300,
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
                    showCD={showCD}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Track info - fixed size for iPod, responsive for Karaoke */}
          <motion.div
            className="absolute left-0 right-0 px-2 font-geneva-12 flex items-center justify-center gap-2"
            style={{ bottom: ipodMode ? "10px" : "5cqmin" }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* CD Toggle Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCD(!showCD);
              }}
              className={`flex-shrink-0 rounded-full p-1 transition-all ${
                showCD 
                  ? "bg-white/20 text-white" 
                  : "bg-white/10 text-white/50 hover:bg-white/15 hover:text-white/70"
              }`}
              style={{
                width: ipodMode ? "18px" : "clamp(24px, 6cqmin, 36px)",
                height: ipodMode ? "18px" : "clamp(24px, 6cqmin, 36px)",
              }}
              title={showCD ? "Hide CD" : "Show CD"}
            >
              <Disc 
                className="w-full h-full"
                strokeWidth={showCD ? 2.5 : 2}
              />
            </button>
            
            {/* Track info */}
            <div className="text-center min-w-0 flex-1">
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
            </div>
            
            {/* Spacer to balance the layout */}
            <div 
              className="flex-shrink-0"
              style={{
                width: ipodMode ? "18px" : "clamp(24px, 6cqmin, 36px)",
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
