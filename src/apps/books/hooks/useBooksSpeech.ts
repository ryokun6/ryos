import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpeechUtterance,
  getBrowserSpeechSynthesis,
} from "@/utils/browserSpeech";
import {
  applySpeechSpokenHighlight,
  applyCarryOverSpokenHits,
  clearSpeechHighlight,
  collectSpeechChunksFromRange,
  getVisiblePageRange,
  isRangeOnVisiblePage,
  applyGeometricPageEndCut,
  estimateMsUntilCharIndex,
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
  /** Restart the previous sentence (or the current one when already first). */
  skipToPreviousSentence: () => void;
  /** Jump to the next sentence (auto-turns at page end while playing). */
  skipToNextSentence: () => void;
  /** Call from the rendition's `relocated` handler. */
  handleRelocated: () => void;
}

/**
 * Read-aloud controller for the Books reader using browser speech synthesis.
 *
 * Speaks the visible page sentence by sentence (dimming unspoken text and
 * revealing spoken characters at full ink), then auto-turns pages. Any
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
  // Ranges on the current page already spoken via a carry-over (kept at full
  // ink while the rest of the page is dimmed).
  const prelitRangesRef = useRef<Range[]>([]);
  // Live spoken-char progress for the in-flight utterance. Survives the
  // session bump on a mid-sentence page flip so the carry-tail highlight can
  // follow real speech (boundary events / estimate timer) instead of a
  // separate linear clock.
  const liveSpeechProgressRef = useRef<{
    text: string;
    chars: number;
  } | null>(null);

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
    prelitRangesRef.current = [];
    liveSpeechProgressRef.current = null;
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
      // A mid-utterance cut advance already turned this page — don't turn
      // again; just wait for its `relocated` event (which resumes speech).
      // If that turn was swallowed, the retry below re-advances.
      // When the cut already moved us onto the last page, canAdvancePage() is
      // false, but we must still wait for `relocated` rather than stop here
      // (stopping would cancel wantsSpeech before resume can run).
      const cutAdvance = cutAdvanceRef.current;
      // Keep spoken hits on the departing page while the cut utterance is
      // still playing; the new page rebuilds its own tokens after relocate.
      if (!cutAdvance) clearHighlight();
      if (
        attempt >= MAX_ADVANCE_ATTEMPTS ||
        (!cutAdvance && !optionsRef.current.canAdvancePage())
      ) {
        stopSpeaking();
        return;
      }
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
    (
      session: number,
      chunk: BooksSpeechChunk,
      spokenChars: number,
      speechStartedAt: number
    ) => {
      if (session !== sessionRef.current) return;
      if (cutAdvanceRef.current) return;
      if (!optionsRef.current.canAdvancePage()) return;
      cutAdvanceRef.current = {
        carryOver: {
          endContainer: chunk.range.endContainer,
          endOffset: chunk.range.endOffset,
          spokenText: chunk.text,
          pageEndCutIndex: chunk.pageEndCutIndex,
          speechStartedAt: speechStartedAt || undefined,
          spokenCharsAtFlip: spokenChars,
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

      highlightedDocRef.current =
        chunk.range.startContainer.ownerDocument ?? null;
      // Dim the page immediately; spoken ink catches up as speech progresses.
      applySpeechSpokenHighlight(chunks, index, 0, prelitRangesRef.current);

      const lang = optionsRef.current.getSpeechLanguage();
      const rate = optionsRef.current.getSpeechRate();
      const utterance = createSpeechUtterance(chunk.text, {
        lang,
        rate,
        voices: synth.getVoices(),
      });
      activeUtteranceRef.current = utterance;

      let settled = false;
      let started = false;
      let idlePolls = 0;
      let cutTimerId: number | undefined;
      let progressTimerId: number | undefined;
      let spokenChars = 0;
      const publishProgress = (charIndex: number) => {
        const next = Math.max(0, Math.min(charIndex, chunk.text.length));
        if (next < spokenChars) return;
        spokenChars = next;
        // Another utterance may already own the live slot (carry finished and
        // the next sentence started) — never clobber it.
        const live = liveSpeechProgressRef.current;
        if (live && live.text !== chunk.text) return;
        liveSpeechProgressRef.current = {
          text: chunk.text,
          chars: spokenChars,
        };
      };
      liveSpeechProgressRef.current = { text: chunk.text, chars: 0 };
      const settle = (ok: boolean, viaTimeout = false) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        window.clearInterval(watchdogId);
        if (cutTimerId !== undefined) window.clearTimeout(cutTimerId);
        if (progressTimerId !== undefined) window.clearInterval(progressTimerId);
        if (activeUtteranceRef.current === utterance) {
          activeUtteranceRef.current = null;
        }
        // Always publish completion so a carry-tail on the next page can catch
        // up, even when this session was invalidated by the page flip.
        publishProgress(chunk.text.length);
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
        // Finish the spoken ink for this sentence before advancing (covers
        // engines that settle via the watchdog without an onend event).
        applySpeechSpokenHighlight(
          chunks,
          index,
          chunk.text.length,
          prelitRangesRef.current
        );
        // Sentence cut off by the page end but no word boundary crossed the
        // cut while speaking (engine without boundary events, or the cut sat
        // at the very end): turn the page now so the next page resumes with
        // the carry-over instead of repeating this sentence.
        if (chunk.pageEndCutIndex !== undefined) {
          advanceAtCut(session, chunk, chunk.text.length, speechStartedAt);
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

      const revealSpoken = (charIndex: number) => {
        if (settled) return;
        publishProgress(charIndex);
        // After a mid-sentence flip the session is bumped so highlights move to
        // the new page's carry-tail; keep publishing progress either way.
        if (session !== sessionRef.current) return;
        applySpeechSpokenHighlight(
          chunks,
          index,
          spokenChars,
          prelitRangesRef.current
        );
      };

      const cutIndex = chunk.pageEndCutIndex;
      let cutTimerArmed = false;
      let progressArmed = false;
      let speechStartedAt = 0;
      const tryAdvanceAtCut = () => {
        if (settled || session !== sessionRef.current) return;
        if (cutIndex === undefined) return;
        advanceAtCut(session, chunk, spokenChars, speechStartedAt);
      };
      const armCutTimer = () => {
        if (
          cutTimerArmed ||
          cutIndex === undefined ||
          cutIndex >= chunk.text.length
        ) {
          return;
        }
        cutTimerArmed = true;
        // Arm from onstart (or the watchdog noticing speech) so engines that
        // delay playback don't fire early, and CJK voices — which rarely emit
        // word-boundary events — still flip at the cutoff.
        cutTimerId = window.setTimeout(
          tryAdvanceAtCut,
          estimateMsUntilCharIndex(cutIndex, chunk.text, rate)
        );
        timersRef.current.push(cutTimerId);
      };
      // Character progress for the spoken-ink highlight. Boundary events are
      // precise when present; a timer estimate covers CJK voices that rarely
      // emit them. Take the max of both.
      const armProgress = () => {
        if (progressArmed) return;
        progressArmed = true;
        speechStartedAt = performance.now();
        armCutTimer();
        const totalMs = estimateMsUntilCharIndex(
          chunk.text.length,
          chunk.text,
          rate
        );
        progressTimerId = window.setInterval(() => {
          if (settled) return;
          if (totalMs <= 0) {
            revealSpoken(chunk.text.length);
            return;
          }
          const elapsed = performance.now() - speechStartedAt;
          const idx = Math.min(
            chunk.text.length,
            Math.floor((elapsed / totalMs) * chunk.text.length)
          );
          revealSpoken(idx);
        }, 40);
        // Keep progress publishing alive across a mid-sentence page flip: the
        // cut-relocate path must not clearTimers() this interval.
        timersRef.current.push(progressTimerId);
      };
      utterance.onstart = () => {
        started = true;
        armProgress();
      };
      utterance.onend = () => {
        revealSpoken(chunk.text.length);
        settle(true);
      };
      utterance.onerror = () => settle(false);
      // Word-boundary events cover Latin engines; the progress timer covers
      // CJK voices that rarely emit boundaries (no spaces between words).
      utterance.onboundary = (event) => {
        const length =
          typeof event.charLength === "number" && event.charLength > 0
            ? event.charLength
            : 1;
        revealSpoken(event.charIndex + length);
        if (cutIndex !== undefined && event.charIndex >= cutIndex) {
          tryAdvanceAtCut();
        }
      };

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
          if (synth.speaking) {
            started = true;
            // Some CJK engines go busy without firing onstart — arm the
            // progress / page-cut timers from the moment audio is running.
            armProgress();
          }
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
    [advanceAtCut, finishPage, stopSpeaking]
  );

  // After a mid-sentence page flip: highlight the second half in sync with
  // the still-playing utterance (never re-speak it), then continue with the
  // un said sentences once the engine goes idle.
  const continueAfterCarryOver = useCallback(
    (
      session: number,
      carryTails: BooksSpeechChunk[],
      kept: BooksSpeechChunk[],
      prelit: Range[],
      carryOver: BooksSpeechCarryOver
    ) => {
      if (session !== sessionRef.current) return;
      prelitRangesRef.current = prelit;

      const lightCarryTailsFully = () => {
        if (carryTails.length === 0) return;
        const last = carryTails[carryTails.length - 1];
        applySpeechSpokenHighlight(
          carryTails,
          carryTails.length - 1,
          last.text.length,
          prelitRangesRef.current
        );
        const nextPrelit = [...prelitRangesRef.current];
        for (const tail of carryTails) {
          if (!tail.range.startContainer.isConnected) continue;
          try {
            nextPrelit.push(tail.range.cloneRange());
          } catch {
            nextPrelit.push(tail.range);
          }
        }
        prelitRangesRef.current = nextPrelit;
      };

      const speakKept = () => {
        if (session !== sessionRef.current) return;
        lightCarryTailsFully();
        if (kept.length === 0) {
          emptyPageStreakRef.current += 1;
          if (emptyPageStreakRef.current > MAX_EMPTY_PAGE_STREAK) {
            stopSpeaking();
            return;
          }
          finishPage(session);
          return;
        }
        emptyPageStreakRef.current = 0;
        speakChunk(session, kept, 0);
      };

      if (carryTails.length === 0) {
        speakKept();
        return;
      }

      const spokenText = carryOver.spokenText.replace(/\s+/g, " ").trim();
      const cut =
        carryOver.pageEndCutIndex !== undefined
          ? carryOver.pageEndCutIndex
          : spokenText.length;
      const totalLen = carryTails.reduce((n, c) => n + c.text.length, 0);
      const minIntoRemainder = Math.max(
        0,
        Math.min(totalLen, (carryOver.spokenCharsAtFlip ?? cut) - cut)
      );

      const revealCarry = (charsIntoRemainder: number) => {
        if (carryTails.length === 0) return;
        let remaining = Math.max(0, charsIntoRemainder);
        let index = 0;
        while (
          index < carryTails.length &&
          remaining >= carryTails[index].text.length
        ) {
          remaining -= carryTails[index].text.length;
          index += 1;
        }
        if (index >= carryTails.length) {
          const last = carryTails[carryTails.length - 1];
          applySpeechSpokenHighlight(
            carryTails,
            carryTails.length - 1,
            last.text.length,
            prelitRangesRef.current
          );
          return;
        }
        applySpeechSpokenHighlight(
          carryTails,
          index,
          remaining,
          prelitRangesRef.current
        );
      };

      // Follow the in-flight utterance's published progress (boundary events
      // and its own estimate timer) — never a separate linear clock.
      const tick = () => {
        if (session !== sessionRef.current) return;
        const live = liveSpeechProgressRef.current;
        if (live && live.text === spokenText) {
          revealCarry(
            Math.max(
              minIntoRemainder,
              Math.min(totalLen, live.chars - cut)
            )
          );
          return;
        }
        revealCarry(minIntoRemainder);
      };

      tick();
      const progressId = window.setInterval(tick, 40);
      timersRef.current.push(progressId);

      const waitIdle = (polls = 0) => {
        if (session !== sessionRef.current) return;
        const synth = getBrowserSpeechSynthesis();
        if (!synth) {
          window.clearInterval(progressId);
          stopSpeaking();
          return;
        }
        if (
          (synth.speaking || synth.pending) &&
          polls < MAX_NATURAL_FINISH_POLLS
        ) {
          const timeoutId = window.setTimeout(
            () => waitIdle(polls + 1),
            ENSURE_IDLE_POLL_MS
          );
          timersRef.current.push(timeoutId);
          return;
        }
        window.clearInterval(progressId);
        speakKept();
      };
      waitIdle();
    },
    [finishPage, speakChunk, stopSpeaking]
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
        // After an auto page turn at a cut-off sentence, never re-speak the
        // already-audible second half: highlight it in sync with the in-flight
        // utterance, then continue with later sentences only.
        if (carryOver) {
          const { kept, prelit, carryTails } = applyCarryOverSpokenHits(
            chunks,
            carryOver
          );
          const lastKept = kept[kept.length - 1];
          if (lastKept) applyGeometricPageEndCut(lastKept);
          continueAfterCarryOver(session, carryTails, kept, prelit, carryOver);
          return;
        }
        prelitRangesRef.current = [];
        // When the cut wasn't detectable from the page range itself (an
        // unresolvable end boundary falls back to the section end), detect it
        // geometrically and mark where the page actually ends *inside* the
        // chunk (not at text.length — that only flipped after the utterance).
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk) applyGeometricPageEndCut(lastChunk);
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
    [continueAfterCarryOver, finishPage, speakChunk, stopSpeaking]
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
    prelitRangesRef.current = [];
    liveSpeechProgressRef.current = null;
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
    liveSpeechProgressRef.current = null;
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

  const applyChunkHighlight = useCallback(
    (chunks: BooksSpeechChunk[], index: number) => {
      const chunk = chunks[index];
      if (!chunk) return;
      highlightedDocRef.current =
        chunk.range.startContainer.ownerDocument ?? null;
      // Seek/pause: light through the end of the selected sentence so the
      // resume point is visible against the dimmed page.
      applySpeechSpokenHighlight(
        chunks,
        index,
        chunk.text.length,
        prelitRangesRef.current
      );
    },
    []
  );

  // Jump to a sentence on the current page. Rewinding the first sentence
  // restarts it; advancing past the last sentence auto-turns while playing
  // so continuous read-aloud isn't stranded at the page end.
  const seekToSentence = useCallback(
    (targetIndex: number) => {
      if (!wantsSpeechRef.current) return;
      const chunks = currentChunksRef.current;
      if (!chunks || chunks.length === 0) return;

      const pastEnd = targetIndex >= chunks.length;
      const clamped = pastEnd ? chunks.length : Math.max(0, targetIndex);

      cutAdvanceRef.current = null;
      pendingCarryOverRef.current = null;
      activeUtteranceRef.current = null;
      const session = ++sessionRef.current;
      clearTimers();
      getBrowserSpeechSynthesis()?.cancel();

      if (pastEnd) {
        // Past the page — keep going if speech is live; stay put if paused.
        if (isPausedRef.current) {
          currentChunkIndexRef.current = chunks.length - 1;
          applyChunkHighlight(chunks, chunks.length - 1);
          return;
        }
        timeoutEndingStreakRef.current = 0;
        finishPage(session);
        return;
      }

      currentChunksRef.current = chunks;
      currentChunkIndexRef.current = clamped;

      if (isPausedRef.current) {
        applyChunkHighlight(chunks, clamped);
        return;
      }

      timeoutEndingStreakRef.current = 0;
      speakWhenSynthIdle(session, () => {
        speakChunk(session, chunks, clamped);
      });
    },
    [
      applyChunkHighlight,
      clearTimers,
      finishPage,
      speakChunk,
      speakWhenSynthIdle,
    ]
  );

  const skipToPreviousSentence = useCallback(() => {
    seekToSentence(currentChunkIndexRef.current - 1);
  }, [seekToSentence]);

  const skipToNextSentence = useCallback(() => {
    seekToSentence(currentChunkIndexRef.current + 1);
  }, [seekToSentence]);

  const handleRelocated = useCallback(() => {
    if (!wantsSpeechRef.current) return;
    const cutAdvance = cutAdvanceRef.current;
    cutAdvanceRef.current = null;
    const session = ++sessionRef.current;
    if (cutAdvance) {
      // Auto page turn at a mid-sentence cut: keep the in-flight utterance's
      // progress publisher (boundary events / estimate timer) alive so the
      // carry-tail highlight follows speech, not a fresh linear clock.
      pendingCarryOverRef.current = cutAdvance.carryOver;
      isPausedRef.current = false;
      setIsPaused(false);
      const timeoutId = window.setTimeout(() => {
        speakVisiblePage(session);
      }, RESUME_AFTER_RELOCATE_MS);
      timersRef.current.push(timeoutId);
      return;
    }
    clearTimers();
    // Invalidate in-flight utterances (manual page turns / chapter jumps /
    // reflows) and restart from the freshly visible page. A page change while
    // paused (e.g. a manual page turn) resumes playback on the new page.
    pendingCarryOverRef.current = null;
    prelitRangesRef.current = [];
    liveSpeechProgressRef.current = null;
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
  }, [clearHighlight, clearTimers, speakVisiblePage, speakVisiblePageWhenIdle]);

  // Stop speech (and drop highlights) when the reader unmounts / book closes.
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  return {
    isSpeaking,
    isPaused,
    startSpeaking,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    skipToPreviousSentence,
    skipToNextSentence,
    handleRelocated,
  };
}
