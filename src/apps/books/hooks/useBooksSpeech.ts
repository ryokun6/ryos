import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBrowserSpeechSynthesis,
  pickSpeechVoiceForLanguage,
} from "@/utils/browserSpeech";
import {
  applySpeechHighlight,
  clearSpeechHighlight,
  collectSpeechChunksFromRange,
  getVisiblePageRange,
  type BooksSpeechChunk,
  type SpeechRenditionLike,
} from "../utils/booksSpeech";

/** Safety net for stuck utterances (broken/voiceless synth engines). */
const UTTERANCE_TIMEOUT_BASE_MS = 10_000;
const UTTERANCE_TIMEOUT_PER_CHAR_MS = 150;
/** Re-attempt an auto page turn swallowed by the flip-animation lock. */
const ADVANCE_RETRY_MS = 700;
const MAX_ADVANCE_ATTEMPTS = 6;
/** Stop after this many consecutive pages with nothing to speak
 * (e.g. an image-only book) instead of silently paging to the end. */
const MAX_EMPTY_PAGE_STREAK = 10;
/** Let epub.js settle the new page before re-extracting visible text. */
const RESUME_AFTER_RELOCATE_MS = 120;

interface UseBooksSpeechOptions {
  getRendition: () => SpeechRenditionLike | null;
  /** BCP 47 language for utterances (book metadata > UI locale). */
  getSpeechLanguage: () => string;
  getSpeechRate: () => number;
  canAdvancePage: () => boolean;
  advancePage: () => void;
}

export interface UseBooksSpeechResult {
  isSpeaking: boolean;
  startSpeaking: () => void;
  stopSpeaking: () => void;
  /** Call from the rendition's `relocated` handler. */
  handleRelocated: () => void;
}

/**
 * Read-aloud controller for the Books reader using browser speech synthesis.
 *
 * Speaks the visible page sentence by sentence (highlighting the active
 * sentence), then automatically turns to the next page and continues. Any
 * relocation while speaking (auto advance, manual page turn, chapter jump,
 * resize) restarts speech from the newly visible page.
 */
