import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { useLyrics } from "@/hooks/useLyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { cn } from "@/lib/utils";

interface MtvLyricsOverlayProps {
  /** The id of the currently playing video. For the MTV channel this maps
   *  1:1 to an iPod track id (see `trackToVideo` in `useTvLogic`). */
  songId: string | undefined;
  /** Optional title used as a fallback when the lyrics service has to do
   *  a fresh search (matches the iPod / Karaoke wiring). */
  title?: string;
  /** Optional artist used as a fallback for the same reason. */
  artist?: string;
  /** Current playback time, in seconds, from ReactPlayer's onProgress. */
  playedSeconds: number;
  /** When false, no overlay is rendered. */
  visible: boolean;
  /**
   * Layout / sizing variant. `windowed` is the in-app TV; `fullscreen`
   * uses larger type and viewport-relative offsets so the line stays
   * legible on big displays.
   */
  variant?: "windowed" | "fullscreen";
}

/**
 * Single-line lyric ticker shown over the MTV channel video.
 *
 * MTV plays from the user's iPod library, so we can reuse the same
 * `useLyrics` pipeline the iPod / Karaoke apps use — the song id of the
 * current TV video is the same id the iPod uses for lyrics lookups.
 *
 * Visually we match the existing TV LCD/status text: a clean sans-serif
 * line with a black stroke for readability over arbitrary YouTube
 * frames. Only the active lyric line is shown (no past / next lines),
 * crossfaded as playback advances.
 */
export function MtvLyricsOverlay({
  songId,
  title,
  artist,
  playedSeconds,
  visible,
  variant = "windowed",
}: MtvLyricsOverlayProps) {
  // Pull the matching iPod track so we can apply its `lyricOffset`. Using
  // a shallow selector keeps this overlay from re-rendering on unrelated
  // ipod store changes.
  const track = useIpodStore(
    useShallow((s) =>
      songId ? s.tracks.find((t) => t.id === songId) ?? null : null
    )
  );
  const lyricOffsetSeconds = (track?.lyricOffset ?? 0) / 1000;

  const lyricsState = useLyrics({
    songId: songId ?? "",
    title: title ?? track?.title ?? "",
    artist: artist ?? track?.artist ?? "",
    currentTime: playedSeconds + lyricOffsetSeconds,
  });

  const currentText = useMemo(() => {
    if (!visible) return "";
    const idx = lyricsState.currentLine;
    if (idx < 0) return "";
    const line = lyricsState.lines[idx];
    return line?.words?.trim() ?? "";
  }, [visible, lyricsState.currentLine, lyricsState.lines]);

  if (!visible) return null;

  const isFullscreen = variant === "fullscreen";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-6",
        isFullscreen ? "bottom-[18%]" : "bottom-6"
      )}
      aria-hidden
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {currentText ? (
          <motion.div
            key={currentText}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "font-lyrics-sans text-center text-white",
              // Cap width so a long line stays on a single rendered row but
              // wraps off-screen via truncate rather than spilling under the
              // LCD / pushing the YouTube iframe.
              "max-w-[92%] truncate",
              "font-medium tracking-wide",
              isFullscreen
                ? "text-[clamp(20px,4vw,44px)]"
                : "text-[18px] sm:text-[22px] md:text-[26px]"
            )}
            style={{
              // Match the LCD's `StatusDisplay` outline approach so the
              // lyric stays readable over bright YouTube frames without
              // adding a backplate that would feel un-broadcast-y.
              textShadow:
                "0 0 6px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.55)",
            }}
          >
            {currentText}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
