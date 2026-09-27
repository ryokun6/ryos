/** All shipped ElevenLabs voices are Ryo. Non-chat features must not use them. */
export const ELEVENLABS_TTS_VOICES = [
  { value: "OHP6tMHkOsRKrsDdbPah", labelKey: "apps.control-panels.ttsVoices.ryoPvc" },
  { value: "oYLmJyxUFvewUpYziJlr", labelKey: "apps.control-panels.ttsVoices.ryoInstantV4" },
  { value: "YC3iw27qriLq7UUaqAyi", labelKey: "apps.control-panels.ttsVoices.ryoV3" },
  { value: "kAyjEabBEu68HYYYRAHR", labelKey: "apps.control-panels.ttsVoices.ryoV2" },
  { value: "G0mlS0y8ByHjGAOxBgvV", labelKey: "apps.control-panels.ttsVoices.ryo" },
] as const;

export const RYO_PVC_VOICE_ID = ELEVENLABS_TTS_VOICES[0].value;

/**
 * PVC encodes hotter than other ElevenLabs Ryo voices and clips at the shared
 * default speechVolume (2). Applied only at playback (`useTtsQueue` gain) so
 * saved speech/master volume prefs are unchanged. 0.6 ≈ −4.4 dB; default
 * slider 2 → effective gain 1.2 instead of 2.
 */
export const RYO_PVC_PLAYBACK_GAIN = 0.6;

export function getTtsPlaybackGain(
  model: "openai" | "elevenlabs" | null,
  voiceId: string | null
): number {
  if (model === "openai") return 1;
  const resolvedVoice = voiceId ?? RYO_PVC_VOICE_ID;
  return resolvedVoice === RYO_PVC_VOICE_ID ? RYO_PVC_PLAYBACK_GAIN : 1;
}

export function getSpeechPlaybackVolume(
  speechVolume: number,
  masterVolume: number,
  model: "openai" | "elevenlabs" | null,
  voiceId: string | null
): number {
  return speechVolume * masterVolume * getTtsPlaybackGain(model, voiceId);
}

export const OPENAI_TTS_VOICES = [
  { value: "alloy", labelKey: "apps.control-panels.ttsVoices.alloy" },
  { value: "echo", labelKey: "apps.control-panels.ttsVoices.echo" },
  { value: "fable", labelKey: "apps.control-panels.ttsVoices.fable" },
  { value: "onyx", labelKey: "apps.control-panels.ttsVoices.onyx" },
  { value: "nova", labelKey: "apps.control-panels.ttsVoices.nova" },
  { value: "shimmer", labelKey: "apps.control-panels.ttsVoices.shimmer" },
] as const;

export function getTtsVoiceLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  model: "openai" | "elevenlabs",
  voiceId: string | null,
  selectLabel: string
): string {
  if (!voiceId) return selectLabel;
  const voices =
    model === "elevenlabs" ? ELEVENLABS_TTS_VOICES : OPENAI_TTS_VOICES;
  const match = voices.find((voice) => voice.value === voiceId);
  return match ? t(match.labelKey) : selectLabel;
}
