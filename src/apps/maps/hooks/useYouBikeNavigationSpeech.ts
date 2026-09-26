import { useCallback, useEffect, useRef } from "react";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { resumeAudioContext } from "@/lib/audioContext";
import {
  youbikeNavAnnounce,
  type YouBikeNavAnnounceResult,
} from "../youbike/navigation";
import {
  cancelYouBikeNavigationSpeech,
  registerYouBikeNavigationSpeechStop,
} from "../youbike/navigationSpeech";

export function useYouBikeNavigationSpeech(options: {
  enabled: boolean;
  focusedIndex: number;
  stepCount: number;
  remainingMeters: number | null;
  labelForIndex: (index: number) => string;
  thenPhrase: (label: string) => string;
}) {
  const {
    enabled,
    focusedIndex,
    stepCount,
    remainingMeters,
    labelForIndex,
    thenPhrase,
  } = options;

  const { speak, stop } = useTtsQueue();

  const stateRef = useRef({
    lastSpokenIndex: null as number | null,
    lastApproachIndex: null as number | null,
    lastSpeakAtMs: 0,
  });
  const labelForIndexRef = useRef(labelForIndex);
  const thenPhraseRef = useRef(thenPhrase);
  const speakRef = useRef(speak);
  const stopRef = useRef(stop);
  labelForIndexRef.current = labelForIndex;
  thenPhraseRef.current = thenPhrase;
  speakRef.current = speak;
  stopRef.current = stop;

  useEffect(() => registerYouBikeNavigationSpeechStop(stop), [stop]);

  const applyDecision = useCallback((decision: YouBikeNavAnnounceResult) => {
    stateRef.current = {
      lastSpokenIndex: decision.lastSpokenIndex,
      lastApproachIndex: decision.lastApproachIndex,
      lastSpeakAtMs: decision.lastSpeakAtMs,
    };
    if (decision.kind == null || decision.speakIndex == null) return;
    const label = labelForIndexRef.current(decision.speakIndex);
    if (!label) return;
    const text =
      decision.kind === "approach" ? thenPhraseRef.current(label) : label;
    // Replace, don't queue — same as Chat's manual replay (stop then speak).
    stopRef.current();
    speakRef.current(text);
  }, []);

  const speakStart = useCallback(
    (index: number) => {
      // Unlock the shared AudioContext inside the Start tap, matching Chat /
      // Ryo: iOS Safari will not play `/api/speech` clips until resume() runs
      // in a user gesture.
      void resumeAudioContext();
      applyDecision(
        youbikeNavAnnounce({
          isStarting: true,
          focusedIndex: index,
          stepCount,
          remainingMeters,
          lastSpokenIndex: null,
          lastApproachIndex: null,
          lastSpeakAtMs: 0,
          nowMs: Date.now(),
        })
      );
    },
    [applyDecision, remainingMeters, stepCount]
  );

  useEffect(() => {
    if (!enabled) {
      cancelYouBikeNavigationSpeech();
      stateRef.current = {
        lastSpokenIndex: null,
        lastApproachIndex: null,
        lastSpeakAtMs: 0,
      };
      return;
    }
    applyDecision(
      youbikeNavAnnounce({
        isStarting: false,
        focusedIndex,
        stepCount,
        remainingMeters,
        lastSpokenIndex: stateRef.current.lastSpokenIndex,
        lastApproachIndex: stateRef.current.lastApproachIndex,
        lastSpeakAtMs: stateRef.current.lastSpeakAtMs,
        nowMs: Date.now(),
      })
    );
  }, [applyDecision, enabled, focusedIndex, remainingMeters, stepCount]);

  useEffect(() => () => cancelYouBikeNavigationSpeech(), []);

  return { speakStart, cancel: cancelYouBikeNavigationSpeech };
}
