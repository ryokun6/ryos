import { useEffect, useRef, useState, useMemo, useCallback, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { MenuListItem } from "./screen";

const SNIPPET_DURATION_MS = 10000;
const FEEDBACK_DURATION_MS = 1800;
const TOTAL_ROUNDS = 5;
const NUM_OPTIONS = 4;
// Avoid the very beginning and end so snippets feel like "the song", not intros/outros.
// We still cap by half the actual duration once it loads.
const SNIPPET_MIN_START_SEC = 20;
const SNIPPET_MAX_FALLBACK_SEC = 180;

export interface MusicQuizRound {
  correctIndex: number;
  options: Track[];
  startSec: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
}

type Phase = "idle" | "loading" | "playing" | "feedback" | "finished";

export interface MusicQuizRef {
  /** Move selection up/down. Returns true if handled. */
  navigate: (direction: "next" | "previous") => boolean;
  /** Confirm current selection (or advance to next round / restart from finished). */
  selectCurrent: () => void;
  /** Replay the current snippet from its start. */
  replaySnippet: () => void;
}

export interface MusicQuizProps {
  isVisible: boolean;
  onExit: () => void;
  lcdFilterOn?: boolean;
  backlightOn?: boolean;
  /** Pause the main library player when entering, called once when visible turns true */
  onEnter?: () => void;
  /** Sound effects */
  playClick?: () => void;
  playScroll?: () => void;
  vibrate?: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRound(tracks: Track[]): { options: Track[]; correctIndex: number; correct: Track } | null {
  if (tracks.length < 1) return null;
  const optionCount = Math.min(NUM_OPTIONS, tracks.length);
  const shuffled = shuffle(tracks);
  const options = shuffled.slice(0, optionCount);
  const correctIndex = Math.floor(Math.random() * options.length);
  return { options, correctIndex, correct: options[correctIndex] };
}

export const MusicQuiz = forwardRef<MusicQuizRef, MusicQuizProps>(function MusicQuiz(
  {
    isVisible,
    onExit: _onExit,
    lcdFilterOn = false,
    backlightOn = true,
    onEnter,
    playClick,
    playScroll,
    vibrate,
  },
  ref
) {
  const { t } = useTranslation();
  const tracks = useIpodStore((s) => s.tracks);
  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);
  const ipodVolume = useAudioSettingsStore((s) => s.ipodVolume);
  const finalVolume = ipodVolume * masterVolume;

  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState<MusicQuizRound | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const playerRef = useRef<ReactPlayer | null>(null);
  const snippetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startSecRef = useRef(0);
  const enteredRef = useRef(false);

  const hasEnoughTracks = tracks.length >= 2;

  const clearTimers = useCallback(() => {
    if (snippetTimerRef.current) {
      clearTimeout(snippetTimerRef.current);
      snippetTimerRef.current = null;
    }
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const computeStartSec = useCallback((duration: number) => {
    // Use track duration if available; otherwise pick within a fallback window.
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : SNIPPET_MAX_FALLBACK_SEC;
    // Avoid intros/outros: pick from [min, max] where:
    //   min = clamp 20s but no more than 25% of song
    //   max = 75% of song
    const min = Math.min(SNIPPET_MIN_START_SEC, Math.max(0, safeDuration * 0.1));
    const max = Math.max(min + 1, safeDuration * 0.75 - SNIPPET_DURATION_MS / 1000);
    if (max <= min) return Math.max(0, safeDuration / 4);
    return min + Math.random() * (max - min);
  }, []);

  const startNextRound = useCallback(() => {
    clearTimers();
    if (!hasEnoughTracks) {
      setPhase("idle");
      return;
    }
    const next = pickRound(tracks);
    if (!next) {
      setPhase("idle");
      return;
    }
    // Pick a provisional start; we'll re-pick once duration is known via onDuration.
    const provisionalStart = SNIPPET_MIN_START_SEC + Math.random() * 30;
    startSecRef.current = provisionalStart;
    setRound({
      options: next.options,
      correctIndex: next.correctIndex,
      startSec: provisionalStart,
      selectedIndex: null,
      isCorrect: null,
    });
    setRoundNumber((n) => n + 1);
    setSelectedIndex(0);
    setPhase("loading");
  }, [clearTimers, hasEnoughTracks, tracks]);

  // When becoming visible, start the game.
  useEffect(() => {
    if (isVisible) {
      if (!enteredRef.current) {
        enteredRef.current = true;
        onEnter?.();
        setScore(0);
        setRoundNumber(0);
        startNextRound();
      }
    } else {
      // Reset on hide
      enteredRef.current = false;
      clearTimers();
      setPhase("idle");
      setRound(null);
      setRoundNumber(0);
      setScore(0);
      setSelectedIndex(0);
    }
  }, [isVisible, onEnter, startNextRound, clearTimers]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  const handleAnswer = useCallback(
    (idx: number) => {
      if (!round || phase !== "playing") return;
      playClick?.();
      vibrate?.();
      clearTimers();
      const isCorrect = idx === round.correctIndex;
      setRound({ ...round, selectedIndex: idx, isCorrect });
      setSelectedIndex(round.correctIndex);
      setPhase("feedback");
      if (isCorrect) setScore((s) => s + 1);

      feedbackTimerRef.current = setTimeout(() => {
        if (roundNumber >= TOTAL_ROUNDS) {
          setPhase("finished");
        } else {
          startNextRound();
        }
      }, FEEDBACK_DURATION_MS);
    },
    [round, phase, playClick, vibrate, clearTimers, roundNumber, startNextRound]
  );

  // Snippet playback control
  const startSnippet = useCallback(() => {
    if (!playerRef.current) return;
    clearTimers();
    playerRef.current.seekTo(startSecRef.current, "seconds");
    snippetTimerRef.current = setTimeout(() => {
      // Time's up — auto-mark wrong (no answer)
      if (!round) return;
      clearTimers();
      const updated = { ...round, selectedIndex: null, isCorrect: false };
      setRound(updated);
      setSelectedIndex(round.correctIndex);
      setPhase("feedback");
      feedbackTimerRef.current = setTimeout(() => {
        if (roundNumber >= TOTAL_ROUNDS) {
          setPhase("finished");
        } else {
          startNextRound();
        }
      }, FEEDBACK_DURATION_MS);
    }, SNIPPET_DURATION_MS);
  }, [clearTimers, round, roundNumber, startNextRound]);

  const handleDuration = useCallback(
    (duration: number) => {
      // Re-pick a start within the song's true bounds.
      if (!round || phase !== "loading") return;
      const start = computeStartSec(duration);
      startSecRef.current = start;
      setRound((r) => (r ? { ...r, startSec: start } : r));
    },
    [round, phase, computeStartSec]
  );

  const handleReady = useCallback(() => {
    if (phase !== "loading") return;
    setPhase("playing");
    // Defer to next tick to ensure player is fully ready before seeking
    setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.seekTo(startSecRef.current, "seconds");
      }
      startSnippet();
    }, 50);
  }, [phase, startSnippet]);

  // Imperative API exposed via ref
  useImperativeHandle(ref, () => ({
    navigate: (direction) => {
      if (phase === "playing" && round) {
        playScroll?.();
        setSelectedIndex((prev) => {
          const len = round.options.length;
          if (direction === "next") return Math.min(len - 1, prev + 1);
          return Math.max(0, prev - 1);
        });
        return true;
      }
      if (phase === "finished") {
        // No-op navigation in finished view
        return true;
      }
      return false;
    },
    selectCurrent: () => {
      if (phase === "playing" && round) {
        handleAnswer(selectedIndex);
        return;
      }
      if (phase === "feedback") {
        // Skip remaining feedback timer
        clearTimers();
        if (roundNumber >= TOTAL_ROUNDS) {
          setPhase("finished");
        } else {
          startNextRound();
        }
        return;
      }
      if (phase === "finished") {
        // Restart
        playClick?.();
        vibrate?.();
        setScore(0);
        setRoundNumber(0);
        setSelectedIndex(0);
        startNextRound();
        return;
      }
    },
    replaySnippet: () => {
      if (phase === "playing" && playerRef.current) {
        playClick?.();
        vibrate?.();
        playerRef.current.seekTo(startSecRef.current, "seconds");
        // Restart snippet timer
        clearTimers();
        snippetTimerRef.current = setTimeout(() => {
          if (!round) return;
          clearTimers();
          setRound((r) => (r ? { ...r, selectedIndex: null, isCorrect: false } : r));
          setSelectedIndex((round?.correctIndex) ?? 0);
          setPhase("feedback");
          feedbackTimerRef.current = setTimeout(() => {
            if (roundNumber >= TOTAL_ROUNDS) {
              setPhase("finished");
            } else {
              startNextRound();
            }
          }, FEEDBACK_DURATION_MS);
        }, SNIPPET_DURATION_MS);
      }
    },
  }), [phase, round, selectedIndex, handleAnswer, playClick, playScroll, vibrate, clearTimers, roundNumber, startNextRound]);

  const headerTitle = useMemo(() => {
    if (phase === "finished") return t("apps.ipod.musicQuiz.results", "Results");
    return t("apps.ipod.musicQuiz.title", "Music Quiz");
  }, [phase, t]);

  if (!isVisible) return null;

  // Hidden ReactPlayer for the snippet (audio only)
  const correctTrackUrl = round?.options[round.correctIndex]?.url;

  return (
    <div
      className={cn(
        "relative z-50 flex h-full min-h-[150px] w-full flex-col overflow-hidden select-none font-chicago",
        "border border-black border-2 rounded-[2px]",
        lcdFilterOn ? "lcd-screen" : "",
        backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn &&
          backlightOn &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
    >
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-scan-lines" />
      )}
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-reflection" />
      )}

      {/* Title bar — match IpodScreen */}
      <div className="border-b border-[#0a3667] py-0 px-2 font-chicago text-[16px] flex items-center sticky top-0 z-10 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
        <div className="w-6 flex items-center justify-start text-xs tabular-nums">
          {phase !== "finished" && hasEnoughTracks && (
            <span>
              {Math.min(roundNumber, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}
            </span>
          )}
        </div>
        <div className="flex-1 truncate text-center">{headerTitle}</div>
        <div className="w-6 flex items-center justify-end text-xs tabular-nums">
          {phase !== "finished" && hasEnoughTracks && <span>{score}</span>}
        </div>
      </div>

      {/* Body */}
      <div className="relative h-[calc(100%-26px)] overflow-hidden z-30">
        {!hasEnoughTracks ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
            <p className="text-[14px]">
              {t(
                "apps.ipod.musicQuiz.notEnoughTracks",
                "Add more songs to play the quiz"
              )}
            </p>
          </div>
        ) : phase === "finished" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
            <span className="font-chicago text-[16px] tabular-nums leading-4">
              {score}/{TOTAL_ROUNDS}
            </span>
            <span className="font-chicago text-[14px] leading-4">
              {t(scoreMessageKey(score, TOTAL_ROUNDS), {
                defaultValue:
                  score === TOTAL_ROUNDS
                    ? "Perfect score!"
                    : score / TOTAL_ROUNDS >= 0.6
                      ? "Great job!"
                      : score / TOTAL_ROUNDS >= 0.3
                        ? "Not bad!"
                        : "Keep listening!",
              })}
            </span>
            <div className="flex flex-col font-chicago text-[14px] leading-4 opacity-85">
              <span>
                {t("apps.ipod.musicQuiz.pressCenterToReplay", "Press center to play again")}
              </span>
              <span>{t("apps.ipod.musicQuiz.menuToExit", "Menu to exit")}</span>
            </div>
          </div>
        ) : phase === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
            <div className="text-[14px] animate-pulse">
              {t("apps.ipod.musicQuiz.loading", "Loading snippet…")}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col">
            {/* Snippet progress or feedback — fixed slot height */}
            <div className="border-b border-[#0a3667] px-2 py-px text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
              <div className="flex h-5 w-full items-center justify-center">
                {phase === "feedback" ? (
                  <div className="w-full truncate text-center font-chicago text-[16px] leading-4">
                    {round?.isCorrect
                      ? t("apps.ipod.musicQuiz.correct", "Correct!")
                      : round?.selectedIndex == null
                        ? t("apps.ipod.musicQuiz.timesUp", "Time's up!")
                        : t("apps.ipod.musicQuiz.wrong", "Not quite!")}
                  </div>
                ) : (
                  <SnippetProgressBar
                    key={`${roundNumber}-playing`}
                    durationMs={SNIPPET_DURATION_MS}
                    running={phase === "playing"}
                  />
                )}
              </div>
            </div>

            {/* Options */}
            <div className="flex-1 overflow-auto">
              {round?.options.map((option, idx) => {
                const isSelected = idx === selectedIndex;
                const isCorrectOption = phase === "feedback" && idx === round.correctIndex;
                const isWrongPicked =
                  phase === "feedback" &&
                  round.selectedIndex === idx &&
                  idx !== round.correctIndex;
                return (
                  <div
                    key={`${roundNumber}-${idx}-${option.id}`}
                    className={cn(
                      "ipod-menu-item",
                      isSelected ? "selected" : "",
                      isCorrectOption && "bg-[#1c8a3a]/30",
                      isWrongPicked && "bg-[#a83232]/30"
                    )}
                  >
                    <MenuListItem
                      text={formatOption(option)}
                      isSelected={isSelected}
                      backlightOn={backlightOn}
                      onClick={() => {
                        if (phase === "playing") {
                          setSelectedIndex(idx);
                          handleAnswer(idx);
                        }
                      }}
                      showChevron={false}
                      value={
                        isCorrectOption
                          ? "✓"
                          : isWrongPicked
                          ? "✗"
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio-only player for snippet */}
      <div
        className="absolute opacity-0 pointer-events-none"
        style={{ width: 1, height: 1, left: -9999, top: -9999 }}
        aria-hidden
      >
        {correctTrackUrl && phase !== "finished" && phase !== "idle" && (
          <ReactPlayer
            ref={playerRef}
            url={correctTrackUrl}
            playing={phase === "playing"}
            controls={false}
            volume={finalVolume}
            width="1px"
            height="1px"
            playsinline
            onReady={handleReady}
            onDuration={handleDuration}
            config={{
              youtube: {
                playerVars: {
                  modestbranding: 1,
                  rel: 0,
                  showinfo: 0,
                  iv_load_policy: 3,
                  fs: 0,
                  disablekb: 1,
                  playsinline: 1,
                  enablejsapi: 1,
                  origin: window.location.origin,
                },
              },
            }}
          />
        )}
      </div>
    </div>
  );
});

function formatOption(track: Track): string {
  const artist = track.artist ? ` — ${track.artist}` : "";
  return `${track.title}${artist}`;
}

function scoreMessageKey(score: number, total: number): string {
  const ratio = total === 0 ? 0 : score / total;
  if (ratio === 1) return "apps.ipod.musicQuiz.perfect";
  if (ratio >= 0.6) return "apps.ipod.musicQuiz.greatJob";
  if (ratio >= 0.3) return "apps.ipod.musicQuiz.notBad";
  return "apps.ipod.musicQuiz.keepPracticing";
}

function SnippetProgressBar({ durationMs, running }: { durationMs: number; running: boolean }) {
  return (
    <div className="h-[6px] w-full shrink-0 rounded-full border border-[#0a3667] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={running ? "run" : "stop"}
          className="h-full bg-[#0a3667]"
          initial={{ width: "0%" }}
          animate={{ width: running ? "100%" : "0%" }}
          transition={{ duration: running ? durationMs / 1000 : 0, ease: "linear" }}
        />
      </AnimatePresence>
    </div>
  );
}