export function useBooksSpeech({
  getRendition,
  getSpeechLanguage,
  getSpeechRate,
  canAdvancePage,
  advancePage,
}: UseBooksSpeechOptions): UseBooksSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Bumping the session invalidates every pending utterance callback/timer.
  const sessionRef = useRef(0);
  // True while the user wants read-aloud (also across auto page turns).
  const wantsSpeechRef = useRef(false);
  // Consecutive auto-skipped pages with no speakable text.
  const emptyPageStreakRef = useRef(0);
  const highlightedDocRef = useRef<Document | null>(null);
  const timersRef = useRef<number[]>([]);

  const optionsRef = useRef({
    getRendition,
    getSpeechLanguage,
    getSpeechRate,
    canAdvancePage,
    advancePage,
  });
  optionsRef.current = {
    getRendition,
    getSpeechLanguage,
    getSpeechRate,
    canAdvancePage,
    advancePage,
  };

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const clearHighlight = useCallback(() => {
    clearSpeechHighlight(highlightedDocRef.current);
    highlightedDocRef.current = null;
  }, []);

  const stopSpeaking = useCallback(() => {
    sessionRef.current += 1;
    wantsSpeechRef.current = false;
    clearTimers();
    clearHighlight();
    getBrowserSpeechSynthesis()?.cancel();
    setIsSpeaking(false);
  }, [clearHighlight, clearTimers]);

  // Reached the end of the visible page: auto-turn to the next page (the
  // resulting `relocated` event resumes speech there) or stop at book end.
  // Retries because rapid successive turns (several unspeakable pages in a
  // row) can be swallowed by the reader's flip-animation lock.
  const finishPage = useCallback(
    (session: number, attempt = 0) => {
      if (session !== sessionRef.current) return;
      clearHighlight();
      if (
        !optionsRef.current.canAdvancePage() ||
        attempt >= MAX_ADVANCE_ATTEMPTS
      ) {
        stopSpeaking();
        return;
      }
      optionsRef.current.advancePage();
      const timeoutId = window.setTimeout(() => {
        // Still the same session means no `relocated` arrived — retry.
        if (session === sessionRef.current) finishPage(session, attempt + 1);
      }, ADVANCE_RETRY_MS);
      timersRef.current.push(timeoutId);
    },
    [clearHighlight, stopSpeaking]
  );

  const speakChunk = useCallback(
    (session: number, chunks: BooksSpeechChunk[], index: number) => {
      if (session !== sessionRef.current) return;
      const chunk = chunks[index];
      if (!chunk) {
        finishPage(session);
        return;
      }
      const synth = getBrowserSpeechSynthesis();
      if (!synth) {
        stopSpeaking();
        return;
      }

      clearHighlight();
      highlightedDocRef.current =
        chunk.range.startContainer.ownerDocument ?? null;
      applySpeechHighlight(chunk.range);

      const lang = optionsRef.current.getSpeechLanguage();
      const rate = optionsRef.current.getSpeechRate();
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = lang;
      utterance.rate = rate;
      const voice = pickSpeechVoiceForLanguage(synth.getVoices(), lang);
      if (voice) utterance.voice = voice;

      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (session !== sessionRef.current) return;
        if (!ok) {
          // Engine failure (no voices, synthesis error) — stop cleanly rather
          // than racing through highlights and page turns with no audio.
          stopSpeaking();
          return;
        }
        speakChunk(session, chunks, index + 1);
      };

      utterance.onend = () => settle(true);
      utterance.onerror = () => settle(false);
      // Scale with text length and rate so slow voices never get cut off.
      const timeoutId = window.setTimeout(
        () => settle(false),
        UTTERANCE_TIMEOUT_BASE_MS +
          (chunk.text.length * UTTERANCE_TIMEOUT_PER_CHAR_MS) / Math.max(rate, 0.5)
      );
      timersRef.current.push(timeoutId);

      // Speaking synchronously keeps iOS Safari happy: the first utterance of
      // a session runs inside the user gesture that started read-aloud, and
      // later ones chain from onend (which iOS allows).
      synth.resume();
      synth.speak(utterance);
    },
    [clearHighlight, finishPage, stopSpeaking]
  );

  const speakVisiblePage = useCallback(
    (session: number) => {
      if (session !== sessionRef.current) return;
      const rendition = optionsRef.current.getRendition();
      if (!rendition) {
        stopSpeaking();
        return;
      }
      let chunks: BooksSpeechChunk[] = [];
      try {
        const range = getVisiblePageRange(rendition);
        chunks = range ? collectSpeechChunksFromRange(range) : [];
      } catch {
        chunks = [];
      }
      if (chunks.length === 0) {
        // Nothing speakable on this page (e.g. a cover or full-page image) —
        // skip ahead, but give up after a long run of empty pages.
        emptyPageStreakRef.current += 1;
        if (emptyPageStreakRef.current > MAX_EMPTY_PAGE_STREAK) {
          stopSpeaking();
          return;
        }
        finishPage(session);
        return;
      }
      emptyPageStreakRef.current = 0;
      speakChunk(session, chunks, 0);
    },
    [finishPage, speakChunk, stopSpeaking]
  );

  const startSpeaking = useCallback(() => {
    const session = ++sessionRef.current;
    wantsSpeechRef.current = true;
    emptyPageStreakRef.current = 0;
    clearTimers();
    clearHighlight();
    const synth = getBrowserSpeechSynthesis();
    if (!synth) return;
    synth.cancel();
    setIsSpeaking(true);
    // Warm the voice list (async on some engines); utterance.lang still lets
    // the engine pick a fallback voice before the list loads.
    synth.getVoices();
    speakVisiblePage(session);
  }, [clearHighlight, clearTimers, speakVisiblePage]);

  const handleRelocated = useCallback(() => {
    if (!wantsSpeechRef.current) return;
    // Invalidate in-flight utterances (manual page turns / chapter jumps /
    // reflows) and restart from the freshly visible page.
    const session = ++sessionRef.current;
    clearTimers();
    clearHighlight();
    getBrowserSpeechSynthesis()?.cancel();
    const timeoutId = window.setTimeout(() => {
      speakVisiblePage(session);
    }, RESUME_AFTER_RELOCATE_MS);
    timersRef.current.push(timeoutId);
  }, [clearHighlight, clearTimers, speakVisiblePage]);

  // Stop speech (and drop highlights) when the reader unmounts / book closes.
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  return { isSpeaking, startSpeaking, stopSpeaking, handleRelocated };
}
