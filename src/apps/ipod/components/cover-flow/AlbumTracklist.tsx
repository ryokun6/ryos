import { useEffect, useRef } from "react";
import { IPOD_MODERN_MENU_ROW_HEIGHT_PX } from "../../constants";
import type { Track } from "@/shared/media/library";
import { cn } from "@/lib/utils";
import { formatTrackDuration } from "./utils";

export function AlbumTracklist({
  album,
  artist,
  tracks,
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
  tracks: Track[];
  selectedIndex: number;
  currentlyPlayingIndex: number;
  isPlaying: boolean;
  isModern: boolean;
  ipodMode: boolean;
  onPlayTrack: (indexInAlbum: number) => void;
  /** Tap-to-exit handler. Header tap exits the flip; row taps still
   *  fall through to onPlayTrack and exit Cover Flow entirely. */
  onExitFlip?: () => void;
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

  // Row height matches the modern menu list so the panel sits at the same
  // density as the surrounding chrome. Classic skin gets slightly taller rows
  // because Chicago has more vertical metric.
  const rowHeight = isModern ? IPOD_MODERN_MENU_ROW_HEIGHT_PX : 22;

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col",
        isModern ? "bg-white" : "bg-black",
        ipodMode ? "ipod-force-font" : "karaoke-force-font"
      )}
    >
      {/* Album header — muted blue gradient on modern, deep blue on
          classic / karaoke. Tap on the header exits the flip back to
          the carousel; row taps
          below stop propagation so they still play their song
          instead of just unflipping. */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onExitFlip?.();
        }}
        className={cn(
          "shrink-0 px-1.5 flex flex-col justify-center cursor-pointer select-none",
          isModern ? "ipod-modern-album-header" : "bg-[#0a3667] text-white",
          // Modern iPod keeps its iOS-style UI font; classic iPod
          // uses Geneva-12 (the 1st-gen iPod's own UI bitmap font);
          // karaoke uses the theme-aware OS sans-serif so it blends
          // with whichever desktop theme is active.
          isModern
            ? "font-ipod-modern-ui"
            : ipodMode
              ? "font-geneva-12"
              : "font-os-ui"
        )}
        style={{
          minHeight: isModern ? 26 : 22,
          paddingTop: isModern ? 3 : 1,
          paddingBottom: 1,
        }}
      >
        <div
          className={cn(
            "truncate font-semibold",
            isModern
              ? "text-[12px] leading-[0.96] tracking-tight"
              : ipodMode
                ? "text-[11px] leading-none"
                : "text-[13px] leading-none"
          )}
          title={album}
        >
          {album}
        </div>
        {artist && (
          <div
            className={cn(
              "truncate",
              // Modern stack reads tightest with no extra gap between
              // the two lines (the font's natural metrics already
              // give a small visible separation). Classic / karaoke
              // get a 1px nudge so the bitmap / OS font lines don't
              // visually collide.
              isModern ? "-mt-[2px] leading-[0.96]" : "mt-[1px] leading-none",
              isModern
                ? "text-[10px] text-white/85 tracking-tight"
                : ipodMode
                  ? "text-[9px] text-white/70"
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
                // Same font policy as the header: modern → iPod-
                // modern UI font; classic iPod → Geneva-12 bitmap;
                // karaoke → theme-aware OS sans.
                isModern
                  ? "font-ipod-modern-ui"
                  : ipodMode
                    ? "font-geneva-12"
                    : "font-os-ui",
                isSelected
                  ? isModern
                    ? "ipod-modern-row-selected"
                    : "bg-[#0a3667] text-white"
                  : isModern
                    ? "ipod-modern-row text-black"
                    : "text-white hover:bg-white/10"
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
                      : "text-white/85"
                    : isModern
                      ? "text-[rgb(99,101,103)]"
                      : "text-white/60"
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
