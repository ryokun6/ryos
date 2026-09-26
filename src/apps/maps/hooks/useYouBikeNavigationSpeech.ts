import { useCallback, useEffect, useRef } from "react";
import {
  youbikeNavAnnounce,
  type YouBikeNavAnnounceResult,
} from "../youbike/navigation";
import {
  cancelYouBikeNavigationSpeech,
  speakYouBikeNavigation,
} from "../youbike/navigationSpeech";

export function useYouBikeNavigationSpeech(options: {
  enabled: boolean;
  focusedIndex: number;
  stepCount: number;
  remainingMeters: number | null;
  language: string;
  labelForIndex: (index: number) => string;
  thenPhrase: (label: string) => string;
}) {
  const {
    enabled,
    focusedIndex,
    stepCount,
    remainingMeters,
    language,
    labelForIndex,
    thenPhrase,
  } = options;

  const stateRef = useRef({
    lastSpokenIndex: null as number | null,
    lastApproachIndex: null as number | null,
    lastSpeakAtMs: 0,
  });
  const labelForIndexRef = useRef(labelForIndex);
  const thenPhraseRef = useRef(thenPhrase);
  const languageRef = useRef(language);
  labelForIndexRef.current = labelForIndex;
  thenPhraseRef.current = thenPhrase;
  languageRef.current = language;

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
    speakYouBikeNavigation(text, languageRef.current);
  }, []);

  const speakStart = useCallback(
    (index: number) => {
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
