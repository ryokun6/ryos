import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBrowserSpeechSynthesis,
  resolveSpeechVoice,
} from "@/utils/browserSpeech";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import {
  applySpeechHighlight,
  clearSpeechHighlight,
  collectSpeechChunksFromRange,
  getVisiblePageRange,
  isRangeEndOnVisiblePage,
  isRangeOnVisiblePage,
  rangeEndsAtOrBefore,
  type BooksSpeechCarryOver,
  type BooksSpeechChunk,
  type SpeechRenditionLike,
} from "../utils/booksSpeech";

/** Safety net for stuck utterances (broken/voiceless synth engines). */
const UTTERANCE_TIMEOUT_BASE_MS = 10_000;
const UTTERANCE_TIMEOUT_PER_CHAR_MS = 150;
/** Poll the engine state to detect utterances whose end event never fires
 * (Chrome GC bug, speech-dispatcher backends, some mobile engines). */
const WATCHDOG_INTERVAL_MS = 250;
/** Consecutive idle polls (after speech started) that count as "finished". */
const WATCHDOG_IDLE_POLLS = 2;
/** Stop if this many chunks in a row only "finish" via the hard timeout —
 * the engine is claiming to speak forever without delivering audio events. */
const MAX_TIMEOUT_ENDINGS = 3;
/** Re-attempt an auto page turn swallowed by the flip-animation lock. */
const ADVANCE_RETRY_MS = 700;
const MAX_ADVANCE_ATTEMPTS = 6;
/** epub.js reports locations asynchronously (queue + rAF + DOM mapping), so a
 * completed page turn can surface its `relocated` event well after the turn.
 * How many extra retry windows to keep waiting when the location has already
 * changed before advancing again (which would skip pages). */
const MAX_RELOCATE_WAIT_CHECKS = 10;
/** Stop after this many consecutive pages with nothing to speak
 * (e.g. an image-only book) instead of silently paging to the end. */
const MAX_EMPTY_PAGE_STREAK = 10;
/** Let epub.js settle the new page before re-extracting visible text. */
const RESUME_AFTER_RELOCATE_MS = 120;
/** Cancel-and-wait polling until the engine goes idle before restarting
 * speech after a relocation. Some engines (notably Safari) keep playing a
 * cancelled utterance for a moment; speaking over it queues the new chunk
 * behind stale audio and read-aloud drifts pages behind the screen. */
const ENSURE_IDLE_POLL_MS = 150;
const MAX_ENSURE_IDLE_POLLS = 40;
/** When the page auto-turns mid-utterance (a sentence cut by the page end),
 * the tail of that sentence keeps playing across the flip — wait for its
 * natural end rather than cancelling it. Generous cap for slow voices. */
