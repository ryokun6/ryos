import { useEffect, useMemo, useRef, useState } from "react";
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

/** Default reveal duration for a line when we don't have a "next line"
 *  timestamp to derive the cadence from (e.g. final line of the song). */
const DEFAULT_LINE_DURATION_MS = 3000;
/** Floor for the reveal duration so very short LRC lines still appear
 *  to type rather than instantly snapping. */
const MIN_LINE_DURATION_MS = 700;
/** Cap so a long instrumental gap before the *next* line doesn't make
 *  the current line drip out for 30+ seconds. */
const MAX_LINE_DURATION_MS = 6000;
/** Reveal slightly faster than the line's duration so the final
 *  character lands a beat before the next line takes over. */
const REVEAL_SPEED_FACTOR = 0.85;

/**
 * Single-line, TV-style closed-caption overlay for the MTV channel.
 *
 * MTV plays from the user's iPod library, so we can reuse the same
 * `useLyrics` pipeline the iPod / Karaoke apps use — the song id of the
 * current TV video is the same id the iPod uses for lyrics lookups.
 *
 * Visually we mimic broadcast closed captions: Geneva pixel font,
 * white-on-black plate, centered near the bottom of the picture. Each
 * line types itself out character-by-character timed to the line's
 * duration (next-line-start minus current-line-start), so faster lyric
 * lines reveal faster and slow lines drift in.
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

  // Resolve the active line plus the timing window we should type it out
  // across. We derive the duration from the gap to the next line's
  // start; this keeps fast verses snappy and slow lines unhurried.
  const { currentText, lineKey, lineDurationMs } = useMemo(() => {
    if (!visible) {
      return { currentText: "", lineKey: "", lineDurationMs: 0 };
    }
    const idx = lyricsState.currentLine;
    if (idx < 0) {
      return { currentText: "", lineKey: "", lineDurationMs: 0 };
    }
    const line = lyricsState.lines[idx];
    const text = line?.words?.trim() ?? "";
    if (!text) {
      return { currentText: "", lineKey: "", lineDurationMs: 0 };
    }
    const startMs = parseInt(line!.startTimeMs, 10);
    const nextLine = lyricsState.lines[idx + 1];
    const nextMs = nextLine ? parseInt(nextLine.startTimeMs, 10) : NaN;
    let duration = Number.isFinite(nextMs) && Number.isFinite(startMs)
      ? nextMs - startMs
      : DEFAULT_LINE_DURATION_MS;
    duration = Math.min(MAX_LINE_DURATION_MS, Math.max(MIN_LINE_DURATION_MS, duration));
    // Use both index and start time in the key so two consecutive
    // identical lyric lines (e.g. repeated chorus hook) still re-trigger
    // the typewriter animation instead of snapping to fully-revealed.
    const key = `${idx}:${line!.startTimeMs}`;
    return { currentText: text, lineKey: key, lineDurationMs: duration };
  }, [visible, lyricsState.currentLine, lyricsState.lines]);

  // Local typewriter clock. We re-base on every line change rather than
  // tying reveal progress to `playedSeconds` directly because react-player's
  // default progress interval is coarse (~1Hz on this surface), which would
  // make the reveal step in obvious chunks instead of flowing per-frame.
  const [revealedChars, setRevealedChars] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lineStartRef = useRef<number>(0);

  useEffect(() => {
    setRevealedChars(0);
    if (!currentText || !lineDurationMs) return;
    lineStartRef.current = performance.now();
    // Reveal speed factor < 1 so the line finishes a touch early, leaving
    // a brief "fully shown" beat before the next line takes the stage.
    const totalRevealMs = Math.max(
      MIN_LINE_DURATION_MS * REVEAL_SPEED_FACTOR,
      lineDurationMs * REVEAL_SPEED_FACTOR
    );
    const tick = () => {
      const elapsed = performance.now() - lineStartRef.current;
      const progress = Math.min(1, Math.max(0, elapsed / totalRevealMs));
      const target = Math.min(
        currentText.length,
        Math.ceil(progress * currentText.length)
      );
      setRevealedChars(target);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [lineKey, currentText, lineDurationMs]);

  if (!visible) return null;

  const isFullscreen = variant === "fullscreen";
  const visibleText = currentText.slice(0, revealedChars);
  // Render the not-yet-revealed remainder as transparent text inside the
  // same span so the caption plate sizes to the *full* line up front,
  // preventing the box from growing as characters appear.
  const hiddenText = currentText.slice(revealedChars);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4",
        isFullscreen ? "bottom-[14%]" : "bottom-6"
      )}
      aria-hidden
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {currentText ? (
          <motion.div
            key={lineKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "font-geneva-12 text-white text-center leading-none",
              // Solid black plate matching the broadcast CC look.
              "bg-black/85",
              // Squared-off CC plate (no rounding) keeps the broadcast feel.
              "max-w-[92%]",
              isFullscreen
                ? "text-[clamp(18px,3.2vw,36px)] px-3 py-2"
                : "text-[18px] sm:text-[20px] px-2 py-1"
            )}
            style={{
              // Slight letter-spacing so the pixel font reads cleanly at
              // small sizes; matches the LCD column treatment.
              letterSpacing: "0.01em",
              // Tighten leading; CCs are typically a single dense line.
              lineHeight: 1.15,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <span>{visibleText}</span>
            {hiddenText ? (
              <span aria-hidden className="opacity-0">
                {hiddenText}
              </span>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
