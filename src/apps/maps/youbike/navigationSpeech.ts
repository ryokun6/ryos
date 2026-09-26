import {
  createSpeechUtterance,
  getBrowserSpeechSynthesis,
  ryOSLocaleToSpeechLanguage,
} from "@/utils/browserSpeech";

/** Drop any in-flight YouBike navigation utterance. */
export function cancelYouBikeNavigationSpeech(): void {
  getBrowserSpeechSynthesis()?.cancel();
}

/**
 * Speak one navigation cue. Cancels the previous utterance so GPS ticks
 * cannot queue a backlog. Call the first time from a user gesture (Start).
 */
export function speakYouBikeNavigation(text: string, locale: string): void {
  const synth = getBrowserSpeechSynthesis();
  const spoken = text.trim();
  if (!synth || !spoken) return;
  synth.cancel();
  synth.resume();
  const utterance = createSpeechUtterance(spoken, {
    lang: ryOSLocaleToSpeechLanguage(locale),
    rate: 1,
    voices: synth.getVoices(),
  });
  synth.speak(utterance);
}
