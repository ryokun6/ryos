import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

/** Hoisted to module scope so the rendered spans don't get fresh style
 *  objects on every re-render — this lets React skip prop-equality bails
 *  on the per-token plates while a line is being progressively revealed. */
const LINE_TONE_STYLE = {
  letterSpacing: 0,
  lineHeight: 1.35,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  textShadow: "0 1px 0 rgba(0,0,0,0.85)",
};

/** Per-token dark plates (`box-decoration-break: clone`) so progressive
 *  reveals and wrapped lines don't paint one big rectangle behind the
 *  whole caption block. Stable reference is fine — these props never
 *  change. */
const WORD_PLATE_STYLE = {
  WebkitBoxDecorationBreak: "clone" as const,
  boxDecorationBreak: "clone" as const,
};

const LINE_TRANSITION = {
  y: {
    type: "tween" as const,
    duration: 0.32,
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  },
};

// Stable framer-motion variant objects so the line slide-in/out doesn't
// receive freshly-allocated prop objects on every render.
const LINE_INITIAL = { y: "100%" } as const;
const LINE_ANIMATE = { y: 0 } as const;
const LINE_EXIT = { y: "-100%" } as const;

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
    // Pre-resolve the timing curve and the highest reveal time so the
    // hot loop can short-circuit once every token is on screen rather
    // than scanning the whole array each frame just to reconfirm.
    const tokenCount = tokens.length;
    const lastRevealAtMs = tokens[tokenCount - 1].revealAtMs;
    let raf = 0;
    const tick = () => {
      const sinceProp = Math.min(
        MAX_INTERPOLATE_MS,
        performance.now() - timeRef.current.propTakenAt
      );
      const liveTimeMs = timeRef.current.propTimeMs + sinceProp;
      const timeIntoLine = liveTimeMs - lineStartMs;
      let count: number;
      if (timeIntoLine >= lastRevealAtMs) {
        count = tokenCount;
      } else if (timeIntoLine <= 0) {
        count = 0;
      } else {
        // Tokens are time-sorted, so an incremental scan from the
        // previous reveal point converges in O(1) for the steady
        // state where the next reveal is just one token ahead. This
        // replaces the previous full O(n) scan-then-break per frame.
        let i = lastRevealedRef.current;
        while (i > 0 && tokens[i - 1].revealAtMs > timeIntoLine) {
          i--;
        }
        while (i < tokenCount && tokens[i].revealAtMs <= timeIntoLine) {
          i++;
        }
        count = i;
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

  const lineTypography = cn(
    "font-geneva-12 text-white text-left w-full block",
    isFullscreen
      ? "text-[24px] sm:text-[32px] md:text-[40px]"
      : "text-[20px]"
  );

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
      {/* Line change: incoming line slides up from below while the outgoing
          line is driven upward in the same frame (sync), so it reads as a
          push. Invisible spacer locks height to the full line for %
          transforms. */}
      <div className="relative w-full max-w-[92%]">
        <div
          aria-hidden
          className={cn(lineTypography, "invisible")}
          style={LINE_TONE_STYLE}
        >
          {fullText}
        </div>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={lineKey}
              className={cn(lineTypography, "absolute left-0 top-0 z-[1]")}
              style={LINE_TONE_STYLE}
              initial={LINE_INITIAL}
              animate={LINE_ANIMATE}
              exit={LINE_EXIT}
              transition={LINE_TRANSITION}
            >
              {tokens.map((t, i) => {
                const isRevealed = i < revealedTokens;
                return (
                  <span
                    key={`tok-${lineKey}-${i}`}
                    aria-hidden={!isRevealed}
                    className={
                      isRevealed
                        ? "bg-black/85 text-white px-0.5 rounded-none"
                        : "inline opacity-0"
                    }
                    style={isRevealed ? WORD_PLATE_STYLE : undefined}
                  >
                    {t.text}
                  </span>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
