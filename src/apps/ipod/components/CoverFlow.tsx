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
import { useImageLoaded } from "../hooks/useImageLoaded";

// Shared cross-fade for cover images: stay invisible while
// loading (the wrapping element's gray background reads as the
// placeholder), then fade up to the loaded state in 250ms.
const COVER_FADE_TRANSITION = "opacity 250ms ease-out" as const;

// Modern-UI titlebar height. Matches `MODERN_TITLEBAR_HEIGHT` in
// IpodScreen.tsx so the Cover Flow status bar lines up exactly with the
// main menu's silver header strip when toggling between the two.
const MODERN_TITLEBAR_HEIGHT = 17;

// Long press delay in milliseconds
const LONG_PRESS_DELAY = 500;

// Format a track duration in milliseconds as `m:ss`. Returns an empty
// string when the duration is unknown so the tracklist row collapses
// gracefully instead of showing "0:00" for songs that haven't reported
// their length yet (mostly a YouTube-only edge case).
function formatTrackDuration(durationMs?: number): string {
  if (!durationMs || durationMs <= 0) return "";
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
  const albumArt = useImageLoaded(coverUrl);

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
        {/* Album art on CD (circular mask). Wrapper's gray bg
            reads as the loading placeholder; the <img> fades in
            on top once the bitmap is ready. */}
        {coverUrl && (
          <div
            className="absolute rounded-full overflow-hidden bg-neutral-400"
            style={{
              top: "30%",
              left: "30%",
              width: "40%",
              height: "40%",
            }}
          >
            <img
              ref={albumArt.ref}
              src={coverUrl}
              alt=""
              draggable={false}
              onLoad={albumArt.onLoad}
              className="w-full h-full object-cover"
              style={{
                opacity: albumArt.loaded ? 1 : 0,
                transition: COVER_FADE_TRANSITION,
              }}
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
  /**
   * Handle a "back" press (Menu button on the wheel). Returns `true`
   * when Cover Flow consumed the press — currently only when the
   * album cover is flipped to its tracklist, in which case the press
   * unflips back to the carousel instead of exiting Cover Flow.
   * Returns `false` otherwise so the caller can run its default exit
   * behavior.
   */
  handleMenuButton: () => boolean;
}

// Resolve the best cover URL for a track. Apple Music supplies a
// fully resolved URL; YouTube tracks fall back to a thumbnail derived
// from the video ID. The CoverFlow root + the per-cover renderer both
// need this same logic to drive the album-flip front face, so it
// lives here as a small helper instead of being duplicated.
function resolveCoverUrl(
  track: Track | undefined | null,
  ipodMode: boolean
): string | null {
  if (!track) return null;
  const videoId = track.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/${ipodMode ? "mqdefault" : "hqdefault"}.jpg`
    : null;
  const kugouImageSize = ipodMode ? 400 : 800;
  return track.source === "appleMusic"
    ? track.cover ?? null
    : formatKugouImageUrl(track.cover, kugouImageSize) ?? youtubeThumbnail;
}

// Cover size in `cqmin` units for a given Cover Flow variant. Used by
// `CoverImage` for the carousel and by the album-flip overlay so the
// flip's front face perfectly aligns with the underlying carousel
// cover before it rotates away.
function getCoverSizeCqmin(
  ipodMode: boolean,
  compactIpodCarousel: boolean
): number {
  return ipodMode && !compactIpodCarousel ? 65 : ipodMode ? 58 : 60;
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
  hideSleeveAtCenter = false,
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
  /**
   * Hide the center cover's sleeve while the album-flip overlay is
   * doing its 3D flip. Keeps the carousel mounted (side covers + the
   * floor reflection still visible underneath) so the tracklist reads
   * as a true overlay on Cover Flow, while preventing a second
   * "ghost" cover from sitting beneath the rotating flip element.
   */
  hideSleeveAtCenter?: boolean;
}) {
  const coverUrl = resolveCoverUrl(track, ipodMode);

  // Sleeve and reflection each track their own load (same URL, so
  // the browser cache lands them within a frame in practice). Two
  // independent state machines keep each <img>'s fade-in self-
  // contained — neither depends on the other firing onLoad.
  const sleeve = useImageLoaded(coverUrl);
  const reflection = useImageLoaded(coverUrl);

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
  const coverSize = getCoverSizeCqmin(ipodMode, compactIpodCarousel); // cqmin units
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
          pointerEvents:
            isCenter && (showCD || hideSleeveAtCenter) ? "none" : "auto",
          zIndex: 10,
          borderRadius: "1%",
        }}
        initial={false}
        animate={{
          y: isCenter && showCD ? "105%" : "0%",
          // Fade the center sleeve to invisible while the album-flip
          // overlay above is doing its 3D rotation. The flip overlay
          // renders its own copy of the cover as the front face, so
          // hiding this one prevents a "double cover" ghost during
          // the rotation. The transition is instant (duration 0) so
          // the swap is invisible — the overlay's front face is in
          // place by the time the sleeve fades.
          opacity: isCenter && hideSleeveAtCenter ? 0 : 1,
        }}
        transition={{
          y: { type: "spring", stiffness: 200, damping: 25 },
          opacity: { duration: 0 },
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
          <img
            ref={sleeve.ref}
            src={coverUrl}
            alt={track?.title || ""}
            draggable={false}
            onLoad={sleeve.onLoad}
            className="w-full h-full object-cover"
            style={{
              opacity: sleeve.loaded ? 1 : 0,
              transition: COVER_FADE_TRANSITION,
            }}
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
          Fades in to its 0.3 target opacity once the mirrored
          bitmap is ready, independent of the sleeve. */}
      <motion.div
        className="absolute w-full pointer-events-none"
        style={{
          height: "50%",
          top: "100%",
        }}
        initial={false}
        animate={{
          opacity: isCenter && (showCD || hideSleeveAtCenter) ? 0 : 1,
          y: isCenter && showCD ? "105%" : "0%",
        }}
        transition={{
          y: { type: "spring", stiffness: 200, damping: 25 },
          opacity: { duration: 0.15, ease: "easeOut" },
        }}
      >
        <img
          ref={reflection.ref}
          src={coverUrl || ""}
          alt=""
          draggable={false}
          onLoad={reflection.onLoad}
          className="w-full h-auto"
          style={{
            transform: "scaleY(-1)",
            opacity: coverUrl && reflection.loaded ? 0.3 : 0,
            transition: COVER_FADE_TRANSITION,
            maskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            display: coverUrl ? "block" : "none",
            borderRadius: "1%",
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// Album tracklist shown when the user clicks/taps an album cover in
// Cover Flow. Mirrors the iPod nano/classic 6G "flip the album cover
// over to reveal its tracklist" gesture: header band shows album +
// artist, rows below list every song in the album with its duration.
// The currently-selected row uses the same glossy blue gradient
// (`ipod-modern-row-selected`) as the menu list so the affordance reads
// as a single design system across the device.
function AlbumTracklist({
  album,
  artist,
  tracks,
  selectedIndex,
  currentlyPlayingIndex,
  isPlaying,
  isModern,
  ipodMode,
  onPlayTrack,
}: {
  album: string;
  artist?: string;
  tracks: Track[];
  selectedIndex: number;
  currentlyPlayingIndex: number;
  isPlaying: boolean;
  isModern: boolean;
  ipodMode: boolean;
  onPlayTrack: (indexInAlbum: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Auto-scroll the selected row into view as the user wheels through
  // the list. `block: nearest` keeps the existing scroll position when
  // the row is already visible (matches the iPod's behavior of only
  // scrolling when the highlight would leave the viewport).
  useEffect(() => {
    const el = rowRefs.current[selectedIndex];
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Row height matches the modern menu list (21px) so the panel sits
  // at the same density as the surrounding chrome. Classic skin gets
  // slightly taller rows because Chicago has more vertical metric.
  const rowHeight = isModern ? 21 : 22;

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col",
        isModern ? "bg-white" : ipodMode ? "bg-black" : "bg-black",
        ipodMode ? "ipod-force-font" : "karaoke-force-font"
      )}
    >
      {/* Album header — same blue gradient as the modern list selection
          highlight so the band reads as a "this is the album" anchor.
          Two lines: album title (bold, white) + artist (lighter,
          slightly translucent). Truncates with ellipsis to avoid
          wrapping inside the 150px-tall iPod screen. */}
      <div
        className={cn(
          "shrink-0 px-1.5 flex flex-col justify-center",
          isModern ? "ipod-modern-row-selected" : "bg-[#0a3667] text-white",
          isModern ? "font-ipod-modern-ui" : "font-chicago"
        )}
        style={{ minHeight: isModern ? 26 : 24, paddingTop: 2, paddingBottom: 2 }}
      >
        <div
          className={cn(
            "truncate font-semibold leading-[1.15]",
            isModern ? "text-[12px] tracking-tight" : "text-[13px]"
          )}
          title={album}
        >
          {album}
        </div>
        {artist && (
          <div
            className={cn(
              "truncate leading-[1.15]",
              isModern
                ? "text-[10px] text-white/85 tracking-tight"
                : "text-[11px] text-white/70"
            )}
            title={artist}
          >
            {artist}
          </div>
        )}
      </div>

      {/* Tracklist body — fills the remaining vertical space and
          scrolls when the album has more rows than fit. Each row is a
          flex container so the duration anchors to the right edge
          regardless of the title's length. Click/tap on a row plays
          that track via `onPlayTrack` (which routes through the iPod
          logic's `handleCoverFlowSelect`, so it also exits Cover Flow
          back to Now Playing). */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          // Hide the native scrollbar — we mirror the iPod nano look
          // which has no visible scrollbar inside Cover Flow's
          // tracklist (the highlight tells you where you are).
          scrollbarWidth: "none",
        }}
      >
        {tracks.map((track, index) => {
          const isSelected = index === selectedIndex;
          const isNowPlaying = index === currentlyPlayingIndex;
          return (
            <div
              key={track.id}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              data-track-row-index={index}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onPlayTrack(index);
              }}
              className={cn(
                "flex items-center justify-between gap-2 cursor-pointer select-none",
                "pl-1.5 pr-2",
                isModern ? "font-ipod-modern-ui" : "font-chicago",
                isSelected
                  ? isModern
                    ? "ipod-modern-row-selected"
                    : "bg-[#0a3667] text-[#c5e0f5]"
                  : isModern
                    ? "ipod-modern-row text-black"
                    : "text-[#c5e0f5] hover:bg-[#0a3667]/20"
              )}
              style={{ minHeight: rowHeight, height: rowHeight }}
            >
              <span
                className={cn(
                  "truncate min-w-0 flex-1",
                  isModern
                    ? "text-[12px] font-semibold leading-[1.15] tracking-tight"
                    : "text-[12px] leading-[1.15]"
                )}
                title={track.title}
              >
                {track.title}
              </span>
              {/* Now-playing affordance — small play/pause glyph
                  to the right of the title, before the duration. We
                  only render it when the row is the active song so
                  non-playing rows don't reserve any horizontal space
                  (keeps every title's left edge flush with the album
                  title in the header above). */}
              {isNowPlaying && (
                <span
                  className="shrink-0 leading-none text-[10px]"
                  aria-hidden
                >
                  {isPlaying ? "▶" : "❚❚"}
                </span>
              )}
              <span
                className={cn(
                  "shrink-0",
                  isModern
                    ? "text-[11px] tracking-tight font-semibold"
                    : "text-[11px]",
                  isSelected
                    ? isModern
                      ? "text-white/90"
                      : "text-[#c5e0f5]/85"
                    : isModern
                      ? "text-[rgb(99,101,103)]"
                      : "text-[#c5e0f5]/60"
                )}
              >
                {formatTrackDuration(track.durationMs)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Album-flip overlay. Sits above the carousel and does a real 3D
// rotateY transition: the *front* face is a copy of the album cover
// positioned at the carousel center cover's exact size/location, so
// the flip visually originates from the album art itself. The *back*
// face is the tracklist filling the remaining screen area, and
// becomes visible once the rotation crosses 90°. Backface-visibility
// keeps each side cleanly hidden when it's facing away.
//
// The carousel underneath stays mounted (the side covers + the
// reflection floor are still visible during the flip and at the edges
// of the rotated card), so the opened album reads as an overlay
// stacked on top of Cover Flow rather than a separate screen.
// Render the front + back faces of the album flip card. Returns a
// fragment so the caller (a motion.div that animates rotateY) is the
// direct AnimatePresence child — that way the back-flip exit
// animation actually runs to completion before the overlay unmounts.
//
// Mirrors the dashboard widget flip recipe (`WidgetChrome.tsx`):
//   - perspective on a STATIC parent (so the viewer's POV stays put
//     while the card itself spins),
//   - one rotating motion.div with `transformStyle: preserve-3d`,
//   - both faces use `backface-visibility: hidden` (+ -webkit-),
//   - front face gets a `translateZ(0)` to help Safari composite the
//     two stacked faces correctly,
//   - 0.6s + cubic-bezier(0.42, 0, 0.58, 1) ease — same curve the
//     dashboard uses, which feels noticeably smoother on the
//     back-flip than the previous ease-out we had.
function AlbumFlipFaces({
  album,
  artist,
  coverUrl,
  coverSizeCqmin,
  tracks: albumTracks,
  selectedIndex,
  currentlyPlayingIndex,
  isPlaying,
  isModern,
  ipodMode,
  onPlayTrack,
}: {
  album: string;
  artist?: string;
  coverUrl: string | null;
  coverSizeCqmin: number;
  tracks: Track[];
  selectedIndex: number;
  currentlyPlayingIndex: number;
  isPlaying: boolean;
  isModern: boolean;
  ipodMode: boolean;
  onPlayTrack: (indexInAlbum: number) => void;
}) {
  // The carousel's center cover is offset *up* from the screen
  // center by `marginTop: -8%` (iPod) / `-2%` (karaoke) of the
  // container WIDTH (CSS quirk: percentage vertical margins resolve
  // against the parent's width). Mirror that exact offset on the
  // flip's front face so the cover image sits in the same spot as
  // the carousel cover, and on the rotating wrapper's
  // `transform-origin` so the rotation pivots around the cover
  // (instead of the visual screen center, which would make the cover
  // arc in/out instead of flipping in place).
  const carouselMarginTop = ipodMode ? "-8%" : "-2%";
  return (
    <>
      {/* FRONT FACE — the album cover, sized + positioned to match
          the carousel center cover (same flex centering + marginTop
          the carousel uses) so the flip starts from the actual album
          art instead of the screen center. */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transform: "translateZ(0)",
        }}
      >
        <div
          style={{
            marginTop: carouselMarginTop,
            width: `${coverSizeCqmin}cqmin`,
            height: `${coverSizeCqmin}cqmin`,
          }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              draggable={false}
              className="w-full h-full object-cover bg-neutral-400"
              style={{
                borderRadius: "1%",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              }}
            />
          ) : (
            <div
              className="w-full h-full bg-neutral-400"
              style={{ borderRadius: "1%" }}
            />
          )}
        </div>
      </div>

      {/* BACK FACE — the album tracklist as an inset card. No bottom
          inset so it extends to the screen bottom edge; larger
          horizontal inset (12% iPod, 10% karaoke) so the carousel
          covers underneath still show through at the sides; top is
          pulled up to roughly meet the cover's upper edge so the
          flip stays anchored to the album art. The pre-applied 180°
          rotation cancels with the wrapper's animated 180° to leave
          the tracklist front-facing once the flip completes. */}
      <div
        className="absolute"
        style={{
          top: ipodMode ? "5%" : "15%",
          bottom: 0,
          left: ipodMode ? "12%" : "10%",
          right: ipodMode ? "12%" : "10%",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transform: "rotateY(180deg) translateZ(0)",
          overflow: "hidden",
          boxShadow:
            "0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)",
        }}
      >
        <AlbumTracklist
          album={album}
          artist={artist}
          tracks={albumTracks}
          selectedIndex={selectedIndex}
          currentlyPlayingIndex={currentlyPlayingIndex}
          isPlaying={isPlaying}
          isModern={isModern}
          ipodMode={ipodMode}
          onPlayTrack={onPlayTrack}
        />
      </div>
    </>
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
  // When the user presses the wheel center on an album cover, the
  // cover flips over to reveal that album's tracklist. The flip is
  // album-scoped: navigating to a different cover snaps back to the
  // un-flipped state (matches the iPod nano/classic 6G behavior).
  const [isFlipped, setIsFlipped] = useState(false);
  // True while the album-flip overlay is mid-rotation (in either
  // direction). Lets us keep the underlying carousel center sleeve
  // hidden for the full back-flip duration so the reverse animation
  // actually shows the tracklist rotating away — without this the
  // sleeve pops back to visible the instant Menu is pressed and the
  // reverse rotation reads as "the tracklist just disappeared". Same
  // pattern the dashboard widget flip uses (`WidgetChrome.tsx`).
  const [isFlipAnimating, setIsFlipAnimating] = useState(false);
  const flipAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isInitialFlipRef = useRef(true);
  // Selected row inside the tracklist while flipped. Reset whenever
  // the active album changes so wheel rotation always starts at the
  // currently-playing track (or the first track if none of this album
  // is playing).
  const [selectedTrackInAlbum, setSelectedTrackInAlbum] = useState(0);
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

  // When Cover Flow closes, snap the flip back to the carousel side
  // so re-opening lands the user on the album row rather than
  // momentarily flashing the previous album's tracklist as the open
  // animation runs.
  useEffect(() => {
    if (!isVisible) {
      setIsFlipped(false);
    }
  }, [isVisible]);

  // Navigating to a different album cover collapses any open
  // tracklist back to the carousel face. Without this, scrolling
  // through albums while flipped would either swap tracklists under
  // the user's selection or strand the highlight on a row that no
  // longer corresponds to the visible album.
  useEffect(() => {
    setIsFlipped(false);
  }, [selectedIndex]);

  // Track flip-animation duration so the carousel sleeve stays
  // hidden for the entire forward + reverse rotation. Skipped on the
  // very first run (initial mount, no animation actually playing).
  useEffect(() => {
    if (isInitialFlipRef.current) {
      isInitialFlipRef.current = false;
      return;
    }
    setIsFlipAnimating(true);
    if (flipAnimationTimerRef.current) {
      clearTimeout(flipAnimationTimerRef.current);
    }
    flipAnimationTimerRef.current = setTimeout(() => {
      setIsFlipAnimating(false);
    }, 600);
    return () => {
      if (flipAnimationTimerRef.current) {
        clearTimeout(flipAnimationTimerRef.current);
      }
    };
  }, [isFlipped]);

  // Compute the current cover item + its tracklist (in browsableTracks
  // order). For un-grouped covers (one cover per song) this is just a
  // single-item list, which we never actually flip into — we keep the
  // existing "tap plays the song" shortcut for that case.
  const currentItem = coverItems[selectedIndex];
  const albumTracks = useMemo<Track[]>(() => {
    if (!currentItem) return [];
    return currentItem.trackIndices
      .map((idx) => tracks[idx])
      .filter((t): t is Track => Boolean(t));
  }, [currentItem, tracks]);

  // Default the tracklist highlight to the currently-playing song
  // inside this album (so flipping while a track from this album is
  // playing puts the highlight on it). Falls back to the first row.
  useEffect(() => {
    if (!currentItem) {
      setSelectedTrackInAlbum(0);
      return;
    }
    const playingPos = currentItem.trackIndices.findIndex(
      (idx) => idx === currentIndex
    );
    setSelectedTrackInAlbum(playingPos >= 0 ? playingPos : 0);
  }, [currentItem, currentIndex]);

  // Navigate to next/previous
  const navigateNext = useCallback(() => {
    if (isFlipped) {
      setSelectedTrackInAlbum((prev) =>
        Math.min(albumTracks.length - 1, prev + 1)
      );
      onRotation();
      return;
    }
    setSelectedIndex((prev) => {
      const next = Math.min(coverItems.length - 1, prev + 1);
      return next;
    });
    setShowCD(false); // Hide CD when navigating
    onRotation();
  }, [isFlipped, albumTracks.length, coverItems.length, onRotation]);

  const navigatePrevious = useCallback(() => {
    if (isFlipped) {
      setSelectedTrackInAlbum((prev) => Math.max(0, prev - 1));
      onRotation();
      return;
    }
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1);
      return next;
    });
    setShowCD(false); // Hide CD when navigating
    onRotation();
  }, [isFlipped, onRotation]);

  // Select the current item.
  //   Un-flipped → flip to reveal the tracklist (always, for
  //     consistency — single-track covers just flip into a one-row
  //     tracklist that the user can confirm by pressing center
  //     again).
  //   Flipped → play the highlighted row in the album.
  const selectCurrent = useCallback(() => {
    const item = coverItems[selectedIndex];
    if (!item) return;
    if (isFlipped) {
      const trackIndex =
        item.trackIndices[selectedTrackInAlbum] ?? item.trackIndex;
      onSelectTrack(trackIndex);
      return;
    }
    setShowCD(false);
    setIsFlipped(true);
  }, [
    coverItems,
    isFlipped,
    onSelectTrack,
    selectedIndex,
    selectedTrackInAlbum,
  ]);

  // Wheel `Menu` press: when flipped we eat the press to flip back to
  // the carousel; otherwise we let the caller exit Cover Flow.
  const handleMenuButton = useCallback(() => {
    if (isFlipped) {
      setIsFlipped(false);
      return true;
    }
    return false;
  }, [isFlipped]);

  // Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      navigateNext,
      navigatePrevious,
      selectCurrent,
      handleMenuButton,
    }),
    [navigateNext, navigatePrevious, selectCurrent, handleMenuButton]
  );

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
        // While flipped, the wheel rotation maps to row navigation in
        // the tracklist — arrow up/down should follow the same
        // mapping for keyboard users so they can step through songs.
        // Up/Down do nothing on the carousel (it's a horizontal-only
        // gesture surface).
        case "ArrowDown":
          if (isFlipped) {
            e.preventDefault();
            navigateNext();
          }
          break;
        case "ArrowUp":
          if (isFlipped) {
            e.preventDefault();
            navigatePrevious();
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          selectCurrent();
          break;
        case "Escape":
          e.preventDefault();
          // Mirrors the Menu wheel button: unflip first if needed,
          // otherwise close Cover Flow entirely.
          if (handleMenuButton()) return;
          onExit();
          break;
      }
    },
    [
      navigateNext,
      navigatePrevious,
      selectCurrent,
      handleMenuButton,
      onExit,
      isFlipped,
    ]
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

  // Geometry shared by the carousel + the album-flip overlay so the
  // overlay's front face perfectly matches the size of the carousel
  // center cover (the flip then reads as the cover itself rotating
  // away to reveal the tracklist on its back).
  const flipCoverSizeCqmin = getCoverSizeCqmin(
    ipodMode,
    isModernIpodCoverFlow
  );
  const flipCoverUrl = useMemo(
    () => resolveCoverUrl(currentItem?.track ?? null, ipodMode),
    [currentItem, ipodMode]
  );

  const playItemInPlace = useCallback(
    (coverIndex: number) => {
      const item = coverItems[coverIndex];
      if (item) onPlayTrackInPlace?.(item.trackIndex);
    },
    [coverItems, onPlayTrackInPlace]
  );

  // Click on a row inside the album tracklist: route through the
  // standard select handler so the song starts playing and Cover Flow
  // exits back to Now Playing — same UX as picking a song from the
  // All Songs menu list.
  const handleSelectAlbumTrack = useCallback(
    (indexInAlbum: number) => {
      if (!currentItem) return;
      const trackIndex =
        currentItem.trackIndices[indexInAlbum] ?? currentItem.trackIndex;
      onSelectTrack(trackIndex);
    },
    [currentItem, onSelectTrack]
  );

  // The currently-playing position inside the active album, or -1 if
  // none of this album's tracks are the active song. Drives the small
  // play/pause glyph in the tracklist.
  const playingPositionInAlbum = useMemo(() => {
    if (!currentItem) return -1;
    return currentItem.trackIndices.findIndex((idx) => idx === currentIndex);
  }, [currentItem, currentIndex]);

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
            showCD || isFlipped
              ? "cursor-default"
              : "cursor-grab active:cursor-grabbing",
          )}
          onPanStart={showCD || isFlipped ? undefined : handlePanStart}
          onPan={showCD || isFlipped ? undefined : handlePan}
          onPanEnd={showCD || isFlipped ? undefined : handlePanEnd}
          onWheel={showCD || isFlipped ? undefined : handleWheel}
          onClick={() => {
            if (isPanningRef.current || longPressFiredRef.current) {
              longPressFiredRef.current = false;
              return;
            }
            if (showCD) {
              setShowCD(false);
              return;
            }
            // While flipped the AlbumTracklist overlay (which sits on
            // top with its own row click handlers) consumes clicks,
            // so this handler typically won't fire. Skip out anyway
            // as a safety so we don't accidentally re-flip on stray
            // bubbled clicks.
            if (isFlipped) return;
            selectCurrent();
          }}
          onMouseDown={
            showCD || isFlipped ? undefined : () => startLongPress()
          }
          onMouseUp={showCD || isFlipped ? undefined : () => endLongPress()}
          onMouseLeave={
            showCD || isFlipped ? undefined : () => endLongPress()
          }
          onTouchStart={
            showCD || isFlipped ? undefined : () => startLongPress()
          }
          onTouchEnd={showCD || isFlipped ? undefined : () => endLongPress()}
          onTouchCancel={
            showCD || isFlipped ? undefined : () => endLongPress()
          }
          style={{
            touchAction: showCD || isFlipped ? "auto" : "none",
            overflow: "visible",
          }}
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
                  hideSleeveAtCenter={(isFlipped || isFlipAnimating) && position === 0}
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

        {/* Album-flip overlay (inline branch). Flips the actual album
            cover over to reveal the tracklist on its back face. The
            host menu panel renders the "Cover Flow" titlebar above
            this CoverFlow div, so we don't need a top offset here.
            The static `perspective` wrapper keeps the viewer's POV
            put while the inner motion.div spins (matches the
            dashboard widget flip recipe). */}
        <div
          className="absolute inset-0 z-30 pointer-events-none"
          style={{ perspective: 1500, WebkitPerspective: 1500 }}
        >
          <AnimatePresence>
            {isFlipped && currentItem && (
              <motion.div
                key={`flip-${currentItem.key}`}
                className="absolute inset-0"
                style={{
                  transformStyle: "preserve-3d",
                  WebkitTransformStyle: "preserve-3d",
                  // Pivot around the carousel cover (which sits a few
                  // percent above the visual screen center because of
                  // the carousel's marginTop offset), not the screen
                  // center — so the cover stays put while the card
                  // flips around it instead of arcing in/out.
                  transformOrigin: ipodMode
                    ? "50% 35%"
                    : "50% 47%",
                  pointerEvents: "auto",
                }}
                initial={{ rotateY: 0 }}
                animate={{ rotateY: 180 }}
                exit={{ rotateY: 0 }}
                transition={{ duration: 0.6, ease: [0.42, 0, 0.58, 1] }}
              >
                <AlbumFlipFaces
                  album={currentItem.title}
                  artist={currentItem.artist}
                  coverUrl={flipCoverUrl}
                  coverSizeCqmin={flipCoverSizeCqmin}
                  tracks={albumTracks}
                  selectedIndex={selectedTrackInAlbum}
                  currentlyPlayingIndex={playingPositionInAlbum}
                  isPlaying={isPlaying}
                  isModern={isModernIpodCoverFlow}
                  ipodMode={ipodMode}
                  onPlayTrack={handleSelectAlbumTrack}
                />
              </motion.div>
            )}
          </AnimatePresence>
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
                    // `translateY(-0.5px)` matches the main IpodScreen
                    // titlebar so the play/pause glyph reads as
                    // optically centered above the 1px bottom hairline
                    // (and isn't pulled low by its own 1px drop-shadow).
                    "flex items-center justify-center w-[14px] h-[14px] [transform:translateY(-0.5px)]",
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
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              showCD || isFlipped
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing"
            )}
            onPanStart={showCD || isFlipped ? undefined : handlePanStart}
            onPan={showCD || isFlipped ? undefined : handlePan}
            onPanEnd={showCD || isFlipped ? undefined : handlePanEnd}
            onWheel={showCD || isFlipped ? undefined : handleWheel}
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
              // While flipped, the AlbumTracklist overlay above
              // captures clicks. Bail out so this fallback doesn't
              // accidentally re-trigger the flip (or play the
              // currently-highlighted row).
              if (isFlipped) return;
              selectCurrent();
            }}
            onMouseDown={
              showCD || isFlipped ? undefined : () => startLongPress()
            }
            onMouseUp={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            onMouseLeave={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            onTouchStart={
              showCD || isFlipped ? undefined : () => startLongPress()
            }
            onTouchEnd={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            onTouchCancel={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            style={{
              touchAction: showCD || isFlipped ? "auto" : "none",
              overflow: "visible",
            }}
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
                    hideSleeveAtCenter={(isFlipped || isFlipAnimating) && position === 0}
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

          {/* Album-flip overlay (overlay branch). Sits below the
              modern titlebar (this branch renders the titlebar
              inside CoverFlow, unlike the inline branch where the
              host owns it). Static perspective wrapper keeps the
              viewer's POV put while the inner motion.div rotates. */}
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              top: isModernIpodCoverFlow ? MODERN_TITLEBAR_HEIGHT : 0,
              left: 0,
              right: 0,
              bottom: 0,
              perspective: 1500,
              WebkitPerspective: 1500,
            }}
          >
            <AnimatePresence>
              {isFlipped && currentItem && (
                <motion.div
                  key={`flip-${currentItem.key}`}
                  className="absolute inset-0"
                  style={{
                    transformStyle: "preserve-3d",
                    WebkitTransformStyle: "preserve-3d",
                    // Pivot around the carousel cover (a few percent
                    // above the visual screen center) so the cover
                    // stays put while the card flips around it.
                    transformOrigin: ipodMode
                      ? "50% 35%"
                      : "50% 47%",
                    pointerEvents: "auto",
                  }}
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: 180 }}
                  exit={{ rotateY: 0 }}
                  transition={{ duration: 0.6, ease: [0.42, 0, 0.58, 1] }}
                >
                  <AlbumFlipFaces
                    album={currentItem.title}
                    artist={currentItem.artist}
                    coverUrl={flipCoverUrl}
                    coverSizeCqmin={flipCoverSizeCqmin}
                    tracks={albumTracks}
                    selectedIndex={selectedTrackInAlbum}
                    currentlyPlayingIndex={playingPositionInAlbum}
                    isPlaying={isPlaying}
                    isModern={isModernIpodCoverFlow}
                    ipodMode={ipodMode}
                    onPlayTrack={handleSelectAlbumTrack}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
