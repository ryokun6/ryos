import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, animate } from "framer-motion";
import { getYouTubeVideoId, formatKugouImageUrl } from "../constants";
import type { Track } from "@/stores/useIpodStore";
import { Disc, Play, Pause } from "lucide-react";
import { useThemeStore } from "@/stores/useThemeStore";

// Long press delay in milliseconds
const LONG_PRESS_DELAY = 500;

// Aqua-style shine overlay for macOS X theme buttons
function AquaShineOverlay() {
  return (
    <div
      className="pointer-events-none absolute top-[3px] left-1/2 -translate-x-1/2 rounded-full"
      style={{
        width: "45%",
        height: "35%",
        background: "linear-gradient(to bottom, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0))",
      }}
    />
  );
}

// Spinning CD component using Framer Motion exclusively
function SpinningCD({ coverUrl, size, isPlaying, onClick }: { coverUrl: string | null; size: string; isPlaying: boolean; onClick?: () => void }) {
  // Initialize with a random rotation (0-60 degrees)
  const initialRotation = useRef(Math.random() * 60);
  const rotation = useMotionValue(initialRotation.current);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      // Start with ramp up, then continuous rotation
      const startRotation = rotation.get();
      // First do a ramp-up rotation
      animate(rotation, startRotation + 90, {
        duration: 0.8,
        ease: "easeIn",
        onComplete: () => {
          // Then continue with linear rotation
          const currentRotation = rotation.get();
          animationRef.current = animate(rotation, currentRotation + 360 * 1000, {
            duration: 3000,
            ease: "linear",
          });
        },
      });
    } else {
      // Stop current animation and ease out to a stop
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      // Animate a small additional rotation with easeOut for smooth stop
      const currentRotation = rotation.get();
      animate(rotation, currentRotation + 45, {
        duration: 1,
        ease: "easeOut",
      });
    }
    
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [isPlaying, rotation]);

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Circular click zone */}
      <div
        className="absolute rounded-full"
        style={{ 
          width: "92%", 
          height: "92%", 
          cursor: onClick ? "pointer" : "default",
          zIndex: 30,
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick?.();
        }}
      />
      {/* CD disc (spinning part) */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: "92%",
          height: "92%",
          background: `
            radial-gradient(circle at 50% 50%, 
              transparent 0%, 
              transparent 15%, 
              rgba(15, 15, 15, 1) 15.5%,
              rgba(20, 20, 20, 1) 16%,
              rgba(25, 25, 25, 1) 20%,
              rgba(35, 35, 35, 1) 25%,
              rgba(20, 20, 20, 1) 30%,
              rgba(15, 15, 15, 1) 100%
            )
          `,
          boxShadow: "inset 0 0 10px rgba(0,0,0,0.25)",
          rotate: rotation,
        }}
      >
        {/* Album art on CD (circular mask) */}
        {coverUrl && (
          <div
            className="absolute rounded-full overflow-hidden"
            style={{
              top: "30%",
              left: "30%",
              width: "40%",
              height: "40%",
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
            width: "5%",
            height: "5%",
            transform: "translate(-50%, -50%)",
            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.1)",
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
      
      {/* Shadow (fixed, doesn't spin) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "92%",
          height: "92%",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      />
      
      {/* Shine overlay (fixed, doesn't spin) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "92%",
          height: "92%",
          background: `
            conic-gradient(
              from 200deg at 50% 50%,
              transparent 0deg,
              rgba(255, 255, 255, 0.05) 40deg,
              transparent 80deg,
              transparent 180deg,
              rgba(255, 255, 255, 0.03) 220deg,
              transparent 260deg,
              transparent 360deg
            )
          `,
        }}
      />
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
  /** Whether the track is currently playing (for CD spin animation) */
  isPlaying?: boolean;
  /** Callback to toggle play/pause */
  onTogglePlay?: () => void;
  /** Callback to play a specific track without exiting CoverFlow */
  onPlayTrackInPlace?: (index: number) => void;
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
  isPlaying = false,
  onTogglePlay,
  selectedIndex,
  currentIndex,
  onPlayTrackInPlace,
}: {
  track: Track;
  position: number;
  ipodMode?: boolean;
  showCD?: boolean;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  selectedIndex: number;
  currentIndex: number;
  onPlayTrackInPlace?: (index: number) => void;
}) {
  // Use track's cover (from Kugou, fetched during library sync), fallback to YouTube thumbnail
  // Use higher resolution images for karaoke mode (non-iPod)
  const videoId = track?.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/${ipodMode ? "mqdefault" : "hqdefault"}.jpg`
    : null;
  const kugouImageSize = ipodMode ? 400 : 800;
  const coverUrl = formatKugouImageUrl(track?.cover, kugouImageSize) ?? youtubeThumbnail;

  // Handle disc click - play track if different, otherwise toggle play/pause
  const handleDiscClick = useCallback(() => {
    if (selectedIndex !== currentIndex) {
      // Different track - play it without exiting CoverFlow
      onPlayTrackInPlace?.(selectedIndex);
    } else {
      // Same track - toggle play/pause
      onTogglePlay?.();
    }
  }, [selectedIndex, currentIndex, onPlayTrackInPlace, onTogglePlay]);

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
        y: "0cqmin",
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
    // When showCD is true, push side covers further away and fade them more
    const cdSpacingMultiplier = showCD ? 1.3 : 1;
    const cdOpacityMultiplier = showCD ? 0 : 1;
    const baseOpacity = absPos === 1 ? 1 : Math.max(0, 1 - (absPos - 1) * 0.3);
    
    return {
      x: `${direction * (baseSpacing + absPos * positionSpacing) * cdSpacingMultiplier}cqmin`,
      y: "0cqmin",
      rotateY: direction * -60,
      z: showCD ? -100 - absPos * 30 : -50 - absPos * 20,
      scale: showCD ? sideScale * 0.85 : sideScale,
      opacity: baseOpacity * cdOpacityMultiplier,
      zIndex: 5 - absPos,
      isCenter: false,
    };
  };

  const transform = getTransform(position);
  
  // Initial position for entering covers (from off-screen in the direction they're coming from)
  const initialTransform = getTransform(position > 0 ? position + 1 : position - 1);

  return (
    <motion.div
      className="absolute"
      style={{
        // Cover size scales with container
        width: `${coverSize}cqmin`,
        height: `${coverSize}cqmin`,
        perspective: 300,
        transformStyle: "preserve-3d",
        pointerEvents: isCenter && showCD ? "auto" : "none",
      }}
      initial={{
        x: initialTransform.x,
        y: initialTransform.y,
        rotateY: initialTransform.rotateY,
        z: initialTransform.z,
        scale: initialTransform.scale,
        opacity: 0,
        zIndex: initialTransform.zIndex,
      }}
      animate={{
        x: transform.x,
        y: transform.y,
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
      {/* CD (below the sleeve, animates up from below when shown) - only for center */}
      <AnimatePresence>
        {isCenter && showCD && (
          <motion.div
            key="spinning-cd"
            className="absolute inset-0"
            style={{ pointerEvents: "auto", zIndex: 0 }}
            initial={{ opacity: 0, y: "30%" }}
            animate={{
              opacity: 1,
              y: "0%",
            }}
            exit={{ opacity: 0, y: "30%" }}
            transition={{ 
              type: "spring",
              stiffness: 200,
              damping: 25,
            }}
          >
            <SpinningCD coverUrl={coverUrl} size="100%" isPlaying={isPlaying} onClick={handleDiscClick} />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Cover art / Sleeve - stays centered, moves down when CD is shown */}
      <motion.div
        className={`absolute inset-0 w-full h-full overflow-hidden ${ipodMode ? "rounded-lg" : "rounded-sm"}`}
        style={{
          background: "#1a1a1a",
          pointerEvents: isCenter && showCD ? "none" : "auto",
          zIndex: 10,
        }}
        initial={false}
        animate={{
          y: isCenter && showCD ? "105%" : "0%",
        }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 25,
        }}
      >
        {/* Brightness overlay */}
        <motion.div
          className="absolute inset-0 bg-black pointer-events-none z-10"
          initial={false}
          animate={{
            opacity: isCenter && showCD 
              ? 0.65 
              : transform.isCenter ? 0 : 0.3,
          }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 25,
          }}
        />
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
      
      {/* Reflection - moves down with cover when CD is shown */}
      <motion.div
        className="absolute w-full pointer-events-none"
        style={{
          height: "50%",
          top: "100%",
        }}
        initial={false}
        animate={{
          opacity: isCenter && showCD ? 0 : 1,
          y: isCenter && showCD ? "105%" : "0%",
        }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 25,
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
  isPlaying = false,
  onTogglePlay,
  onPlayTrackInPlace,
}, ref) {
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const [showCD, setShowCD] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";
  
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
            className={`absolute inset-0 flex items-center justify-center ${showCD ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
            onPanStart={showCD ? undefined : handlePanStart}
            onPan={showCD ? undefined : handlePan}
            onPanEnd={showCD ? undefined : handlePanEnd}
            onWheel={showCD ? undefined : handleWheel}
            onClick={() => {
              // Don't select if panning or long press was fired
              if (isPanningRef.current || longPressFiredRef.current) {
                longPressFiredRef.current = false;
                return;
              }
              // When CD is shown, clicking outside the disc closes it
              if (showCD) {
                setShowCD(false);
                return;
              }
              selectCurrent();
            }}
            onMouseDown={showCD ? undefined : () => startLongPress()}
            onMouseUp={showCD ? undefined : () => endLongPress()}
            onMouseLeave={showCD ? undefined : () => endLongPress()}
            onTouchStart={showCD ? undefined : () => startLongPress()}
            onTouchEnd={showCD ? undefined : () => endLongPress()}
            onTouchCancel={showCD ? undefined : () => endLongPress()}
            style={{ touchAction: showCD ? "auto" : "none", overflow: "visible" }}
          >
            {/* Covers - centered with slight upward offset for track info space */}
            <div 
              className="relative flex items-center justify-center w-full"
              style={{ 
                height: "75%",
                marginTop: ipodMode ? "-8%" : "-2%",
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
                    isPlaying={isPlaying && selectedIndex === currentIndex}
                    onTogglePlay={onTogglePlay}
                    selectedIndex={selectedIndex}
                    currentIndex={currentIndex}
                    onPlayTrackInPlace={onPlayTrackInPlace}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Track info - fixed size for iPod, responsive for Karaoke */}
          <motion.div
            className={`absolute left-0 right-0 font-geneva-12 flex items-center justify-center gap-2 ${
              ipodMode ? "px-2" : "px-6"
            }`}
            style={{ bottom: ipodMode ? "6px" : "5cqmin" }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* Play/Pause Button - hidden in iPod mode */}
            {!ipodMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // If viewing a different track, play it without exiting CoverFlow
                  if (selectedIndex !== currentIndex) {
                    onPlayTrackInPlace?.(selectedIndex);
                  } else {
                    // Same track - just toggle play/pause
                    onTogglePlay?.();
                  }
                }}
                className="relative flex-shrink-0 rounded-full transition-all text-white/80 hover:text-white hover:brightness-110 p-3"
                style={{
                  width: "clamp(40px, 8cqmin, 48px)",
                  height: "clamp(40px, 8cqmin, 48px)",
                  ...(isMacTheme ? {
                    background: "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                  } : {
                    background: "rgba(255, 255, 255, 0.08)",
                  }),
                }}
                title={isPlaying && selectedIndex === currentIndex ? "Pause" : "Play"}
              >
                {isMacTheme && <AquaShineOverlay />}
                {isPlaying && selectedIndex === currentIndex ? (
                  <Pause className="w-full h-full relative z-10" fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play className="w-full h-full relative z-10" fill="currentColor" strokeWidth={0} />
                )}
              </button>
            )}
            
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
            
            {/* CD Toggle Button - hidden in iPod mode */}
            {!ipodMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCD(!showCD);
                }}
                className={`relative flex-shrink-0 rounded-full transition-all hover:brightness-110 p-3 ${
                  showCD ? "text-white" : "text-white/80 hover:text-white"
                }`}
                style={{
                  width: "clamp(40px, 8cqmin, 48px)",
                  height: "clamp(40px, 8cqmin, 48px)",
                  ...(isMacTheme ? {
                    background: showCD 
                      ? "linear-gradient(to bottom, rgba(80, 80, 80, 0.7), rgba(50, 50, 50, 0.6))"
                      : "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                  } : {
                    background: showCD ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.08)",
                  }),
                }}
                title={showCD ? "Hide CD" : "Show CD"}
              >
                {isMacTheme && <AquaShineOverlay />}
                <Disc 
                  className="w-full h-full relative z-10"
                  strokeWidth={showCD ? 2.5 : 2}
                />
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
