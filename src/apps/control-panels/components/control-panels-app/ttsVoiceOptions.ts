export const ELEVENLABS_TTS_VOICES = [
  { value: "YC3iw27qriLq7UUaqAyi", labelKey: "apps.control-panels.ttsVoices.ryoV3" },
  { value: "kAyjEabBEu68HYYYRAHR", labelKey: "apps.control-panels.ttsVoices.ryoV2" },
  { value: "G0mlS0y8ByHjGAOxBgvV", labelKey: "apps.control-panels.ttsVoices.ryo" },
] as const;

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