const MAX_NATURAL_FINISH_POLLS = 300;

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
  /** True while read-aloud is active but paused (resumable). */
  isPaused: boolean;
  startSpeaking: () => void;
  stopSpeaking: () => void;
  pauseSpeaking: () => void;
  resumeSpeaking: () => void;
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
  const [isPaused, setIsPaused] = useState(false);
  // Bumping the session invalidates every pending utterance callback/timer.
  const sessionRef = useRef(0);
  // True while the user wants read-aloud (also across auto page turns).
  const wantsSpeechRef = useRef(false);
  // Mirrors isPaused for callbacks that must not depend on render state.
  const isPausedRef = useRef(false);
  // Chunks (and index) of the in-flight page so pause can resume mid-page.
  const currentChunksRef = useRef<BooksSpeechChunk[] | null>(null);
  const currentChunkIndexRef = useRef(0);
  // Consecutive auto-skipped pages with no speakable text.
  const emptyPageStreakRef = useRef(0);
  // Consecutive chunks that ended only via the hard timeout (no engine event).
  const timeoutEndingStreakRef = useRef(0);
  // Strong reference to the in-flight utterance. Chrome garbage-collects
  // otherwise-unreferenced utterances mid-speech, silently dropping their
  // end/error events — which used to strand read-aloud at the page end.
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const highlightedDocRef = useRef<Document | null>(null);
  const timersRef = useRef<number[]>([]);
  // Set when the page was auto-turned at a mid-sentence cut while the cut
  // sentence is still being spoken. `relocated` consumes it to resume speech
  // on the new page without cancelling the in-flight utterance.
  const cutAdvanceRef = useRef<{
    carryOver: BooksSpeechCarryOver;
    beforeCfi: string | null;
  } | null>(null);
  // End position of the last chunk spoken before an auto page turn at a
  // sentence cut, so the new page skips text that was already spoken.
  const pendingCarryOverRef = useRef<BooksSpeechCarryOver | null>(null);

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
    isPausedRef.current = false;
    activeUtteranceRef.current = null;
    currentChunksRef.current = null;
    currentChunkIndexRef.current = 0;
    cutAdvanceRef.current = null;
    pendingCarryOverRef.current = null;
    clearTimers();
    clearHighlight();
    getBrowserSpeechSynthesis()?.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [clearHighlight, clearTimers]);

  const getCurrentStartCfi = useCallback((): string | null => {
    try {
      const rendition = optionsRef.current.getRendition();
      const location = rendition?.currentLocation() as {
        start?: { cfi?: string };
      } | null;
      return location?.start?.cfi ?? null;
    } catch {
      return null;
    }
  }, []);

  // Reached the end of the visible page: auto-turn to the next page (the
  // resulting `relocated` event resumes speech there) or stop at book end.
  // Retries because rapid successive turns (several unspeakable pages in a
  // row) can be swallowed by the reader's flip-animation lock — but only
  // re-advances when the location genuinely didn't change, because epub.js
  // may deliver `relocated` for a completed turn later than the retry timer
  // (advancing again then would skip pages).
  const finishPage = useCallback(
    (session: number, attempt = 0) => {
      if (session !== sessionRef.current) return;
      // Off the chunked page now — a pause during the turn resumes from the
      // freshly visible page instead of stale ranges.
      currentChunksRef.current = null;
      currentChunkIndexRef.current = 0;
      clearHighlight();
      if (
        !optionsRef.current.canAdvancePage() ||
        attempt >= MAX_ADVANCE_ATTEMPTS
      ) {
        stopSpeaking();
        return;
      }
      // A mid-utterance cut advance already turned this page — don't turn
      // again; just wait for its `relocated` event (which resumes speech).
      // If that turn was swallowed, the retry below re-advances.
      const cutAdvance = cutAdvanceRef.current;
      const beforeCfi = cutAdvance ? cutAdvance.beforeCfi : getCurrentStartCfi();
      if (!cutAdvance || attempt > 0) {
        optionsRef.current.advancePage();
      }
      const waitForRelocate = (checksLeft: number) => {
        const timeoutId = window.setTimeout(() => {
          // A `relocated` event would have bumped the session and resumed.
          if (session !== sessionRef.current) return;
          const nowCfi = getCurrentStartCfi();
          if (beforeCfi && nowCfi && nowCfi !== beforeCfi) {
            // The page did turn; epub.js just hasn't emitted `relocated`
            // yet. Keep waiting instead of turning again.
            if (checksLeft > 0) waitForRelocate(checksLeft - 1);
            else stopSpeaking();
            return;
          }
          finishPage(session, attempt + 1);
        }, ADVANCE_RETRY_MS);
        timersRef.current.push(timeoutId);
      };
      waitForRelocate(MAX_RELOCATE_WAIT_CHECKS);
    },
    [clearHighlight, getCurrentStartCfi, stopSpeaking]
  );

  // Turn the page at a sentence that is cut off by the page end, while (or
  // right after) speaking it — the sentence audio continues uninterrupted
  // across the flip, and the recorded carry-over lets the new page skip the
  // text that was already spoken (instead of repeating the sentence).
  const advanceAtCut = useCallback(
    (session: number, chunk: BooksSpeechChunk) => {
      if (session !== sessionRef.current) return;
      if (cutAdvanceRef.current) return;
      if (!optionsRef.current.canAdvancePage()) return;
      cutAdvanceRef.current = {
        carryOver: {
          endContainer: chunk.range.endContainer,
          endOffset: chunk.range.endOffset,
        },
        beforeCfi: getCurrentStartCfi(),
      };
      optionsRef.current.advancePage();
    },
    [getCurrentStartCfi]
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

      currentChunksRef.current = chunks;
      currentChunkIndexRef.current = index;

      clearHighlight();
      highlightedDocRef.current =
        chunk.range.startContainer.ownerDocument ?? null;
      applySpeechHighlight(chunk.range);

      const lang = optionsRef.current.getSpeechLanguage();
      const rate = optionsRef.current.getSpeechRate();
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = lang;
      utterance.rate = rate;
      const voice = resolveSpeechVoice(
        synth.getVoices(),
        lang,
        useAudioSettingsStore.getState().browserTtsVoiceURI
      );
      if (voice) utterance.voice = voice;
      activeUtteranceRef.current = utterance;

      let settled = false;
      let started = false;
      let idlePolls = 0;
      const settle = (ok: boolean, viaTimeout = false) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        window.clearInterval(watchdogId);
        if (activeUtteranceRef.current === utterance) {
          activeUtteranceRef.current = null;
        }
        if (session !== sessionRef.current) return;
        if (viaTimeout) {
          timeoutEndingStreakRef.current += 1;
          if (timeoutEndingStreakRef.current >= MAX_TIMEOUT_ENDINGS) {
            // The engine repeatedly claims to speak but never reports any
            // progress — stop instead of silently paging through the book.
            stopSpeaking();
            return;
          }
        } else {
          timeoutEndingStreakRef.current = 0;
        }
        if (!ok) {
          // Engine failure (no voices, synthesis error) — stop cleanly rather
          // than racing through highlights and page turns with no audio.
          stopSpeaking();
          return;
        }
        // Sentence cut off by the page end but no word boundary crossed the
        // cut while speaking (engine without boundary events, or the cut sat
        // at the very end): turn the page now so the next page resumes with
        // the carry-over instead of repeating this sentence.
        if (chunk.pageEndCutIndex !== undefined) {
          advanceAtCut(session, chunk);
        }
        if (cutAdvanceRef.current) {
          // A page turn at the cut is in flight. Anything after this chunk
          // lives past the page boundary — the resumed speech on the new
          // page picks it up (after the carry-over skip); finishPage just
          // waits for `relocated` (re-advancing only if the turn was
          // swallowed).
          finishPage(session);
          return;
        }
        speakChunk(session, chunks, index + 1);
      };

      utterance.onstart = () => {
        started = true;
      };
      utterance.onend = () => settle(true);
      utterance.onerror = () => settle(false);
      const cutIndex = chunk.pageEndCutIndex;
      if (cutIndex !== undefined && cutIndex < chunk.text.length) {
        // The sentence continues past the visible page end. Flip the page as
        // the spoken word crosses the cut so the text being read stays on
        // screen; the utterance keeps playing through the flip.
        utterance.onboundary = (event) => {
          if (settled || session !== sessionRef.current) return;
          if (event.charIndex >= cutIndex) {
            advanceAtCut(session, chunk);
          }
        };
      }

      // Some engines never deliver end events (and Chrome can GC-drop them
      // even with the utterance referenced), so poll the engine: once speech
      // has started, an idle engine means the utterance finished.
      const watchdogId = window.setInterval(() => {
        if (settled || session !== sessionRef.current) {
          window.clearInterval(watchdogId);
          return;
        }
        const busy = synth.speaking || synth.pending;
        if (!started) {
          if (synth.speaking) started = true;
          return;
        }
        if (busy) {
          idlePolls = 0;
          return;
        }
        idlePolls += 1;
        if (idlePolls >= WATCHDOG_IDLE_POLLS) settle(true);
      }, WATCHDOG_INTERVAL_MS);

      // Hard cap, scaled with text length and rate so slow voices never get
      // cut off. If speech had started, a missing end event is treated as
      // completion (keep reading) rather than a failure.
      const timeoutId = window.setTimeout(
        () => settle(started, true),
        UTTERANCE_TIMEOUT_BASE_MS +
          (chunk.text.length * UTTERANCE_TIMEOUT_PER_CHAR_MS) /
            Math.max(rate, 0.5)
      );
      timersRef.current.push(timeoutId);

      // Speaking synchronously keeps iOS Safari happy: the first utterance of
      // a session runs inside the user gesture that started read-aloud, and
      // later ones chain from onend (which iOS allows).
      synth.resume();
      synth.speak(utterance);
    },
    [advanceAtCut, clearHighlight, finishPage, stopSpeaking]
  );

  const speakVisiblePage = useCallback(
    (session: number) => {
      if (session !== sessionRef.current) return;
      const rendition = optionsRef.current.getRendition();
      if (!rendition) {
        stopSpeaking();
        return;
      }
      const carryOver = pendingCarryOverRef.current;
      pendingCarryOverRef.current = null;
      let chunks: BooksSpeechChunk[] = [];
      try {
        const range = getVisiblePageRange(rendition);
        chunks = range ? collectSpeechChunksFromRange(range) : [];
        // The CFI-derived range can overshoot the page (e.g. when the end
        // boundary is unresolvable and the range extends to the section end).
        // Trust layout geometry: only speak chunks actually on screen.
        chunks = chunks.filter((chunk) => isRangeOnVisiblePage(chunk.range));
        // After an auto page turn at a cut-off sentence, skip everything
        // that was already spoken on the previous page (the cut sentence was
        // spoken whole across the flip) instead of repeating it.
        if (carryOver) {
          chunks = chunks.filter(
            (chunk) => !rangeEndsAtOrBefore(chunk.range, carryOver)
          );
        }
        // When the cut wasn't detectable from the page range itself (an
        // unresolvable end boundary falls back to the section end), detect it
        // geometrically: a final chunk whose end is off-screen crosses onto
        // the next page — flip once it finishes and carry over its end.
        const lastChunk = chunks[chunks.length - 1];
        if (
          lastChunk &&
          lastChunk.pageEndCutIndex === undefined &&
          !isRangeEndOnVisiblePage(lastChunk.range)
        ) {
          lastChunk.pageEndCutIndex = lastChunk.text.length;
        }
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

  // Run `speak` once the engine has actually gone idle. Speaking while a
  // cancelled utterance is still winding down queues the new chunk behind
  // stale audio on some engines (Safari), drifting speech behind the screen.
  // With `cancelWhileWaiting` false (auto page turn at a cut-off sentence),
  // the in-flight utterance is left to finish naturally — the tail of the
  // cut sentence plays across the flip — before speaking the new page.
  const speakWhenSynthIdle = useCallback(
    (
      session: number,
      speak: () => void,
      polls = 0,
      cancelWhileWaiting = true
    ) => {
      if (session !== sessionRef.current) return;
      const synth = getBrowserSpeechSynthesis();
      if (!synth) {
        stopSpeaking();
        return;
      }
      const maxPolls = cancelWhileWaiting
        ? MAX_ENSURE_IDLE_POLLS
        : MAX_NATURAL_FINISH_POLLS;
      if ((synth.speaking || synth.pending) && polls < maxPolls) {
        if (cancelWhileWaiting) synth.cancel();
        const timeoutId = window.setTimeout(
          () =>
            speakWhenSynthIdle(session, speak, polls + 1, cancelWhileWaiting),
          ENSURE_IDLE_POLL_MS
        );
        timersRef.current.push(timeoutId);
        return;
      }
      speak();
    },
    [stopSpeaking]
  );

  const speakVisiblePageWhenIdle = useCallback(
    (session: number, polls = 0, cancelWhileWaiting = true) =>
      speakWhenSynthIdle(
        session,
        () => speakVisiblePage(session),
        polls,
        cancelWhileWaiting
      ),
    [speakVisiblePage, speakWhenSynthIdle]
  );

  const startSpeaking = useCallback(() => {
    const session = ++sessionRef.current;
    wantsSpeechRef.current = true;
    isPausedRef.current = false;
    emptyPageStreakRef.current = 0;
    timeoutEndingStreakRef.current = 0;
    cutAdvanceRef.current = null;
    pendingCarryOverRef.current = null;
    clearTimers();
    clearHighlight();
    const synth = getBrowserSpeechSynthesis();
    if (!synth) return;
    synth.cancel();
    setIsSpeaking(true);
    setIsPaused(false);
    // Warm the voice list (async on some engines); utterance.lang still lets
    // the engine pick a fallback voice before the list loads.
    synth.getVoices();
    speakVisiblePage(session);
  }, [clearHighlight, clearTimers, speakVisiblePage]);

  // Pause is implemented as cancel + remember-the-chunk rather than
  // synth.pause(): pause() is unreliable on several engines (Chrome can stall
  // permanently, some backends ignore it), and a paused engine would also trip
  // the utterance watchdog/timeout machinery. Resuming re-speaks the current
  // sentence from its start, which reads naturally.
  const pauseSpeaking = useCallback(() => {
    if (!wantsSpeechRef.current || isPausedRef.current) return;
    // Invalidate pending utterance callbacks/timers without dropping the
    // remembered chunk position.
    sessionRef.current += 1;
    isPausedRef.current = true;
    activeUtteranceRef.current = null;
    // A paused mid-cut turn shouldn't resume as a natural-finish carry-over
    // once the user relocates or resumes later.
    cutAdvanceRef.current = null;
    pendingCarryOverRef.current = null;
    clearTimers();
    getBrowserSpeechSynthesis()?.cancel();
    // Keep the highlight so the reader can see where speech will resume.
    setIsPaused(true);
  }, [clearTimers]);

  const resumeSpeaking = useCallback(() => {
    if (!wantsSpeechRef.current || !isPausedRef.current) return;
    const session = ++sessionRef.current;
    isPausedRef.current = false;
    timeoutEndingStreakRef.current = 0;
    setIsPaused(false);
    const chunks = currentChunksRef.current;
    const index = currentChunkIndexRef.current;
    speakWhenSynthIdle(session, () => {
      if (chunks && chunks[index]) {
        speakChunk(session, chunks, index);
      } else {
        speakVisiblePage(session);
      }
    });
  }, [speakChunk, speakVisiblePage, speakWhenSynthIdle]);

  const handleRelocated = useCallback(() => {
    if (!wantsSpeechRef.current) return;
    const cutAdvance = cutAdvanceRef.current;
    cutAdvanceRef.current = null;
    const session = ++sessionRef.current;
    clearTimers();
    if (cutAdvance) {
      // Auto page turn at a mid-sentence cut: the tail of the cut sentence
      // is (possibly) still being spoken — keep the utterance and highlight
      // alive across the flip, then resume past the already-spoken text.
      pendingCarryOverRef.current = cutAdvance.carryOver;
      isPausedRef.current = false;
      setIsPaused(false);
      const timeoutId = window.setTimeout(() => {
        speakVisiblePageWhenIdle(session, 0, false);
      }, RESUME_AFTER_RELOCATE_MS);
      timersRef.current.push(timeoutId);
      return;
    }
    // Invalidate in-flight utterances (manual page turns / chapter jumps /
    // reflows) and restart from the freshly visible page. A page change while
    // paused (e.g. overlay rewind/skip) resumes playback on the new page.
    pendingCarryOverRef.current = null;
    isPausedRef.current = false;
    activeUtteranceRef.current = null;
    currentChunksRef.current = null;
    currentChunkIndexRef.current = 0;
    clearHighlight();
    getBrowserSpeechSynthesis()?.cancel();
    setIsPaused(false);
    const timeoutId = window.setTimeout(() => {
      speakVisiblePageWhenIdle(session);
    }, RESUME_AFTER_RELOCATE_MS);
    timersRef.current.push(timeoutId);
  }, [clearHighlight, clearTimers, speakVisiblePageWhenIdle]);

  // Stop speech (and drop highlights) when the reader unmounts / book closes.
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  return {
    isSpeaking,
    isPaused,
    startSpeaking,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    handleRelocated,
  };
}
