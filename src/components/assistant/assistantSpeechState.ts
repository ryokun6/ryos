/**
 * Shared "assistant TTS is speaking" flag, kept in its own module so the
 * sound-effect player can read it without importing the speech module
 * (assistantSpeech → assistantSounds would otherwise be a cycle).
 *
 * While speech is active the character's animation sound effects are
 * suppressed: starting an HTMLAudioElement mid-utterance interrupts the
 * speech-synthesis audio session on several engines (iOS/macOS Safari,
 * Chromium ducking), audibly cutting the reply off.
 */

let speechActive = false;

export function isAssistantSpeechActive(): boolean {
  return speechActive;
}

export function setAssistantSpeechActive(active: boolean): void {
  speechActive = active;
}
