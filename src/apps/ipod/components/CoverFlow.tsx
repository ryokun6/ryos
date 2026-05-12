import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, animate } from "framer-motion";
import {
  getYouTubeVideoId,
  formatKugouImageUrl,
  getAlbumGroupingKey,
} from "../constants";
import type { Track } from "@/stores/useIpodStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { Play, Pause, VinylRecord } from "@phosphor-icons/react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useEventListener } from "@/hooks/useEventListener";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  BatteryIndicator,
  IpodModernPlayPauseIcon,
  ScrollingText,
} from "./screen";
import { FadeInImage } from "./FadeInImage";

// Modern-UI titlebar height. Matches `MODERN_TITLEBAR_HEIGHT` in
// IpodScreen.tsx so the Cover Flow status bar lines up exactly with the
// main menu's silver header strip when toggling between the two.
const MODERN_TITLEBAR_HEIGHT = 17;

// Long press delay in milliseconds
const LONG_PRESS_DELAY = 500;

// Aqua-style shine overlay for macOS X theme buttons
function AquaShineOverlay() {
  return (
    <div
      className="pointer-events-none absolute top-[3px] blur-[0.5px] left-1/2 -translate-x-1/2 rounded-full"
      style={{
        width: "40%",
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
          width: "98%", 
          height: "98%", 
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
          width: "98%",
          height: "98%",
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
            <FadeInImage
              src={coverUrl}
              className="w-full h-full object-cover"
              draggable={false}
              placeholderClassName="bg-neutral-400 rounded-full"
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
          width: "98%",
          height: "98%",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      />
      
      {/* Shine overlay (fixed, doesn't spin) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "98%",
          height: "98%",
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
  /** Group Apple Music tracks into album covers instead of per-song covers. */
  groupAppleMusicAlbums?: boolean;
  /**
   * Render inline inside a host panel (e.g. the modern iPod menu
   * panel) instead of a full-screen `AnimatePresence` overlay. In
   * this mode CoverFlow drops its own bezel / status bar / fade
   * animation so the host's chrome can run the menu↔nowplaying width
   * transition without us drawing a competing border or background.
   */
  inline?: boolean;
}

interface CoverFlowItem {
  key: string;
  track: Track;
  trackIndex: number;
  trackIndices: number[];
  title: string;
  artist?: string;
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
  compactIpodCarousel = false,
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
  /** Tighter carousel geometry for nano-style modern LCD. */
  compactIpodCarousel?: boolean;
  showCD?: boolean;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  selectedIndex: number;
  currentIndex: number;
  onPlayTrackInPlace?: (index: number) => void;
}) {
  // Use track's cover. Apple Music supplies a fully resolved URL; YouTube
  // tracks fall back to a thumbnail derived from the video ID. Karaoke mode
  // uses higher-res variants.
  const videoId = track?.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/${ipodMode ? "mqdefault" : "hqdefault"}.jpg`
    : null;
  const kugouImageSize = ipodMode ? 400 : 800;
  const coverUrl =
    track?.source === "appleMusic"
      ? track.cover ?? null
      : formatKugouImageUrl(track?.cover, kugouImageSize) ?? youtubeThumbnail;

  // Track when the main sleeve image has finished loading so the
  // mirrored reflection underneath can fade in alongside it (instead
  // of popping in independently when the duplicate <img> resolves).
  const [coverLoaded, setCoverLoaded] = useState(false);
  useEffect(() => {
    setCoverLoaded(false);
  }, [coverUrl]);

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

  // Cover size: larger for classic iPod; modern skin uses a tighter row.
  const coverSize =
    ipodMode && !compactIpodCarousel ? 65 : ipodMode ? 58 : 60; // cqmin units
  // Side spacing — modern compact carousel uses slightly larger
  // offsets (18 / 25) than classic so its 1.2x-scaled neighbouring
  // covers don't collide with the center sleeve. Karaoke (non-iPod)
  // stays tight because its wider viewport keeps everything in frame.
  const baseSpacing =
    ipodMode && compactIpodCarousel ? 18 : ipodMode ? 26 : 16;
  const positionSpacing =
    ipodMode && compactIpodCarousel ? 25 : ipodMode ? 18 : 11;

  // Scale values: the modern compact carousel scales the neighbouring
  // covers up so they fill more of the horizontal space without
  // having to push the offset out (which clustered them at the far
  // side). Classic stays 1.0 (matches the iPod hardware look
  // verbatim) and karaoke uses a subtle 0.9 falloff that pairs with
  // its wider viewport.
  const centerScale = 1.0;
  const sideScale =
    ipodMode && compactIpodCarousel ? 1.2 : ipodMode ? 1.0 : 0.9;
  
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
        perspective: `${coverSize * 1.5}cqmin`,
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
        x: { type: "spring", stiffness: 500, damping: 50 },
        y: { type: "spring", stiffness: 500, damping: 50 },
        rotateY: { type: "spring", stiffness: 500, damping: 50 },
        z: { type: "spring", stiffness: 500, damping: 50 },
        scale: { type: "spring", stiffness: 500, damping: 50 },
        opacity: { duration: 0.2, ease: "easeOut" },
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
            exit={{ opacity: 1, y: "15%" }}
            transition={{ 
              y: { type: "spring", stiffness: 200, damping: 25 },
              opacity: { duration: 0.15, ease: "easeOut" },
            }}
          >
            <SpinningCD coverUrl={coverUrl} size="100%" isPlaying={isPlaying} onClick={handleDiscClick} />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Cover art / Sleeve - stays centered, moves down when CD is shown */}
      <motion.div
        className="absolute inset-0 w-full h-full overflow-hidden"
        style={{
          // Neutral mid-gray so the sleeve reads as a "loading"
          // placeholder while the cover image is in flight. Once
          // the image has loaded the FadeInImage below cross-fades
          // over this surface so users never see an empty black
          // hole pop into a cover. The same gray reads acceptably
          // through the brightness overlay on side covers and on
          // the dimmed CD-flip state.
          background: "#a8a8a8",
          pointerEvents: isCenter && showCD ? "none" : "auto",
          zIndex: 10,
          borderRadius: "1%",
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
            duration: 0.2,
            ease: "easeOut",
          }}
        />
        {coverUrl ? (
          <FadeInImage
            src={coverUrl}
            alt={track?.title || ""}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            // The wrapper already renders the gray placeholder via
            // its `background: "#a8a8a8"`. Suppress FadeInImage's
            // own placeholder div so the brightness overlay stays
            // the topmost layer.
            showPlaceholder={false}
            onLoaded={() => setCoverLoaded(true)}
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
      
      {/* Reflection - moves down with cover when CD is shown.
          Gated on `coverLoaded` so the mirror image fades in in
          lock-step with the main sleeve rather than popping in
          when the duplicate <img> resolves separately. */}
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
          y: { type: "spring", stiffness: 200, damping: 25 },
          opacity: { duration: 0.15, ease: "easeOut" },
        }}
      >
        <img
          src={coverUrl || ""}
          alt=""
          className="w-full h-auto"
          style={{
            transform: "scaleY(-1)",
            opacity: coverUrl && coverLoaded ? 0.3 : 0,
            transition: "opacity 250ms ease-out",
            maskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            display: coverUrl ? "block" : "none",
            borderRadius: "1%",
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
  groupAppleMusicAlbums = false,
  inline = false,
}, ref) {
  const { t } = useTranslation();
  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");
  const unknownAlbumLabel = t("apps.ipod.menuItems.unknownAlbum");
  const coverItems = useMemo<CoverFlowItem[]>(() => {
    if (!groupAppleMusicAlbums) {
      return tracks.map((track, index) => ({
        key: track.id,
        track,
        trackIndex: index,
        trackIndices: [index],
        title: track.title,
        artist: track.artist,
      }));
    }

    const grouped = new Map<string, CoverFlowItem>();
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      const artist = track.albumArtist || track.artist || unknownArtistLabel;
      const album = track.album || unknownAlbumLabel;
      const key = getAlbumGroupingKey(
        track,
        unknownAlbumLabel,
        unknownArtistLabel
      );
      const existing = grouped.get(key);
      if (existing) {
        existing.trackIndices.push(index);
      } else {
        grouped.set(key, {
          key,
          track,
          trackIndex: index,
          trackIndices: [index],
          title: album,
          artist,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const artistCompare = (a.artist ?? "").localeCompare(b.artist ?? "", undefined, {
        sensitivity: "base",
      });
      if (artistCompare !== 0) return artistCompare;
      return a.title.localeCompare(b.title, undefined, {
        sensitivity: "base",
      });
    });
  }, [tracks, groupAppleMusicAlbums, unknownArtistLabel, unknownAlbumLabel]);

  const currentCoverIndex = useMemo(() => {
    const index = coverItems.findIndex((item) =>
      item.trackIndices.includes(currentIndex)
    );
    return index >= 0 ? index : Math.min(currentIndex, coverItems.length - 1);
  }, [coverItems, currentIndex]);

  const [selectedIndex, setSelectedIndex] = useState(currentCoverIndex);
  const [showCD, setShowCD] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";
  const uiVariant = useIpodStore((s) => s.uiVariant);
  const isModernIpodCoverFlow = ipodMode && uiVariant === "modern";

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
      setSelectedIndex(currentCoverIndex);
    }
  }, [isVisible, currentCoverIndex]);

  // Navigate to next/previous
  const navigateNext = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(coverItems.length - 1, prev + 1);
      return next;
    });
    setShowCD(false); // Hide CD when navigating
    onRotation();
  }, [coverItems.length, onRotation]);

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
    const item = coverItems[selectedIndex];
    if (item) onSelectTrack(item.trackIndex);
  }, [coverItems, onSelectTrack, selectedIndex]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    navigateNext,
    navigatePrevious,
    selectCurrent,
  }), [navigateNext, navigatePrevious, selectCurrent]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
          selectCurrent();
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
      }
    },
    [navigateNext, navigatePrevious, selectCurrent, onExit]
  );

  useEventListener("keydown", handleKeyDown, isVisible ? window : null);

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
    const covers: { item: CoverFlowItem; index: number; position: number }[] = [];
    
    for (let i = Math.max(0, selectedIndex - visibleRange); i <= Math.min(coverItems.length - 1, selectedIndex + visibleRange); i++) {
      covers.push({
        item: coverItems[i],
        index: i,
        position: i - selectedIndex,
      });
    }
    
    // Sort by z-index (center last so it renders on top)
    return covers.sort((a, b) => Math.abs(b.position) - Math.abs(a.position));
  };
  
  const visibleCovers = getVisibleCovers();

  const currentItem = coverItems[selectedIndex];
  const playItemInPlace = useCallback(
    (coverIndex: number) => {
      const item = coverItems[coverIndex];
      if (item) onPlayTrackInPlace?.(item.trackIndex);
    },
    [coverItems, onPlayTrackInPlace]
  );

  // When `inline` is set, this CoverFlow renders inside another
  // animated container (the modern iPod menu panel that owns the
  // width transition). In that mode we skip our own border / bezel /
  // background / status bar and rely on the host panel's chrome.
  if (inline) {
    return (
      <div
        className={cn(
          "relative w-full h-full overflow-hidden",
          isModernIpodCoverFlow ? "bg-white" : "bg-black",
          ipodMode ? "ipod-force-font" : "karaoke-force-font",
        )}
        style={{ containerType: "size" }}
      >
        {/* Reflective floor — same softer modern-skin gradient. */}
        <div
          className="absolute inset-0"
          style={{
            background: isModernIpodCoverFlow
              ? "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.06) 78%, rgba(0,0,0,0.12) 100%)"
              : "linear-gradient(to bottom, transparent 40%, rgba(38,38,38,0.5) 70%, rgba(64,64,64,0.3) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Gesture-capturing carousel stage (motion.div for framer
            pan/wheel handlers). */}
        <motion.div
          ref={containerRef}
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            showCD ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          )}
          onPanStart={showCD ? undefined : handlePanStart}
          onPan={showCD ? undefined : handlePan}
          onPanEnd={showCD ? undefined : handlePanEnd}
          onWheel={showCD ? undefined : handleWheel}
          onClick={() => {
            if (isPanningRef.current || longPressFiredRef.current) {
              longPressFiredRef.current = false;
              return;
            }
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
          <div
            className="relative flex items-center justify-center w-full"
            style={{
              height: ipodMode && isModernIpodCoverFlow ? "76%" : "75%",
              // Pull the carousel up so the covers sit closer to the
              // titlebar instead of being optically centered inside the
              // menu-panel content area. Modern iPod nano/classic 6G
              // photos show the album row riding noticeably higher than
              // mid-screen, with the title/artist row anchored to the
              // bottom — the previous 0% offset left the covers
              // floating low. -8% matches the classic iPod variant and
              // gives a consistent "covers up, label down" feel across
              // skins.
              marginTop: ipodMode ? "-8%" : "-2%",
              perspective: `${(ipodMode ? 65 : 60) * 1.5}cqmin`,
              transformStyle: "preserve-3d",
            }}
          >
            <AnimatePresence mode="popLayout">
              {visibleCovers.map(({ item, position }) => (
                <CoverImage
                  key={item.key}
                  track={item.track}
                  position={position}
                  ipodMode={ipodMode}
                  compactIpodCarousel={isModernIpodCoverFlow}
                  showCD={showCD}
                  isPlaying={isPlaying && selectedIndex === currentCoverIndex}
                  onTogglePlay={onTogglePlay}
                  selectedIndex={selectedIndex}
                  currentIndex={currentCoverIndex}
                  onPlayTrackInPlace={playItemInPlace}
                />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Track info — bottom row */}
        <div
          className={cn(
            "absolute left-0 right-0 flex items-center justify-center gap-2 pointer-events-none",
            isModernIpodCoverFlow ? "font-ipod-modern-ui" : "font-geneva-12",
            ipodMode ? "px-2" : "px-6",
          )}
          style={{
            bottom:
              ipodMode && isModernIpodCoverFlow
                ? "3px"
                : ipodMode
                  ? "6px"
                  : "5cqmin",
          }}
        >
          <div
            className={cn(
              "text-center min-w-0 flex-1",
              isModernIpodCoverFlow
                ? "[&>*]:leading-[1.15]"
                : "[&>*]:leading-tight",
            )}
          >
            <div
              className={cn(
                "truncate",
                isModernIpodCoverFlow
                  ? "text-black text-[12px] font-semibold tracking-tight"
                  : "text-white",
                ipodMode && !isModernIpodCoverFlow && "text-[10px]",
              )}
            >
              {currentItem?.title || t("apps.ipod.coverFlow.noTrack")}
            </div>
            {currentItem?.artist && (
              <div
                className={cn(
                  "truncate",
                  isModernIpodCoverFlow &&
                    "text-[10px] text-[rgb(99,101,103)] tracking-tight",
                  ipodMode &&
                    !isModernIpodCoverFlow &&
                    "text-white/60 text-[8px]",
                )}
              >
                {currentItem.artist}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={cn(
            "absolute inset-0 z-50 overflow-hidden",
            // Modern UI: white surface to match the rest of the modern
            // skin (Music + Now Playing, settings menus). Classic /
            // karaoke variants keep the original deep-black backdrop.
            isModernIpodCoverFlow ? "bg-white" : "bg-black",
            // Retain the iPod screen's black bezel + rounded corners
            // when Cover Flow is open. The overlay is rendered as a
            // sibling of `IpodScreen` (not a child), so without its
            // own border it would obscure the bezel and the carousel
            // would read as a different frame than every other view.
            // Karaoke Cover Flow opens full-bleed inside its own
            // window chrome and skips the bezel.
            ipodMode && "border border-black border-2 rounded-[2px]",
            ipodMode ? "ipod-force-font" : "karaoke-force-font",
          )}
          style={{ containerType: "size" }}
          initial={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          transition={{ duration: ipodMode ? 0.2 : 0.35, ease: "easeOut" }}
        >
          {/* Reflective floor gradient — softer on the white modern skin so
              it reads as a faint stage shadow under the album row instead
              of a heavy vignette. Classic / karaoke still get the original
              deep gradient that sells the reflective floor against black. */}
          <div
            className="absolute inset-0"
            style={{
              background: isModernIpodCoverFlow
                ? "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.06) 78%, rgba(0,0,0,0.12) 100%)"
                : "linear-gradient(to bottom, transparent 40%, rgba(38,38,38,0.5) 70%, rgba(64,64,64,0.3) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Modern UI status bar — same silver gradient + 12px MyriadPro
              header used by the main menu titlebar so Cover Flow reads as
              another screen of the same UI rather than an overlay. Shows
              the "Cover Flow" label on the left, play/pause status icon
              and battery on the right. Classic / karaoke variants keep
              their full-bleed black backdrop with no status bar. */}
          {isModernIpodCoverFlow && (
            <div
              className={cn(
                "absolute top-0 left-0 right-0 z-20",
                "ipod-modern-titlebar font-ipod-modern-ui font-semibold text-black",
                "flex items-center pl-1.5 pr-1.5 gap-1.5",
              )}
              style={{
                height: MODERN_TITLEBAR_HEIGHT,
                minHeight: MODERN_TITLEBAR_HEIGHT,
              }}
            >
              <ScrollingText
                text={t("apps.ipod.menu.coverFlow")}
                isPlaying
                scrollStartDelaySec={1}
                fadeEdges
                align="left"
                className={cn(
                  "flex-1 min-w-0 leading-none text-[12px] font-semibold",
                  "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]",
                )}
              />
              <div className="flex shrink-0 items-center gap-1">
                <div
                  className={cn(
                    "flex items-center justify-center w-[14px] h-[14px]",
                    "[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]",
                  )}
                >
                  <IpodModernPlayPauseIcon playing={isPlaying} size={14} />
                </div>
                <BatteryIndicator backlightOn variant="modern" />
              </div>
            </div>
          )}
          
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
            {/* Covers - centered with a slight vertical offset so the
                title/artist row at the bottom always has clearance. The
                modern skin also reserves room at the top for the 17px
                status bar, so we shift the carousel down by half the
                status bar height (vs. classic which has no titlebar in
                Cover Flow) to keep it visually centered between the
                two pieces of chrome. */}
            <div 
              className="relative flex items-center justify-center w-full"
              style={{ 
                height: ipodMode && isModernIpodCoverFlow ? "76%" : "75%",
                // Pull the carousel up so the covers ride higher in
                // the iPod screen — matches the inline modern variant
                // and the classic skin. Karaoke (non-iPod) keeps its
                // smaller -2% offset because its viewport is wider and
                // the carousel is already lifted by other padding.
                marginTop: ipodMode ? "-8%" : "-2%",
                perspective: `${(ipodMode ? 65 : 60) * 1.5}cqmin`,
                transformStyle: "preserve-3d",
              }}
            >
              <AnimatePresence mode="popLayout">
                {visibleCovers.map(({ item, position }) => (
                  <CoverImage
                    key={item.key}
                    track={item.track}
                    position={position}
                    ipodMode={ipodMode}
                    compactIpodCarousel={isModernIpodCoverFlow}
                    showCD={showCD}
                    isPlaying={isPlaying && selectedIndex === currentCoverIndex}
                    onTogglePlay={onTogglePlay}
                    selectedIndex={selectedIndex}
                    currentIndex={currentCoverIndex}
                    onPlayTrackInPlace={playItemInPlace}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Track info - fixed size for iPod, responsive for Karaoke */}
          <motion.div
            className={cn(
              "absolute left-0 right-0 flex items-center justify-center gap-2",
              isModernIpodCoverFlow ? "font-ipod-modern-ui" : "font-geneva-12",
              ipodMode ? "px-2" : "px-6"
            )}
            style={{
              bottom:
                ipodMode && isModernIpodCoverFlow
                  ? "3px"
                  : ipodMode
                    ? "6px"
                    : "5cqmin",
            }}
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
                  if (selectedIndex !== currentCoverIndex) {
                    playItemInPlace(selectedIndex);
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
                title={isPlaying && selectedIndex === currentCoverIndex ? t("apps.ipod.menu.pause") : t("apps.ipod.menu.play")}
              >
                {isMacTheme && <AquaShineOverlay />}
                {isPlaying && selectedIndex === currentCoverIndex ? (
                  <Pause className="w-full h-full relative z-10" weight="fill" />
                ) : (
                  <Play className="w-full h-full relative z-10" weight="fill" />
                )}
              </button>
            )}
            
            {/* Track info — modern skin uses black title / gray artist
                on the white surface. `leading-[1.15]` + no extra
                margin tightens the pair compared to the previous
                `leading-tight` + `mt-[1px]` while still leaving a
                small visible gap between descenders / ascenders.
                Classic / karaoke variants keep the original
                light-on-black look. */}
            <div
              className={cn(
                "text-center min-w-0 flex-1",
                isModernIpodCoverFlow
                  ? "[&>*]:leading-[1.15]"
                  : "[&>*]:leading-tight",
              )}
            >
              <div
                className={cn(
                  "truncate",
                  isModernIpodCoverFlow
                    ? "text-black text-[12px] font-semibold tracking-tight"
                    : "text-white",
                  ipodMode && !isModernIpodCoverFlow && "text-[10px]",
                )}
                style={ipodMode ? undefined : { fontSize: "clamp(14px, 5cqmin, 24px)" }}
              >
                {currentItem?.title || t("apps.ipod.coverFlow.noTrack")}
              </div>
              {currentItem?.artist && (
                <div
                  className={cn(
                    "truncate",
                    isModernIpodCoverFlow
                      ? "text-[10px] text-[rgb(99,101,103)] tracking-tight"
                      : // Classic iPod and karaoke share the same
                        // light-on-black treatment — the parent
                        // backdrop is `bg-black` and the title above
                        // is already `text-white`, so the artist
                        // sits one rung down at 60% white. Without
                        // this, karaoke artist text inherited the
                        // default near-black colour and disappeared
                        // against the black Cover Flow stage.
                        "text-white/60",
                    ipodMode && !isModernIpodCoverFlow && "text-[8px]",
                  )}
                  style={
                    ipodMode ? undefined : { fontSize: "clamp(12px, 4cqmin, 18px)" }
                  }
                >
                  {currentItem.artist}
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
                title={showCD ? t("apps.ipod.coverFlow.hideMedia") : t("apps.ipod.coverFlow.showMedia")}
              >
                {isMacTheme && <AquaShineOverlay />}
                <VinylRecord className="w-full h-full relative z-10" weight="fill" />
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
