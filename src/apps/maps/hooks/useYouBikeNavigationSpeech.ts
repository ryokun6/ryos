import { useCallback, useEffect, useRef } from "react";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { cleanTextForSpeech } from "@/apps/chats/utils/textForSpeech";
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

  const { speak, stop, unlock } = useTtsQueue();

  const stateRef = useRef({
    lastSpokenIndex: null as number | null,
    lastApproachIndex: null as number | null,
    lastSpeakAtMs: 0,
  });
  const wasEnabledRef = useRef(false);
  const labelForIndexRef = useRef(labelForIndex);
  const thenPhraseRef = useRef(thenPhrase);
  const speakRef = useRef(speak);
  const stopRef = useRef(stop);
  const unlockRef = useRef(unlock);
  labelForIndexRef.current = labelForIndex;
  thenPhraseRef.current = thenPhrase;
  speakRef.current = speak;
  stopRef.current = stop;
  unlockRef.current = unlock;

  useEffect(() => registerYouBikeNavigationSpeechStop(stop), [stop]);

  const playCue = useCallback(
    (
      text: string,
      options: { fromGesture: boolean; replace: boolean }
    ) => {
      const spoken = cleanTextForSpeech(text);
      if (!spoken) return;
      // Chat's speaker button stop()s only when replacing a clip. Doing
      // that on Start aborted the in-gesture `/api/speech` fetch on iOS
      // once the enabled-effect re-ran. Unlock is also inside speak().
      if (options.replace) stopRef.current();
      if (options.fromGesture) unlockRef.current();
      speakRef.current(spoken);
    },
    []
  );

  const applyDecision = useCallback(
    (
      decision: YouBikeNavAnnounceResult,
      play: { fromGesture: boolean; replace: boolean }
    ) => {
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
      playCue(text, play);
    },
    [playCue]
  );

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
        }),
        { fromGesture: true, replace: false }
      );
    },
    [applyDecision, remainingMeters, stepCount]
  );

  const speakManualAdvance = useCallback(
    (index: number) => {
      applyDecision(
        youbikeNavAnnounce({
          isStarting: false,
          isManualAdvance: true,
          focusedIndex: index,
          stepCount,
          remainingMeters,
          lastSpokenIndex: stateRef.current.lastSpokenIndex,
          lastApproachIndex: stateRef.current.lastApproachIndex,
          lastSpeakAtMs: stateRef.current.lastSpeakAtMs,
          nowMs: Date.now(),
        }),
        { fromGesture: true, replace: true }
      );
    },
    [applyDecision, remainingMeters, stepCount]
  );

  useEffect(() => {
    if (!enabled) {
      if (wasEnabledRef.current) {
        cancelYouBikeNavigationSpeech();
        stateRef.current = {
          lastSpokenIndex: null,
          lastApproachIndex: null,
          lastSpeakAtMs: 0,
        };
      }
      wasEnabledRef.current = false;
      return;
    }
    const justEnabled = !wasEnabledRef.current;
    wasEnabledRef.current = true;
    // Start already spoke in the tap. Do not stop()+speak() again here —
    // that races the in-flight /api/speech request outside the gesture.
    if (justEnabled) return;
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
      }),
      { fromGesture: false, replace: true }
    );
  }, [applyDecision, enabled, focusedIndex, remainingMeters, stepCount]);

  useEffect(() => () => cancelYouBikeNavigationSpeech(), []);

  return {
    speakStart,
    speakManualAdvance,
    cancel: cancelYouBikeNavigationSpeech,
  };
}
