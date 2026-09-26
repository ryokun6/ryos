import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  primeAssistantSpeech,
  speakAssistantText,
  stopAssistantSpeech,
} from "@/components/assistant/assistantSpeech";
import {
  youbikeNavAnnounce,
  type YouBikeNavAnnounceResult,
} from "../youbike/navigation";
import {
  cancelYouBikeNavigationSpeech,
  registerYouBikeNavigationSpeechStop,
} from "../youbike/navigationSpeech";

/** Same gesture set the floating assistant uses to unlock iOS Safari TTS. */
const SPEECH_UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

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
  const { i18n } = useTranslation();

  const stateRef = useRef({
    lastSpokenIndex: null as number | null,
    lastApproachIndex: null as number | null,
    lastSpeakAtMs: 0,
  });
  const wasEnabledRef = useRef(false);
  const labelForIndexRef = useRef(labelForIndex);
  const thenPhraseRef = useRef(thenPhrase);
  const localeRef = useRef(i18n.language);
  labelForIndexRef.current = labelForIndex;
  thenPhraseRef.current = thenPhrase;
  localeRef.current = i18n.language;

  useEffect(
    () => registerYouBikeNavigationSpeechStop(stopAssistantSpeech),
    []
  );

  const playCue = useCallback(
    (text: string, fromGesture: boolean) => {
      if (!text.trim()) return;
      // Browser Chat / floating assistant: prime inside the tap, then
      // speakAssistantText (speechSynthesis). iOS drops a speak() that is
      // not in a gesture until the first in-gesture utterance starts.
      if (fromGesture) primeAssistantSpeech();
      speakAssistantText(text, { locale: localeRef.current });
    },
    []
  );

  const applyDecision = useCallback(
    (decision: YouBikeNavAnnounceResult, fromGesture: boolean) => {
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
      playCue(text, fromGesture);
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
        true
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
        true
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
    // Start already spoke in the tap. Do not cancel+speak again here —
    // iOS would drop the replacement speak() outside the gesture.
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
      false
    );
  }, [applyDecision, enabled, focusedIndex, remainingMeters, stepCount]);

  // Same capture listeners as useAssistantSpeech: a later tap re-speaks a
  // GPS cue iOS dropped, and keeps synthesis unlocked after Start.
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    const unlock = () => primeAssistantSpeech();
    SPEECH_UNLOCK_EVENTS.forEach((event) =>
      document.addEventListener(event, unlock, {
        capture: true,
        passive: true,
      })
    );
    return () => {
      SPEECH_UNLOCK_EVENTS.forEach((event) =>
        document.removeEventListener(event, unlock, true)
      );
    };
  }, [enabled]);

  useEffect(() => () => cancelYouBikeNavigationSpeech(), []);

  return {
    speakStart,
    speakManualAdvance,
    cancel: cancelYouBikeNavigationSpeech,
  };
}
