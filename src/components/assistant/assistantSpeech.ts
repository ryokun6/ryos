/**
 * Browser TTS for the floating desktop assistant, built on the native
 * SpeechSynthesis API (no AI `/api/speech` endpoint). Replies are cleaned of
 * markdown/URLs/code and split into sentence-sized utterances (long
 * utterances stall on Chrome), then spoken sequentially. A new reply always
 * replaces whatever is still being spoken.
 */

import {
  getBrowserSpeechSynthesis,
  resolveSpeechVoice,
  ryOSLocaleToSpeechLanguage,
} from "@/utils/browserSpeech";
import { cleanTextForSpeech } from "@/apps/chats/utils/textForSpeech";
import { splitTextIntoSpeechSegments } from "@/apps/books/utils/booksSpeech";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";

/** Safety net for engines that never fire `end`/`error` on an utterance. */
export const ASSISTANT_SPEECH_UTTERANCE_TIMEOUT_MS = 30_000;

/**
 * Clean an assistant reply and split it into speakable utterance texts.
 * Returns an empty array when nothing remains to speak (e.g. the reply was
 * only a code block or a bare link).
 */
export function prepareAssistantSpeechTexts(text: string): string[] {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return [];
  return splitTextIntoSpeechSegments(cleaned)
    .map((segment) =>
      cleaned.slice(segment.start, segment.end).replace(/\s+/g, " ").trim()
    )
    .filter(Boolean);
}

// Bumping the generation invalidates any in-flight utterance chain, so a new
// reply (or a stop) never lets stale `onend` handlers keep speaking.
let generation = 0;
let voicesWarmed = false;
/**
 * True once an utterance has actually started playing, which proves the
 * engine accepted a `speak()` (on iOS Safari that only happens after a call
 * made inside a user gesture). Until then every gesture retries the unlock:
 * iOS grants user activation to `touchend`/`keydown` but not `pointerdown`,
 * so the first attempt of a tap can fail while a later one succeeds.
 */
let synthesisUnlocked = false;
/**
 * The most recent reply handed to `speakAssistantText` that has not audibly
 * started. On iOS Safari a `speak()` outside a user gesture is silently
 * dropped (no events, no error); the next gesture re-speaks this reply so
 * the user actually hears it in addition to unlocking synthesis.
 */
let droppedSpeech: { text: string; options?: AssistantSpeechOptions } | null =
  null;

/** Warm the async voice list (Chrome loads it lazily). Never blocks speech. */
function warmVoices(synth: SpeechSynthesis) {
  if (voicesWarmed) return;
  voicesWarmed = true;
  synth.addEventListener("voiceschanged", () => synth.getVoices());
  synth.getVoices();
}

export interface AssistantSpeechOptions {
  /** ryOS i18n locale (e.g. "zh-TW"); maps to the utterance language. */
  locale?: string;
}

/**
 * Unlock speech synthesis from inside a user gesture. iOS Safari (and some
 * other engines) ignore `speechSynthesis.speak()` until the page's first
 * `speak()` happens inside a gesture handler. When Speech was enabled in a
 * previous session, replies finish asynchronously — outside any gesture — so
 * without priming they are silently dropped.
 *
 * Call this from gesture handlers (tapping the assistant, submitting a
 * message, any pointer/key gesture). If the latest reply was dropped it is
 * re-spoken inside the gesture (which both unlocks synthesis and finally
 * makes the reply audible); otherwise a muted utterance unlocks silently.
 * Attempts keep retrying on subsequent gestures until an utterance verifiably
 * starts — iOS silently drops blocked `speak()` calls with no event or error,
 * so a single fire-and-forget attempt can latch a failed unlock forever.
 */
export function primeAssistantSpeech(): void {
  const synth = getBrowserSpeechSynthesis();
  if (!synth) return;
  if (synthesisUnlocked && !droppedSpeech) return;

  warmVoices(synth);
  synth.resume();

  // Audible speech proves synthesis is unlocked, and a reply dropped earlier
  // is stale once something else is speaking — never barge in over it.
  if (synth.speaking) {
    synthesisUnlocked = true;
    droppedSpeech = null;
    return;
  }

  // Re-speak the dropped reply inside this gesture. speakAssistantText
  // cancels first, which also clears any utterances stuck in the queue from
  // the blocked attempt.
  if (droppedSpeech) {
    const { text, options } = droppedSpeech;
    speakAssistantText(text, options);
    return;
  }

  // A queued-but-not-started utterance either belongs to another feature
  // (never clobber it, and don't pile on) or is about to start; retry on the
  // next gesture instead.
  if (synth.pending) return;

  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  utterance.onstart = () => {
    synthesisUnlocked = true;
  };
  synth.speak(utterance);
}

/**
 * Speak an assistant reply, replacing any speech still in progress.
 * The first utterance is spoken synchronously so calls made inside a user
 * gesture (e.g. toggling Speech on) unlock synthesis on iOS Safari.
 */
export function speakAssistantText(
  text: string,
  options?: AssistantSpeechOptions
): void {
  const synth = getBrowserSpeechSynthesis();
  if (!synth) return;

  const currentGeneration = ++generation;
  synth.cancel();

  const texts = prepareAssistantSpeechTexts(text);
  if (texts.length === 0) {
    droppedSpeech = null;
    return;
  }

  // Until an utterance verifiably starts, assume this reply may have been
  // dropped (iOS Safari blocks out-of-gesture speak() calls silently) so the
  // next user gesture can re-speak it via primeAssistantSpeech.
  droppedSpeech = { text, options };

  warmVoices(synth);
  synth.resume();

  const lang = ryOSLocaleToSpeechLanguage(options?.locale);

  const speakAt = (index: number) => {
    if (currentGeneration !== generation || index >= texts.length) return;

    const utterance = new SpeechSynthesisUtterance(texts[index]);
    utterance.lang = lang;
    const voice = resolveSpeechVoice(
      synth.getVoices(),
      lang,
      useAudioSettingsStore.getState().browserTtsVoiceURI
    );
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      // An audible start proves the engine accepted the speak() (i.e.
      // synthesis is unlocked) and that this reply was not dropped.
      synthesisUnlocked = true;
      if (currentGeneration === generation) droppedSpeech = null;
    };

    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      window.clearTimeout(timeoutId);
      speakAt(index + 1);
    };
    utterance.onend = advance;
    utterance.onerror = advance;
    const timeoutId = window.setTimeout(
      advance,
      ASSISTANT_SPEECH_UTTERANCE_TIMEOUT_MS
    );

    synth.speak(utterance);
  };

  speakAt(0);
}

/** Stop assistant speech and drop any queued utterances. */
export function stopAssistantSpeech(): void {
  generation++;
  droppedSpeech = null;
  getBrowserSpeechSynthesis()?.cancel();
}

/** Test helper: reset module state between tests. */
export function __resetAssistantSpeechStateForTests(): void {
  generation++;
  voicesWarmed = false;
  synthesisUnlocked = false;
  droppedSpeech = null;
}
