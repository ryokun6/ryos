import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAssistantStore } from "@/stores/useAssistantStore";
import {
  primeAssistantSpeech,
  speakAssistantText,
  stopAssistantSpeech,
} from "./assistantSpeech";

/** Gesture events iOS Safari accepts for unlocking speech synthesis. */
const SPEECH_UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

interface UseAssistantSpeechOptions {
  /** Latest visible assistant reply text (streams in while loading). */
  latestAssistantText: string;
  isLoading: boolean;
}

/**
 * Speak assistant replies aloud with browser TTS when Speech is enabled in
 * the character's context menu. Replies are spoken once they finish
 * generating (streaming text is left to the bubble); a persisted reply
 * restored on mount is never re-spoken.
 */
export function useAssistantSpeech({
  latestAssistantText,
  isLoading,
}: UseAssistantSpeechOptions): void {
  const speechEnabled = useAssistantStore((state) => state.speechEnabled);
  const { i18n } = useTranslation();

  // Seed with the mount-time text so the reply restored from localStorage
  // (or one spoken manually via the Speech toggle) is not spoken again.
  const lastSpokenTextRef = useRef(latestAssistantText);

  // A new turn makes any speech from the previous reply stale.
  useEffect(() => {
    if (isLoading) stopAssistantSpeech();
  }, [isLoading]);

  // When Speech was already on from a previous session, replies finish
  // outside any user gesture and iOS Safari drops the `speak()` call. Prime
  // synthesis from the first gesture of the session so those asynchronous
  // replies are audible. (Toggling Speech on manually primes as a side
  // effect of speaking inside the menu click, which is why that path
  // already worked.)
  useEffect(() => {
    if (!speechEnabled) return;
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
  }, [speechEnabled]);

  useEffect(() => {
    if (isLoading) return;
    const text = latestAssistantText;
    if (!text || text === lastSpokenTextRef.current) return;
    // Track even while disabled so toggling Speech on later doesn't replay
    // a reply the user already read in silence.
    lastSpokenTextRef.current = text;
    if (!speechEnabled) return;
    speakAssistantText(text, { locale: i18n.language });
  }, [latestAssistantText, isLoading, speechEnabled, i18n.language]);

  useEffect(() => () => stopAssistantSpeech(), []);
}
