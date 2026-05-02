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

/** Per-token plate class. Inline horizontal padding (`px-0.5`) adds a
 *  few px of width per token, so the invisible spacer and the hidden
 *  unrevealed tokens use the *same* class to keep the visible row width
 *  matched across the slide transitions. */
const WORD_PLATE_CLASS_NAME = "bg-black/85 text-white px-0.5 rounded-none";
/** Same plate but invisible — used for tokens not yet revealed so the
 *  row's measured width stays constant as words light up. */
const WORD_PLATE_HIDDEN_CLASS_NAME = `${WORD_PLATE_CLASS_NAME} opacity-0`;

const LINE_TRANSITION = {
  y: {
    type: "tween" as const,
    duration: 0.32,
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  },
};

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

/** Build the per-token reveal list for a given lyric line. When KRC word
 *  timings exist we use them verbatim; otherwise we whitespace-split and
 *  spread evenly across the supplied line duration. Same logic as the
 *  previous single-line implementation, just hoisted so both the
 *  current-line row (with reveal) and the previous-line row (fully
 *  revealed) share identical tokenisation. */
function buildTokens(
  line: LyricLine | null,
  lineDurationMs: number
): RevealToken[] {
  if (!line) return [];
  const original = line.words ?? "";
  if (!original) return [];

  const wordTimings = line.wordTimings;
  if (wordTimings && wordTimings.length > 0) {
    // KRC word timings cover the original (untrimmed) line. The text of
    // each timing already includes its trailing whitespace, so we can
    // render them in order without extra splitting. We trim the very
    // first and last tokens' surrounding whitespace so the CC plate
    // hugs the visible text.
    const last = wordTimings.length - 1;
    return wordTimings.map((w, i) => {
      let text = w.text;
      if (i === 0) text = text.replace(/^\s+/, "");
      if (i === last) text = text.replace(/\s+$/, "");
      return { text, revealAtMs: w.startTimeMs };
    });
  }

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
}

/** Resolve the duration of `lines[idx]` from the gap to the next line,
 *  with a sensible fallback for the last line of the song. */
function getLineDurationMs(lines: LyricLine[], idx: number): number {
  const line = lines[idx];
  if (!line) return 0;
  const next = lines[idx + 1];
  if (!next) return FALLBACK_LINE_DURATION_MS;
  const a = parseInt(line.startTimeMs, 10);
  const b = parseInt(next.startTimeMs, 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    return FALLBACK_LINE_DURATION_MS;
  }
  return b - a;
}

/**
 * Single CC row — renders the spacer + animated line that slides through
 * it. The animated line is keyed by `lineKey` so AnimatePresence can run
 * the slide-up swap whenever the underlying line changes.
 */
interface CcRowProps {
  tokens: RevealToken[];
  /** Number of tokens currently revealed. Pass `tokens.length` for the
   *  static "previous line" row above the active line. */
  revealedTokens: number;
  /** Identifier that uniquely represents the current line in this slot.
   *  Used as the AnimatePresence key — when it changes, the old row
   *  exits upward and the new one enters from below. */
  lineKey: string;
  /** Typography classes shared across rows to keep both lines visually
   *  identical. */
  lineTypography: string;
}

