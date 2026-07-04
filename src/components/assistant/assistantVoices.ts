/**
 * Default browser-TTS voice profiles for the desktop assistant characters.
 *
 * Web Speech voice lists differ per OS/browser, so each persona lists
 * preferred voice names across the common platforms (macOS/iOS system
 * voices, Chrome's "Google …" network voices, Windows' "Microsoft …"
 * voices, Edge's "… Online (Natural)" voices). Resolution is language-gated
 * (see resolveSpeechVoice), so profiles can mix languages: Saeko prefers
 * Kyoko when speaking Japanese and a female English voice otherwise.
 *
 * Pitch/rate apply on every platform and language, so a character keeps its
 * personality even when none of its preferred voices exist on the device.
 * A user-selected voice (Control Panels → Sound) always wins over these.
 */

import type { SpeechVoiceProfile } from "@/utils/browserSpeech";
import type { AssistantCharacterId } from "./characters";

/** Bright standard female voices (macOS, Chrome, Windows, Edge). */
const FEMALE_VOICES = [
  "Samantha", // macOS/iOS en-US default
  "Google US English", // Chrome network (female)
  "Microsoft Aria", // Edge natural / Windows 11
  "Microsoft Jenny",
  "Microsoft Zira", // Windows en-US female
  "Karen", // macOS en-AU
  "Moira", // macOS en-IE
  "Google UK English Female",
  "Microsoft Hazel", // Windows en-GB
] as const;

/** Standard male voices (macOS, Chrome, Windows, Edge). */
const MALE_VOICES = [
  "Alex", // macOS en-US (when installed)
  "Aaron", // macOS/iOS en-US
  "Microsoft Guy", // Edge natural
  "Microsoft Andrew",
  "Microsoft David", // Windows en-US male
  "Microsoft Mark",
  "Google UK English Male",
  "Daniel", // macOS en-GB
  "Rishi", // macOS en-IN
] as const;

/** Deeper, statelier male voices — UK/authoritative first. */
const DEEP_MALE_VOICES = [
  "Daniel", // macOS en-GB
  "Google UK English Male",
  "Microsoft Ryan", // Edge natural en-GB
  "Microsoft George", // Windows en-GB
  "Microsoft Guy",
  "Microsoft David",
  "Alex",
  "Aaron",
] as const;

/** Japanese voices first (Saeko Sensei), female English fallbacks after. */
const JAPANESE_FEMALE_VOICES = [
  "Kyoko", // macOS/iOS ja-JP
  "Google 日本語", // Chrome network ja-JP
  "Microsoft Nanami", // Edge natural ja-JP
  "Microsoft Haruka", // Windows ja-JP
  "Microsoft Ayumi",
  ...FEMALE_VOICES,
] as const;

/** Chinese voices first (Monkey King), male English fallbacks after. */
const CHINESE_VOICES = [
  "Ting-Ting", // macOS zh-CN (also listed as "Tingting")
  "Tingting",
  "Mei-Jia", // macOS zh-TW (also "Meijia")
  "Meijia",
  "Google 普通话", // Chrome network zh-CN
  "Google 國語", // Chrome network zh-TW
  "Microsoft Xiaoxiao", // Edge natural zh-CN
  "Microsoft Huihui", // Windows zh-CN
  "Microsoft Hanhan", // Windows zh-TW
  ...MALE_VOICES,
] as const;

/**
 * Persona voice defaults per assistant character. Pitch/rate keep each
 * character distinct even on devices where only one voice exists.
 */
const ASSISTANT_VOICE_PROFILES: Record<AssistantCharacterId, SpeechVoiceProfile> = {
  // Chipper, springy paperclip.
  clippy: { preferredVoiceNames: MALE_VOICES, pitch: 1.2, rate: 1.05 },
  // Playful cat — light and quick.
  links: { preferredVoiceNames: FEMALE_VOICES, pitch: 1.4, rate: 1.05 },
  // Friendly dog — warm, a touch bright.
  rover: { preferredVoiceNames: MALE_VOICES, pitch: 1.15 },
  // Old wizard — deep and unhurried.
  merlin: { preferredVoiceNames: DEEP_MALE_VOICES, pitch: 0.8, rate: 0.95 },
  // Smooth, theatrical genie.
  genie: { preferredVoiceNames: DEEP_MALE_VOICES, pitch: 0.85 },
  // Squawky parrot — high and fast.
  peedy: { preferredVoiceNames: FEMALE_VOICES, pitch: 1.5, rate: 1.1 },
  // The professor — measured, slightly low.
  genius: { preferredVoiceNames: MALE_VOICES, pitch: 0.9, rate: 0.95 },
  // Gruff dog.
  rocky: { preferredVoiceNames: MALE_VOICES, pitch: 0.7, rate: 0.95 },
  // Robot — flat and low.
  f1: { preferredVoiceNames: MALE_VOICES, pitch: 0.5 },
  // Neutral narrator.
  officelogo: { preferredVoiceNames: FEMALE_VOICES },
  // Japanese teacher — Kyoko/Nanami when speaking Japanese.
  saeko: { preferredVoiceNames: JAPANESE_FEMALE_VOICES, pitch: 1.1 },
  // Energetic Monkey King — Chinese voices when speaking Chinese.
  monkeyking: { preferredVoiceNames: CHINESE_VOICES, pitch: 1.25, rate: 1.1 },
};

const DEFAULT_PROFILE: SpeechVoiceProfile = {
  preferredVoiceNames: MALE_VOICES,
};

/** Voice profile for an assistant character (default profile when unknown). */
export function getAssistantVoiceProfile(
  characterId: string | null | undefined
): SpeechVoiceProfile {
  return (
    ASSISTANT_VOICE_PROFILES[characterId as AssistantCharacterId] ??
    DEFAULT_PROFILE
  );
}
