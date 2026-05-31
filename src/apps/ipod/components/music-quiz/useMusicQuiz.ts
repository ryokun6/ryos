import {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  useReducer,
} from "react";
import ReactPlayer from "react-player";
import { useTranslation } from "react-i18next";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useIpodStore } from "@/stores/useIpodStore";
import type { AppleMusicPlayerBridgeHandle } from "../AppleMusicPlayerBridge";
import {
  computeSpeedScore,
  MUSIC_QUIZ_SNIPPET_MS as SNIPPET_DURATION_MS,
} from "../../utils/musicQuizScoring";
import {
  FEEDBACK_DURATION_MS,
  TOTAL_ROUNDS,
  SNIPPET_MIN_START_SEC,
  SNIPPET_MAX_FALLBACK_SEC,
  isIOSSafari,
} from "./constants";
import { initialQuizUiState, quizUiReducer } from "./quizState";
import { pickRound } from "./utils";
import type { MusicQuizProps, MusicQuizRef, MusicQuizRound, Phase } from "./types";

export function useMusicQuiz(
  {
    ref,
    isVisible,
    onEnter,
    playClick,
    playScroll,
    vibrate,
  }: MusicQuizProps & { ref?: React.Ref<MusicQuizRef> }
) {
  const { t } = useTranslation();
  const tracks = useIpodStore((s) =>
    s.librarySource === "appleMusic" ? s.appleMusicTracks : s.tracks
  );
  const uiVariant = useIpodStore((s) => s.uiVariant ?? "modern");
  const isModernUi = uiVariant === "modern";
  const bodyTopOffsetPx = isModernUi ? 17 : 26;
  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);
  const ipodVolume = useAudioSettingsStore((s) => s.ipodVolume);
  const finalVolume = ipodVolume * masterVolume;

  const [state, dispatch] = useReducer(quizUiReducer, initialQuizUiState);
  const {
    phase,
    round,
    roundNumber,
    score,
    lastRoundPoints,
    selectedIndex,
    isPlayerReady,
  } = state;
  const setPhase = useCallback((value: Phase) => {
    dispatch({ type: "setPhase", value });
  }, []);
  const setRound = useCallback(
    (
      value:
        | MusicQuizRound
        | null
        | ((prev: MusicQuizRound | null) => MusicQuizRound | null)
    ) => {
      dispatch({ type: "setRound", value });
    },
    []
  );
  const setRoundNumber = useCallback((value: number | ((prev: number) => number)) => {
    dispatch({ type: "setRoundNumber", value });
  }, []);
  const setScore = useCallback((value: number | ((prev: number) => number)) => {
    dispatch({ type: "setScore", value });
  }, []);
  const setLastRoundPoints = useCallback((value: number) => {
    dispatch({ type: "setLastRoundPoints", value });
  }, []);
  const setSelectedIndex = useCallback(
    (value: number | ((prev: number) => number)) => {
      dispatch({ type: "setSelectedIndex", value });
    },
    []
  );
  const setIsPlayerReady = useCallback((value: boolean) => {
    dispatch({ type: "setIsPlayerReady", value });
  }, []);

  const youtubePlayerRef = useRef<ReactPlayer | null>(null);
  const appleMusicPlayerRef = useRef<AppleMusicPlayerBridgeHandle | null>(null);
  const snippetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startSecRef = useRef(0);
  const snippetStartedAtRef = useRef<number | null>(null);
  const enteredRef = useRef(false);
  const hasUnlockedPlaybackRef = useRef(false);

  const quizTracks = useMemo(
    () =>
      tracks.filter((track) =>
        track.source === "appleMusic"
          ? !!track.appleMusicPlayParams
          : !!track.url
      ),
    [tracks]
  );
  const hasEnoughTracks = quizTracks.length >= 2;
  const correctTrack = round?.options[round.correctIndex] ?? null;
  const isAppleMusicRound = correctTrack?.source === "appleMusic";

  const clearTimers = useCallback(() => {
    if (snippetTimerRef.current) {
      clearTimeout(snippetTimerRef.current);
      snippetTimerRef.current = null;
    }
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    if (loadingWatchdogRef.current) {
      clearTimeout(loadingWatchdogRef.current);
      loadingWatchdogRef.current = null;
    }
  }, []);

  const computeStartSec = useCallback((duration: number) => {
    const safeDuration =
      Number.isFinite(duration) && duration > 0
        ? duration
        : SNIPPET_MAX_FALLBACK_SEC;
    const min = Math.min(
      SNIPPET_MIN_START_SEC,
      Math.max(0, safeDuration * 0.1)
    );
    const max = Math.max(
      min + 1,
      safeDuration * 0.75 - SNIPPET_DURATION_MS / 1000
    );
    if (max <= min) return Math.max(0, safeDuration / 4);
    return min + Math.random() * (max - min);
  }, []);

  const startNextRound = useCallback(() => {
    clearTimers();
    if (!hasEnoughTracks) {
      setPhase("idle");
      return;
    }
    const next = pickRound(quizTracks);
    if (!next) {
      setPhase("idle");
      return;
    }
    const provisionalStart = next.correct.durationMs
      ? computeStartSec(next.correct.durationMs / 1000)
      : SNIPPET_MIN_START_SEC + Math.random() * 30;
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
    snippetStartedAtRef.current = null;
    const isAppleMusicTrack = next.correct.source === "appleMusic";
    setIsPlayerReady(isAppleMusicTrack);
    const needsGesture =
      (isIOSSafari || isAppleMusicTrack) && !hasUnlockedPlaybackRef.current;
    setPhase(
      needsGesture ? "awaitingStart" : isAppleMusicTrack ? "starting" : "loading"
    );
  }, [clearTimers, computeStartSec, hasEnoughTracks, quizTracks]);

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
      enteredRef.current = false;
      hasUnlockedPlaybackRef.current = false;
      clearTimers();
      setPhase("idle");
      setRound(null);
      setRoundNumber(0);
      setScore(0);
      setSelectedIndex(0);
      setIsPlayerReady(false);
    }
  }, [isVisible, onEnter, startNextRound, clearTimers]);

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
      if (isCorrect) {
        const startedAt = snippetStartedAtRef.current;
        const elapsed =
          startedAt == null ? SNIPPET_DURATION_MS : performance.now() - startedAt;
        const points = computeSpeedScore(elapsed);
        setLastRoundPoints(points);
        setScore((s) => s + points);
      } else {
        setLastRoundPoints(0);
      }

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

  const armSnippetTimer = useCallback(() => {
    clearTimers();
    snippetStartedAtRef.current = performance.now();
    snippetTimerRef.current = setTimeout(() => {
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
      if (!round) return;
      if (phase !== "loading" && phase !== "awaitingStart") return;
      const start = computeStartSec(duration);
      startSecRef.current = start;
      setRound((r) => (r ? { ...r, startSec: start } : r));
    },
    [round, phase, computeStartSec]
  );

  const seekToSnippetStart = useCallback(() => {
    if (isAppleMusicRound) {
      appleMusicPlayerRef.current?.seekTo(startSecRef.current);
      return;
    }
    youtubePlayerRef.current?.seekTo(startSecRef.current, "seconds");
  }, [isAppleMusicRound]);

  const handleReady = useCallback(() => {
    if (loadingWatchdogRef.current) {
      clearTimeout(loadingWatchdogRef.current);
      loadingWatchdogRef.current = null;
    }
    setIsPlayerReady(true);
    if (phase === "awaitingStart") return;
    if (phase !== "loading") return;
    seekToSnippetStart();
    setPhase("starting");
  }, [phase, seekToSnippetStart]);

  const handlePlay = useCallback(() => {
    if (phase !== "starting") return;
    setPhase("playing");
    armSnippetTimer();
  }, [phase, armSnippetTimer]);

  useEffect(() => {
    if (!round) return;
    const inLoadingPhase =
      phase === "loading" ||
      phase === "starting" ||
      (phase === "awaitingStart" && !isPlayerReady);
    if (!inLoadingPhase) return;
    if (loadingWatchdogRef.current) {
      clearTimeout(loadingWatchdogRef.current);
    }
    loadingWatchdogRef.current = setTimeout(() => {
      if (!round) return;
      setRound((r) => (r ? { ...r, selectedIndex: null, isCorrect: false } : r));
      setSelectedIndex(round.correctIndex);
      setLastRoundPoints(0);
      setPhase("feedback");
      feedbackTimerRef.current = setTimeout(() => {
        if (roundNumber >= TOTAL_ROUNDS) {
          setPhase("finished");
        } else {
          startNextRound();
        }
      }, FEEDBACK_DURATION_MS);
    }, 8000);
    return () => {
      if (loadingWatchdogRef.current) {
        clearTimeout(loadingWatchdogRef.current);
        loadingWatchdogRef.current = null;
      }
    };
  }, [phase, round, roundNumber, startNextRound, isPlayerReady]);

  const unlockAndStart = useCallback(() => {
    hasUnlockedPlaybackRef.current = true;
    if (isAppleMusicRound) {
      seekToSnippetStart();
      setPhase("starting");
      return;
    }

    const internalPlayer = youtubePlayerRef.current?.getInternalPlayer?.();
    if (internalPlayer) {
      try {
        if (typeof internalPlayer.seekTo === "function") {
          internalPlayer.seekTo(startSecRef.current, true);
        }
      } catch {
        // ignore
      }
      try {
        if (typeof internalPlayer.playVideo === "function") {
          internalPlayer.playVideo();
        }
      } catch {
        // ignore
      }
    }
    setPhase("starting");
  }, [isAppleMusicRound, seekToSnippetStart]);

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
      if (phase === "finished" || phase === "awaitingStart") {
        return true;
      }
      return false;
    },
    selectCurrent: () => {
      if (phase === "awaitingStart") {
        if (!isPlayerReady) return;
        playClick?.();
        vibrate?.();
        unlockAndStart();
        return;
      }
      if (phase === "playing" && round) {
        handleAnswer(selectedIndex);
        return;
      }
      if (phase === "feedback") {
        clearTimers();
        if (roundNumber >= TOTAL_ROUNDS) {
          setPhase("finished");
        } else {
          startNextRound();
        }
        return;
      }
      if (phase === "finished") {
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
      if (
        phase === "playing" &&
        (youtubePlayerRef.current || appleMusicPlayerRef.current)
      ) {
        playClick?.();
        vibrate?.();
        seekToSnippetStart();
        clearTimers();
        snippetStartedAtRef.current = performance.now();
        snippetTimerRef.current = setTimeout(() => {
          if (!round) return;
          clearTimers();
          setRound((r) =>
            r ? { ...r, selectedIndex: null, isCorrect: false } : r
          );
          setSelectedIndex(round?.correctIndex ?? 0);
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
  }), [
    phase,
    round,
    selectedIndex,
    handleAnswer,
    playClick,
    playScroll,
    vibrate,
    clearTimers,
    roundNumber,
    startNextRound,
    unlockAndStart,
    isPlayerReady,
    seekToSnippetStart,
  ]);

  const headerTitle = useMemo(() => {
    if (phase === "finished") return t("apps.ipod.musicQuiz.results");
    return t("apps.ipod.musicQuiz.title");
  }, [phase, t]);

  return {
    t,
    isVisible,
    isModernUi,
    bodyTopOffsetPx,
    finalVolume,
    phase,
    round,
    roundNumber,
    score,
    lastRoundPoints,
    selectedIndex,
    isPlayerReady,
    hasEnoughTracks,
    correctTrack,
    isAppleMusicRound,
    headerTitle,
    youtubePlayerRef,
    appleMusicPlayerRef,
    setSelectedIndex,
    handleAnswer,
    unlockAndStart,
    handleReady,
    handlePlay,
    handleDuration,
    playClick,
    vibrate,
  };
}

export type MusicQuizViewModel = ReturnType<typeof useMusicQuiz>;