function CcRow({
  tokens,
  revealedTokens,
  lineKey,
  lineTypography,
}: CcRowProps) {
  const hasContent = tokens.length > 0;
  return (
    <div className="relative w-full">
      {/* Invisible spacer locks the row height so the % transforms on
          the animated child have a stable container. It MUST use the
          same per-token markup as the visible row — `px-0.5` per word
          adds a few px per token, and a row even slightly wider than
          the spacer wraps to a second visual line and gets clipped by
          the parent's `overflow-hidden`. (Tracked down as silently
          dropping the last word on lines that just barely fit.) */}
      <div
        aria-hidden
        className={cn(lineTypography, "invisible")}
        style={LINE_TONE_STYLE}
      >
        {hasContent ? (
          tokens.map((t, i) => (
            <span
              key={`s-${lineKey}-${i}`}
              className={WORD_PLATE_CLASS_NAME}
              style={WORD_PLATE_STYLE}
            >
              {t.text}
            </span>
          ))
        ) : (
          // Reserve a row's worth of vertical space even when this slot
          // is empty (e.g. before the first line of the song) so the
          // current line doesn't jump up by one row when the previous
          // slot finally fills in.
          <span className={WORD_PLATE_CLASS_NAME} style={WORD_PLATE_STYLE}>
            &nbsp;
          </span>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <AnimatePresence mode="sync" initial={false}>
          {hasContent && (
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
                        ? WORD_PLATE_CLASS_NAME
                        : WORD_PLATE_HIDDEN_CLASS_NAME
                    }
                    style={WORD_PLATE_STYLE}
                  >
                    {t.text}
                  </span>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Two-line, TV-style closed-caption overlay for the MTV channel.
 *
 * MTV plays from the user's iPod library, so we reuse the same
 * `useLyrics` pipeline iPod / Karaoke use — the song id of the current
 * TV video is the same id the iPod uses for lyrics lookups.
 *
 * Layout (TV roll-up style):
 *   - Top row: the previous lyric line, fully revealed (history).
 *   - Bottom row: the active lyric line, with per-word reveal.
 * When the active line advances both rows slide up together so the new
 * "previous" row inherits the text that was just being revealed.
 *
 * Reveal timing for the active line matches the audio at *word* granularity:
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
    currentTime: currentTimeMs / 1000,
  });

  const currentIdx = lyricsState.currentLine;

  const activeLine: LyricLine | null = useMemo(() => {
    if (!visible) return null;
    if (currentIdx < 0) return null;
    return lyricsState.lines[currentIdx] ?? null;
  }, [visible, currentIdx, lyricsState.lines]);

  const previousLine: LyricLine | null = useMemo(() => {
    if (!visible) return null;
    if (currentIdx <= 0) return null;
    return lyricsState.lines[currentIdx - 1] ?? null;
  }, [visible, currentIdx, lyricsState.lines]);

  const lineStartMs = activeLine ? parseInt(activeLine.startTimeMs, 10) : NaN;

  const lineDurationMs = useMemo(
    () => getLineDurationMs(lyricsState.lines, currentIdx),
    [lyricsState.lines, currentIdx]
  );

  const previousLineDurationMs = useMemo(
    () => getLineDurationMs(lyricsState.lines, currentIdx - 1),
    [lyricsState.lines, currentIdx]
  );

  // Tokens for the active (bottom) line — these drive the per-word
  // reveal. The previous (top) line uses `previousTokens` and is shown
  // fully revealed, so its per-token reveal times are unused.
  const tokens = useMemo<RevealToken[]>(
    () => buildTokens(activeLine, lineDurationMs),
    [activeLine, lineDurationMs]
  );

  const previousTokens = useMemo<RevealToken[]>(
    () => buildTokens(previousLine, previousLineDurationMs),
    [previousLine, previousLineDurationMs]
  );

  const fullText = useMemo(() => tokens.map((t) => t.text).join(""), [tokens]);
  const previousFullText = useMemo(
    () => previousTokens.map((t) => t.text).join(""),
    [previousTokens]
  );

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
    ? `${currentIdx}:${activeLine.startTimeMs}`
    : "";
  const previousLineKey = previousLine
    ? `${currentIdx - 1}:${previousLine.startTimeMs}`
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

  // Hide the overlay entirely when there's nothing to show in either
  // slot — same exit semantics as the original single-line version.
  if (!visible || (!fullText && !previousFullText)) return null;

  const isFullscreen = variant === "fullscreen";

  const lineTypography = cn(
    "font-geneva-12 text-white text-left w-full block",
    // Fullscreen uses the `.tv-cc-fullscreen-text` clamp() rule (see
    // index.css / themes.css) so the caption scales fluidly with the
    // viewport — same min(vw,vh) pattern karaoke uses for its
    // fullscreen lyrics. Windowed keeps a fixed pixel size so the
    // caption matches the TV frame regardless of window size.
    isFullscreen ? "tv-cc-fullscreen-text" : "text-[20px]"
  );

  // z-[15]: below click-capture (z-20), CRT static (z-30+).
  return (
    <div
      className={cn(
        // `tv-cc-force-font` escapes macOSX theme Lucida/global 13px div
        // rules — see themes.css alongside ipod-force-font /
        // karaoke-force-font.
        "tv-cc-force-font pointer-events-none absolute inset-x-0 z-[15] flex justify-start",
        isFullscreen
          ? "bottom-[18%] sm:bottom-[17%]"
          : "bottom-10 sm:bottom-11 pl-8 pr-4 sm:pl-10"
      )}
      style={
        isFullscreen
          ? {
              paddingLeft:
                "max(env(safe-area-inset-left, 0px), clamp(2.5rem, 8vw, 6rem))",
              paddingRight:
                "max(env(safe-area-inset-right, 0px), clamp(1rem, 3vw, 3rem))",
            }
          : undefined
      }
      aria-hidden
    >
      {/* Stack two CC rows: previous line on top (fully revealed) and the
          active line below (progressive reveal). `gap-1` keeps the rows
          visually distinct without crowding the picture; `max-w-[92%]`
          matches the original single-line clamp so wide captions still
          break inside the safe area. */}
      <div className="relative w-full max-w-[92%] flex flex-col gap-1">
        <CcRow
          tokens={previousTokens}
          revealedTokens={previousTokens.length}
          lineKey={previousLineKey || "cc-prev-empty"}
          lineTypography={lineTypography}
        />
        <CcRow
          tokens={tokens}
          revealedTokens={revealedTokens}
          lineKey={lineKey || "cc-curr-empty"}
          lineTypography={lineTypography}
        />
      </div>
    </div>
  );
}
