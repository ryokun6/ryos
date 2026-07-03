import { useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Track } from "@/shared/media/library";
import { useImageLoaded } from "../../hooks/useImageLoaded";
import { COVER_FADE_TRANSITION } from "./constants";
import { getCoverSizeCqmin, resolveCoverUrl } from "./utils";
import { SpinningCD } from "./SpinningCD";

export function CoverImage({
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
  isAlbumViewOpen = false,
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
  /**
   * Whether the album view (flipped state) is currently OPEN, not
   * including the back-flip animation window. Drives the reflection
   * fade independently of `hideSleeveAtCenter` so the reflection can
   * fade in DURING the back-flip rotation rather than waiting for it
   * to finish (otherwise it pops in 600ms late).
   */
  isAlbumViewOpen?: boolean;
}) {
  const coverUrl = resolveCoverUrl(track, ipodMode);

  // Sleeve and reflection each track their own load (same URL, so
  // the browser cache lands them within a frame in practice). Two
  // independent state machines keep each <img>'s fade-in self-
  // contained — neither depends on the other firing onLoad.
  const sleeve = useImageLoaded(coverUrl);
  const reflection = useImageLoaded(coverUrl);
  const showSleeveBitmap = Boolean(coverUrl) && !sleeve.failed;

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
            exit={{ opacity: 0, y: "18%" }}
            transition={{
              y: { type: "spring", stiffness: 200, damping: 25 },
              opacity: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
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
        {!showSleeveBitmap ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-900">
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
        ) : (
          <img
            ref={sleeve.ref}
            src={coverUrl!}
            alt={track?.title || ""}
            draggable={false}
            onLoad={sleeve.onLoad}
            onError={sleeve.onError}
            className="w-full h-full object-cover"
            style={{
              opacity: sleeve.loaded ? 1 : 0,
              transition: COVER_FADE_TRANSITION,
            }}
          />
        )}
      </motion.div>
      
      {/* Reflection - moves down with cover when CD is shown.
          Fades in to its 0.3 target opacity once the mirrored
          bitmap is ready, independent of the sleeve.

          The fade is tied to `isAlbumViewOpen` (i.e. just `isFlipped`)
          rather than `hideSleeveAtCenter` so it tracks the actual
          flip rotation rather than the 600ms post-flip sleeve-hide
          window. Opening: reflection fades OUT immediately,
          synchronized with the first half of the 0.6s card flip
          (gone by the time the card hits 90° edge-on). Closing:
          reflection fades IN with a 0.3s delay so it appears on the
          back half of the flip — by the time the card returns to
          0° (cover front-facing) the reflection is fully back. */}
      <motion.div
        className="absolute w-full pointer-events-none"
        style={{
          height: "50%",
          top: "100%",
        }}
        initial={false}
        animate={{
          opacity: isCenter && (showCD || isAlbumViewOpen) ? 0 : 1,
          y: isCenter && showCD ? "105%" : "0%",
        }}
        transition={{
          y: { type: "spring", stiffness: 200, damping: 25 },
          opacity: {
            duration: 0.3,
            ease: "easeOut",
            delay: isCenter && isAlbumViewOpen ? 0 : 0.3,
          },
        }}
      >
        <img
          ref={reflection.ref}
          src={coverUrl || ""}
          alt=""
          draggable={false}
          onLoad={reflection.onLoad}
          onError={reflection.onError}
          className="w-full h-auto"
          style={{
            transform: "scaleY(-1)",
            opacity:
              coverUrl && !reflection.failed && reflection.loaded ? 0.3 : 0,
            transition: COVER_FADE_TRANSITION,
            maskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
            display: coverUrl && !sleeve.failed ? "block" : "none",
            borderRadius: "1%",
          }}
        />
      </motion.div>
    </motion.div>
  );
}
