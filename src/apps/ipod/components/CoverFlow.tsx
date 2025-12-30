import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSongCover } from "@/hooks/useSongCover";
import { getYouTubeVideoId } from "../constants";
import type { Track } from "@/stores/useIpodStore";

interface CoverFlowProps {
  tracks: Track[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
  onExit: () => void;
  onRotation: () => void;
  isVisible: boolean;
}

export interface CoverFlowRef {
  navigateNext: () => void;
  navigatePrevious: () => void;
  selectCurrent: () => void;
}

// Individual cover component to use the hook
function CoverImage({ 
  track, 
  isCenter,
  position,
}: { 
  track: Track;
  isCenter: boolean;
  position: number;
}) {
  const videoId = track?.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null;
  const coverUrl = useSongCover(videoId, youtubeThumbnail);

  // Calculate 3D transform based on position
  const getTransform = () => {
    if (position === 0) {
      // Center cover
      return {
        x: 0,
        rotateY: 0,
        z: 30,
        scale: 1,
        opacity: 1,
      };
    }
    
    const direction = position > 0 ? 1 : -1;
    const absPos = Math.abs(position);
    
    // Limit visible covers
    if (absPos > 3) {
      return {
        x: direction * (60 + absPos * 15),
        rotateY: direction * -60,
        z: -60 - absPos * 20,
        scale: 0.4,
        opacity: 0,
      };
    }
    
    return {
      x: direction * (40 + absPos * 22),
      rotateY: direction * -55,
      z: -absPos * 25,
      scale: 0.65 - absPos * 0.08,
      opacity: 1 - absPos * 0.25,
    };
  };

  const transform = getTransform();

  return (
    <motion.div
      className="absolute"
      style={{
        width: 70,
        height: 70,
        perspective: 400,
        transformStyle: "preserve-3d",
      }}
      animate={{
        x: transform.x,
        rotateY: transform.rotateY,
        z: transform.z,
        scale: transform.scale,
        opacity: transform.opacity,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
    >
      <div
        className={cn(
          "w-full h-full rounded-lg shadow-xl overflow-hidden",
          isCenter && "ring-2 ring-white/50"
        )}
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
}, ref) {
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track swipe state
  const swipeStartX = useRef<number | null>(null);
  const lastMoveX = useRef<number | null>(null);
  
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
  }, []);

  const handlePan = useCallback((_: unknown, info: PanInfo) => {
    if (lastMoveX.current === null) return;
    
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
  }, [navigateNext, navigatePrevious]);

  const handlePanEnd = useCallback(() => {
    swipeStartX.current = null;
    lastMoveX.current = null;
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
    const visibleRange = 4; // Show 4 covers on each side
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

  const currentTrack = tracks[selectedIndex];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="absolute inset-0 z-50 bg-gradient-to-b from-gray-900 via-black to-gray-900 border border-black border-2 rounded-[2px] overflow-hidden"
          style={{
            width: "100%",
            height: "150px",
            minHeight: "150px",
            maxHeight: "150px",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Reflective floor effect */}
          <div 
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, transparent 50%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%)",
              pointerEvents: "none",
            }}
          />
          
          {/* Cover Flow container */}
          <motion.div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
            onPanStart={handlePanStart}
            onPan={handlePan}
            onPanEnd={handlePanEnd}
            onWheel={handleWheel}
            style={{ touchAction: "none", paddingBottom: "20px" }}
          >
            {/* Covers */}
            <div 
              className="relative flex items-center justify-center"
              style={{ 
                width: "100%", 
                height: 80,
                perspective: 400,
                transformStyle: "preserve-3d",
              }}
            >
              {getVisibleCovers().map(({ track, index, position }) => (
                <CoverImage
                  key={track.id}
                  track={track}
                  isCenter={index === selectedIndex}
                  position={position}
                />
              ))}
            </div>
          </motion.div>

          {/* Track info */}
          <motion.div
            className="absolute bottom-1.5 left-0 right-0 text-center px-2"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="text-white text-[10px] font-medium truncate leading-tight">
              {currentTrack?.title || "No track"}
            </div>
            {currentTrack?.artist && (
              <div className="text-white/60 text-[8px] truncate leading-tight">
                {currentTrack.artist}
              </div>
            )}
          </motion.div>

          {/* Track counter */}
          <motion.div
            className="absolute top-1 right-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-white/60 text-[8px] font-chicago">
              {selectedIndex + 1}/{tracks.length}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
