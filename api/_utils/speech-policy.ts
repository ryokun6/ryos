/**
 * Ryo ElevenLabs voice policy.
 *
 * Ryo-labeled ElevenLabs voices (PVC, Instant v4, v3, v2, legacy) may only be
 * synthesized for in-OS Ryo chat AI output. `/api/speech` treats the client
 * `source` field as a first gate — it is spoofable and is NOT a signed permit.
 * See the follow-up design in the restricting-Ryo-voices PR.
 */

import { DEFAULT_TTS_MODEL } from "./voice.js";

export const RYO_CHAT_SPEECH_SOURCE = "ryo-chat";

/** Every ElevenLabs voice shipped in Control Panels is a Ryo voice. */
export const RYO_ELEVENLABS_VOICE_IDS = [
  "OHP6tMHkOsRKrsDdbPah",
  "oYLmJyxUFvewUpYziJlr",
  "YC3iw27qriLq7UUaqAyi",
  "kAyjEabBEu68HYYYRAHR",
  "G0mlS0y8ByHjGAOxBgvV",
] as const;

export type SpeechTtsModel = "openai" | "elevenlabs" | null | undefined;

export function isRyoElevenLabsVoiceId(
  voiceId: string | null | undefined
): boolean {
  if (!voiceId) return false;
  return (RYO_ELEVENLABS_VOICE_IDS as readonly string[]).includes(voiceId);
}

export function resolveSpeechTtsModel(
  model: SpeechTtsModel
): "openai" | "elevenlabs" {
  return model || DEFAULT_TTS_MODEL;
}

/**
 * True when this request would synthesize a Ryo ElevenLabs voice — including
 * the Control Panels Default (unset model → ElevenLabs + Ryo PVC) and any
 * explicit ElevenLabs voice_id. Unknown ElevenLabs IDs are also gated: the
 * only ElevenLabs voices we ship are Ryo, and arbitrary IDs must not bypass
 * the chat-only rule.
 */
export function requestResolvesToRyoVoice(
  model: SpeechTtsModel,
  voiceId?: string | null
): boolean {
  if (isRyoElevenLabsVoiceId(voiceId)) return true;
  return resolveSpeechTtsModel(model) === "elevenlabs";
}

export type RyoVoiceGateResult =
  | { allowed: true }
  | {
      allowed: false;
      error: "ryo_voice_forbidden";
      message: string;
    };

export function evaluateRyoVoiceGate(input: {
  model?: SpeechTtsModel;
  voice_id?: string | null;
  source?: string | null;
}): RyoVoiceGateResult {
  if (!requestResolvesToRyoVoice(input.model, input.voice_id)) {
    return { allowed: true };
  }
  if (input.source === RYO_CHAT_SPEECH_SOURCE) {
    return { allowed: true };
  }
  return {
    allowed: false,
    error: "ryo_voice_forbidden",
    message:
      "Ryo ElevenLabs voices are limited to Ryo chat speech. Set source to \"ryo-chat\" or use model \"openai\".",
  };
}
