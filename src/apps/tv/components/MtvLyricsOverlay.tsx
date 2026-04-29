import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLyrics } from "@/hooks/useLyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { cn } from "@/lib/utils";
import type { LyricLine } from "@/types/lyrics";

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

/** Cap reveal extrapolation between coarse `playedSeconds` updates so a
 *  long buffering / pause can't make the typewriter run past the line. */
const MAX_INTERPOLATE_MS = 500;
/** Fallback line duration (ms) when there is no next line to derive
 *  cadence from (last line of the song). */
const FALLBACK_LINE_DURATION_MS = 4000;

/**
 * Single-line, TV-style closed-caption overlay for the MTV channel.
 *
 * MTV plays from the user's iPod library, so we reuse the same
 * `useLyrics` pipeline iPod / Karaoke use — the song id of the current
 * TV video is the same id the iPod uses for lyrics lookups.
 *
 * Reveal timing matches the audio:
 *   - When the LRC has KRC word timings (`wordTimings[]`), each character
 *     is revealed at its true word's `startTimeMs + durationMs` window.
 *   - Otherwise we evenly distribute characters across the line duration
 *     (next-line-start − current-line-start), matching how karaoke /
 *     iPod fall back when KRC data is missing.
 *
 * Smoothness is achieved with the same trick `WordTimingHighlight` uses
 * in `LyricsDisplay`: take the latest prop `currentTimeMs` and
 * extrapolate forward via `performance.now()` per `requestAnimationFrame`
 * tick (capped, so a pause can't drift), instead of being limited by
 * react-player's coarse progress callbacks.
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
  const lyricOffsetMs = track?.lyricOffset ?? 0;
  const currentTimeMs = playedSeconds * 1000 + lyricOffsetMs;

  const lyricsState = useLyrics({
    songId: songId ?? "",
    title: title ?? track?.title ?? "",
    artist: artist ?? track?.artist ?? "",
    // useLyrics expects seconds; lyricOffset is folded back in here so
    // currentLine matches what we'll render.
    currentTime: currentTimeMs / 1000,
  });

  const activeLine: LyricLine | null = useMemo(() => {
    if (!visible) return null;
    const idx = lyricsState.currentLine;
    if (idx < 0) return null;
    return lyricsState.lines[idx] ?? null;
  }, [visible, lyricsState.currentLine, lyricsState.lines]);

  const fullText = (activeLine?.words ?? "").trim();
  const lineStartMs = activeLine ? parseInt(activeLine.startTimeMs, 10) : NaN;

  // Duration of the current line: from this line's start to the next
  // line's start. Falls back to a sensible default for the last line.
  const lineDurationMs = useMemo(() => {
    if (!activeLine) return 0;
    const idx = lyricsState.currentLine;
    const next = lyricsState.lines[idx + 1];
    if (!next) return FALLBACK_LINE_DURATION_MS;
    const a = parseInt(activeLine.startTimeMs, 10);
    const b = parseInt(next.startTimeMs, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      return FALLBACK_LINE_DURATION_MS;
    }
    return b - a;
  }, [activeLine, lyricsState.currentLine, lyricsState.lines]);

  // Pre-compute character → reveal-time-ms map for the current line.
  // When KRC word timings are available, characters reveal at their true
  // word boundaries (interpolated within a word so the reveal is smooth
  // across multi-char words). Otherwise we evenly distribute characters
  // across the line duration.
  const charRevealMs = useMemo<number[]>(() => {
    if (!fullText) return [];
    const wordTimings = activeLine?.wordTimings;
    if (wordTimings && wordTimings.length > 0) {
      // Walk the original (untrimmed) line so word.text offsets line up,
      // then map back to indices in the trimmed fullText. Trimming only
      // strips leading/trailing whitespace, so a single offset shift is
      // enough.
      const original = activeLine?.words ?? "";
      const leadingTrim = original.length - original.trimStart().length;
      const arr = new Array<number>(fullText.length).fill(0);
      let charsAssigned = 0;
      for (let w = 0; w < wordTimings.length; w++) {
        const word = wordTimings[w];
        const len = word.text.length;
        for (let c = 0; c < len; c++) {
          const idxInOriginal = charsAssigned + c;
          const idxInTrimmed = idxInOriginal - leadingTrim;
          if (idxInTrimmed < 0 || idxInTrimmed >= arr.length) continue;
          // Spread chars evenly within the word's duration so a long
          // sustained word still drips in instead of snapping.
          const within =
            len > 0
              ? ((c + 1) / len) * Math.max(0, word.durationMs)
              : word.durationMs;
          arr[idxInTrimmed] = word.startTimeMs + within;
        }
        charsAssigned += len;
      }
      // Any trailing chars (e.g. punctuation past final word timing) get
      // pinned to the last word's end so they reveal at the same moment.
      const lastWord = wordTimings[wordTimings.length - 1];
      const lastEnd = lastWord.startTimeMs + lastWord.durationMs;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === 0 && i > 0) arr[i] = lastEnd;
      }
      return arr;
    }
    // No word timings — distribute evenly across the line's duration.
    const total = lineDurationMs;
    return Array.from({ length: fullText.length }, (_, i) =>
      ((i + 1) / fullText.length) * total
    );
  }, [fullText, activeLine, lineDurationMs]);

  // Track the latest prop time + when we received it so we can
  // extrapolate per-frame for smooth reveal between coarse progress
  // callbacks. This mirrors `WordTimingHighlight` in LyricsDisplay.
  const timeRef = useRef({
    propTimeMs: currentTimeMs,
    propTakenAt: performance.now(),
  });
  useEffect(() => {
    timeRef.current.propTimeMs = currentTimeMs;
    timeRef.current.propTakenAt = performance.now();
  }, [currentTimeMs]);

  const [revealedChars, setRevealedChars] = useState(0);
  const lastRevealedRef = useRef(0);
  const lineKey = activeLine
    ? `${lyricsState.currentLine}:${activeLine.startTimeMs}`
    : "";

  useEffect(() => {
    lastRevealedRef.current = 0;
    setRevealedChars(0);
  }, [lineKey]);

  useEffect(() => {
    if (!fullText || !Number.isFinite(lineStartMs)) {
      if (lastRevealedRef.current !== 0) {
        lastRevealedRef.current = 0;
        setRevealedChars(0);
      }
      return;
    }
    let raf = 0;
    const tick = () => {
      const sinceProp = Math.min(
        MAX_INTERPOLATE_MS,
        performance.now() - timeRef.current.propTakenAt
      );
      const liveTimeMs = timeRef.current.propTimeMs + sinceProp;
      const timeIntoLine = liveTimeMs - lineStartMs;
      // Binary scan would be overkill for a typical line (<100 chars).
      let count = 0;
      for (let i = 0; i < charRevealMs.length; i++) {
        if (charRevealMs[i] <= timeIntoLine) count = i + 1;
        else break;
      }
      if (count !== lastRevealedRef.current) {
        lastRevealedRef.current = count;
        setRevealedChars(count);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fullText, lineStartMs, charRevealMs]);

  if (!visible || !fullText) return null;

  const isFullscreen = variant === "fullscreen";
  const visibleText = fullText.slice(0, revealedChars);
  const hiddenText = fullText.slice(revealedChars);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4",
        isFullscreen ? "bottom-[14%]" : "bottom-6"
      )}
      aria-hidden
    >
      {/* Keyed swap with no enter animation — caption snaps in like
          broadcast CCs. The container itself remounts per line so prior
          line is replaced instantly. */}
      <div
        key={lineKey}
        className={cn(
          "font-geneva-12 text-white text-center leading-none bg-black/85 max-w-[92%]",
          isFullscreen
            ? "text-[clamp(18px,3.2vw,36px)] px-3 py-2"
            : "text-[18px] sm:text-[20px] px-2 py-1"
        )}
        style={{
          letterSpacing: "0.01em",
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
      </div>
    </div>
  );
}
