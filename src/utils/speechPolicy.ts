/**
 * Client-side Ryo ElevenLabs voice policy.
 *
 * Mirrors `api/_utils/speech-policy.ts`. Keep the voice-id list and gate
 * rules in sync — `tests/unit/speech/test-speech-policy.test.ts` asserts it.
 *
 * `source: "ryo-chat"` is a first-layer gate. Ryo ElevenLabs synthesis also
 * requires a server-issued speech permit bound to chat assistant text.
 */

import { ELEVENLABS_TTS_VOICES } from "@/apps/control-panels/components/control-panels-app/ttsVoiceOptions";

export const RYO_CHAT_SPEECH_SOURCE = "ryo-chat" as const;

export type SpeechSource = typeof RYO_CHAT_SPEECH_SOURCE | (string & {});

export type SpeechTtsModel = "openai" | "elevenlabs" | null | undefined;

export const RYO_ELEVENLABS_VOICE_IDS = ELEVENLABS_TTS_VOICES.map(
  (voice) => voice.value
);

export function isRyoElevenLabsVoiceId(
  voiceId: string | null | undefined
): boolean {
  if (!voiceId) return false;
  return (RYO_ELEVENLABS_VOICE_IDS as readonly string[]).includes(voiceId);
}

/** Unset Control Panels Default resolves to ElevenLabs + Ryo PVC on the server. */
export function resolveSpeechTtsModel(
  model: SpeechTtsModel
): "openai" | "elevenlabs" {
  return model || "elevenlabs";
}

export function requestResolvesToRyoVoice(
  model: SpeechTtsModel,
  voiceId?: string | null
): boolean {
  if (isRyoElevenLabsVoiceId(voiceId)) return true;
  return resolveSpeechTtsModel(model) === "elevenlabs";
}

export type SpeechApiRequestBody = {
  text: string;
  source: string;
  model?: "openai" | "elevenlabs" | null;
  voice?: string | null;
  voice_id?: string | null;
  permitId?: string;
  contentHash?: string;
};

export type SpeechApiRequestBuild =
  | SpeechApiRequestBody
  | { error: "ryo_voice_forbidden" };

/**
 * Build a `/api/speech` body. Refuses Ryo / default-ElevenLabs voices unless
 * `source` is `ryo-chat` so Control Panels Default cannot leak Ryo's voice
 * through Maps, TextEdit, or other free-form speak paths.
 */
export function buildSpeechApiRequestBody(input: {
  text: string;
  source: string;
  ttsModel: SpeechTtsModel;
  ttsVoice: string | null;
  permitId?: string;
  contentHash?: string;
}): SpeechApiRequestBuild {
  if (requestResolvesToRyoVoice(input.ttsModel, input.ttsVoice)) {
    if (input.source !== RYO_CHAT_SPEECH_SOURCE) {
      return { error: "ryo_voice_forbidden" };
    }
  }

  const body: SpeechApiRequestBody = {
    text: input.text,
    source: input.source,
    model: input.ttsModel ?? null,
  };

  if (input.ttsModel === "elevenlabs") {
    body.voice_id = input.ttsVoice;
  } else if (input.ttsModel === "openai") {
    body.voice = input.ttsVoice;
  }
  if (input.permitId) {
    body.permitId = input.permitId;
  }
  if (input.contentHash) {
    body.contentHash = input.contentHash;
  }

  return body;
}
