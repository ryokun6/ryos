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
  if (texts.length === 0) return;

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
  getBrowserSpeechSynthesis()?.cancel();
}

/** Test helper: reset module state between tests. */
export function __resetAssistantSpeechStateForTests(): void {
  generation++;
  voicesWarmed = false;
}
