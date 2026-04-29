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

interface RevealToken {
  /** Text to render for this token (includes any trailing whitespace). */
  text: string;
  /** Time relative to the line start, in ms, when this token should
   *  become visible. */
  revealAtMs: number;
}

/**
 * Single-line, TV-style closed-caption overlay for the MTV channel.
 *
 * MTV plays from the user's iPod library, so we reuse the same
 * `useLyrics` pipeline iPod / Karaoke use — the song id of the current
 * TV video is the same id the iPod uses for lyrics lookups.
 *
 * Reveal timing matches the audio at *word* granularity:
 *   - When the LRC has KRC `wordTimings[]`, each token is revealed
 *     exactly at its word's `startTimeMs` (relative to line start).
 *   - Otherwise tokens are split on whitespace and distributed evenly
 *     across the line duration (next-line-start − current-line-start),
 *     matching the karaoke / `LyricsDisplay` fallback.
 *
 * Smoothness comes from extrapolating `performance.now()` forward from
 * the latest `playedSeconds` prop (capped at 500ms) per `rAF` tick —
 * same trick `WordTimingHighlight` uses in `LyricsDisplay`.
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

  // Build the token list for the active line. Each token carries its
  // reveal time (relative to line start). When KRC word timings exist
  // we use them verbatim; otherwise we whitespace-split and spread
  // evenly across the line.
  const tokens = useMemo<RevealToken[]>(() => {
    if (!activeLine) return [];
    const original = activeLine.words ?? "";
    if (!original) return [];

    const wordTimings = activeLine.wordTimings;
    if (wordTimings && wordTimings.length > 0) {
      // KRC word timings cover the original (untrimmed) line. The text
      // of each timing already includes its trailing whitespace, so we
      // can render them in order without extra splitting. We trim the
      // very first and last tokens' surrounding whitespace so the CC
      // plate hugs the visible text.
      const last = wordTimings.length - 1;
      return wordTimings.map((w, i) => {
        let text = w.text;
        if (i === 0) text = text.replace(/^\s+/, "");
        if (i === last) text = text.replace(/\s+$/, "");
        return { text, revealAtMs: w.startTimeMs };
      });
    }

    // Fallback: split on whitespace, keeping the spaces attached to the
    // preceding word so the rendered string is identical to the
    // original. Reveal each word evenly across the line duration.
    const trimmed = original.trim();
    if (!trimmed) return [];
    const parts: string[] = [];
    const re = /\S+\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) {
      parts.push(m[0]);
    }
    const total = lineDurationMs;
    return parts.map((text, i) => ({
      text,
      revealAtMs: (i / parts.length) * total,
    }));
  }, [activeLine, lineDurationMs]);

  const fullText = useMemo(() => tokens.map((t) => t.text).join(""), [tokens]);

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

  const [revealedTokens, setRevealedTokens] = useState(0);
  const lastRevealedRef = useRef(0);
  const lineKey = activeLine
    ? `${lyricsState.currentLine}:${activeLine.startTimeMs}`
    : "";

  useEffect(() => {
    lastRevealedRef.current = 0;
    setRevealedTokens(0);
  }, [lineKey]);

  useEffect(() => {
    if (tokens.length === 0 || !Number.isFinite(lineStartMs)) {
      if (lastRevealedRef.current !== 0) {
        lastRevealedRef.current = 0;
        setRevealedTokens(0);
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
      let count = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].revealAtMs <= timeIntoLine) count = i + 1;
        else break;
      }
      if (count !== lastRevealedRef.current) {
        lastRevealedRef.current = count;
        setRevealedTokens(count);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tokens, lineStartMs]);

  if (!visible || !fullText) return null;

  const isFullscreen = variant === "fullscreen";
  const revealed = tokens.slice(0, revealedTokens);
  const unrevealed = tokens.slice(revealedTokens);

  // Per-token dark plates (`box-decoration-break: clone`) so progressive
  // reveals and wrapped lines don’t paint one big rectangle behind the
  // whole caption block.
  const wordPlateStyle = {
    WebkitBoxDecorationBreak: "clone" as const,
    boxDecorationBreak: "clone" as const,
  };

  // z-[15]: below click-capture (z-20), CRT static (z-30+).
  return (
    <div
      className={cn(
        // `tv-cc-force-font` escapes macOSX theme Lucida/global 13px div
        // rules — see themes.css alongside ipod-force-font /
        // karaoke-force-font.
        "tv-cc-force-font pointer-events-none absolute inset-x-0 z-[15] flex justify-start pl-8 pr-4 sm:pl-10",
        isFullscreen ? "bottom-[18%] sm:bottom-[17%]" : "bottom-10 sm:bottom-11"
      )}
      aria-hidden
    >
      {/* Keyed swap with no enter animation — caption snaps in like
          broadcast CCs. The container itself remounts per line so the
          prior line is replaced instantly. Sizes snap to integer pixel
          values so the geneva-12 pixel font stays crisp instead of
          getting fractional-scale blur from clamp()/vw units. */}
      <div
        key={lineKey}
        className={cn(
          "font-geneva-12 text-white text-left max-w-[92%]",
          isFullscreen
            ? "text-[24px] sm:text-[32px] md:text-[40px]"
            : "text-[20px]"
        )}
        style={{
          letterSpacing: 0,
          lineHeight: 1.35,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          textShadow: "0 1px 0 rgba(0,0,0,0.85)",
        }}
      >
        {revealed.map((t, i) => (
          <span
            key={`v-${lineKey}-${i}`}
            className="bg-black/85 text-white px-0.5 rounded-none"
            style={wordPlateStyle}
          >
            {t.text}
          </span>
        ))}
        {unrevealed.map((t, i) => (
          <span
            key={`h-${lineKey}-${i}`}
            aria-hidden
            className="inline opacity-0"
          >
            {t.text}
          </span>
        ))}
      </div>
    </div>
  );
}
