import { motion } from "motion/react";
import type { Track } from "@/stores/useIpodStore";
import { AlbumTracklist } from "./AlbumTracklist";

export function AlbumFlipFaces({
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
  onExitFlip,
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
  onExitFlip?: () => void;
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
              style={{ borderRadius: "1%" }}
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
          the tracklist front-facing once the flip completes.

          The shadow lives on the OUTER wrapper (no overflow:hidden)
          so the soft outset box-shadow can actually paint outside
          the card bounds — putting `overflow: hidden` on the same
          element clips the shadow entirely, which is what was
          happening before. The inner `overflow:hidden` div is what
          actually clips the tracklist content. The shadow is
          animated rather than static so it grows in as the card
          rotates into view (and shrinks back out on the back-flip)
          — both keyframes use the same comma-separated structure so
          Motion can interpolate the values. */}
      <motion.div
        className="absolute"
        style={{
          top: ipodMode ? "5%" : "15%",
          bottom: 0,
          left: ipodMode ? "12%" : "10%",
          right: ipodMode ? "12%" : "10%",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transform: "rotateY(180deg) translateZ(0)",
        }}
        initial={{
          boxShadow:
            "0 0 0 0 rgba(0, 0, 0, 0), 0 0 0 0 rgba(0, 0, 0, 0)",
        }}
        animate={{
          boxShadow:
            "0 12px 32px 0 rgba(0, 0, 0, 0.45), 0 2px 8px 0 rgba(0, 0, 0, 0.25)",
        }}
        exit={{
          boxShadow:
            "0 0 0 0 rgba(0, 0, 0, 0), 0 0 0 0 rgba(0, 0, 0, 0)",
        }}
        transition={{
          duration: 0.45,
          delay: 0.15,
          ease: [0.42, 0, 0.58, 1],
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
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
            onExitFlip={onExitFlip}
          />
        </div>
      </motion.div>
    </>
  );
}
