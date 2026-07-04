/**
 * Shared helpers for the browser's native SpeechSynthesis API (browser TTS).
 *
 * This is the single home for web-speech voice selection and utterance
 * configuration, used by every feature that speaks locally without the AI
 * `/api/speech` endpoint: the desktop assistant, Calculator key/result
 * speech, and Books read-aloud (page speech + Ask Ryo replies).
 *
 * Voice resolution priority (see {@link resolveSpeechVoice}):
 *   1. the user's preferred voice from Control Panels → Sound (language-gated)
 *   2. the caller's voice profile (e.g. an assistant character's default
 *      voices), tried in order and language-gated
 *   3. an automatic quality-ranked pick for the utterance language
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";

/** Map ryOS i18n codes to BCP 47 tags for SpeechSynthesisUtterance.lang */
export function ryOSLocaleToSpeechLanguage(locale: string | undefined): string {
  if (!locale) return "en-US";

  const lower = locale.toLowerCase();

  if (lower === "zh-tw" || lower.startsWith("zh-tw") || lower === "zh-hant") {
    return "zh-TW";
  }
  if (lower.startsWith("zh-cn") || lower === "zh-hans") {
    return "zh-CN";
  }
  if (lower.startsWith("zh")) {
    return "zh-TW";
  }
  if (lower.startsWith("en-gb")) return "en-GB";
  if (lower.startsWith("en")) return "en-US";
  if (lower.startsWith("pt-br")) return "pt-BR";
  if (lower.startsWith("pt")) return "pt-PT";

  const primary = lower.split("-")[0] ?? "en";
  const withRegion: Record<string, string> = {
    ja: "ja-JP",
    ko: "ko-KR",
    fr: "fr-FR",
    de: "de-DE",
    es: "es-ES",
    it: "it-IT",
    ru: "ru-RU",
  };

  return withRegion[primary] ?? primary;
}

/**
 * Persona defaults for browser TTS (e.g. an assistant character). Voice
 * names are tried in order against the voices available on this device and
 * only apply when they speak the utterance's language; pitch/rate always
 * apply.
 */
export interface SpeechVoiceProfile {
  /**
   * Ordered, case-insensitive substrings matched against voice names
   * (e.g. "Daniel" matches "Daniel (English (United Kingdom))"). List names
   * across platforms and languages — resolution is language-gated, so a
   * profile can mix "Samantha" (en), "Kyoko" (ja) and "Microsoft Zira" (en).
   */
  preferredVoiceNames?: readonly string[];
  /** Utterance pitch (0–2, engine default 1). */
  pitch?: number;
  /** Utterance rate (engine default 1); callers may override per feature. */
  rate?: number;
}

/**
 * macOS/iOS novelty and effect voices (plus the low-quality Eloquence pack)
 * that speak in sound effects or robot-like tones. They dominate Apple's
 * ~100+ entry voice list, so the automatic pick ranks them last. A profile
 * or the user can still select them explicitly.
 */
const NOVELTY_VOICE_NAMES = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "jester",
  "junior",
  "kathy",
  "organ",
  "pipe organ",
  "princess",
  "ralph",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  // Eloquence pack (shipped on recent macOS/iOS; robotic, low quality).
  "eddy",
  "flo",
  "grandma",
  "grandpa",
  "reed",
  "rocko",
  "sandy",
  "shelley",
  "fred",
]);

/**
 * Well-known good Apple system voices (macOS/iOS expose them to Safari and
 * Chrome). Windows needs no equivalent list: every "Microsoft …" voice is a
 * standard voice and is ranked by prefix instead.
 */
const KNOWN_GOOD_APPLE_VOICE_NAMES = new Set([
  // English
  "samantha",
  "alex",
  "aaron",
  "daniel",
  "karen",
  "moira",
  "rishi",
  "tessa",
  "fiona",
  "arthur",
  "martha",
  // Japanese / Chinese / Korean
  "kyoko",
  "otoya",
  "hattori",
  "ting-ting",
  "tingting",
  "mei-jia",
  "meijia",
  "sin-ji",
  "sinji",
  "yuna",
  // European languages
  "thomas",
  "amelie",
  "amélie",
  "audrey",
  "anna",
  "petra",
  "markus",
  "monica",
  "mónica",
  "paulina",
  "alice",
  "federica",
  "luciana",
  "joana",
  "milena",
  "zosia",
  "ellen",
  "xander",
]);

/** Voice name up to the first parenthesis/dash qualifier, lowercased —
 * "Samantha (Enhanced)" and "Microsoft David - English (United States)"
 * become "samantha" and "microsoft david". */
function voiceBaseName(name: string): string {
  return name.split("(")[0].split(" - ")[0].trim().toLowerCase();
}

/**
 * Rank a voice for the automatic per-language pick. Higher is better;
 * novelty voices rank below everything else.
 */
export function scoreSpeechVoiceQuality(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const base = voiceBaseName(voice.name);
  if (NOVELTY_VOICE_NAMES.has(base)) return -1;

  let score = 0;
  if (name.includes("natural")) {
    // Edge's "Microsoft … Online (Natural)" neural voices.
    score += 8;
  } else if (name.startsWith("microsoft")) {
    // Windows standard voices (David, Zira, Mark, Haruka, …).
    score += 6;
  }
  if (KNOWN_GOOD_APPLE_VOICE_NAMES.has(base)) score += 6;
  if (name.startsWith("google")) score += 5; // Chrome network voices.
  if (/enhanced|premium/.test(name)) score += 2;
  if (voice.default) score += 1;
  return score;
}

function pickBestVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const score = scoreSpeechVoiceQuality(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Automatic voice pick for a language: exact region match beats other
 * regions of the same language; within a tier the highest quality-ranked
 * voice wins (avoiding macOS novelty voices, preferring platform defaults
 * like Samantha, Microsoft David/Zira, Google US English, and Edge's
 * Natural voices).
 */
export function pickSpeechVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  lang: string
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const target = lang.toLowerCase();
  const exact = voices.filter((voice) => voice.lang.toLowerCase() === target);
  if (exact.length > 0) return pickBestVoice(exact);

  const targetPrimary = target.split("-")[0];
  const prefixMatches = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(`${targetPrimary}-`)
  );
  if (prefixMatches.length > 0) return pickBestVoice(prefixMatches);

  const primaryMatches = voices.filter(
    (voice) => voice.lang.toLowerCase().split("-")[0] === targetPrimary
  );
  return primaryMatches.length > 0 ? pickBestVoice(primaryMatches) : null;
}

/**
 * First voice matching one of the preferred names (in preference order)
 * that speaks the target language. Names are case-insensitive substrings of
 * the voice name, so "Daniel" matches "Daniel (English (United Kingdom))".
 */
export function pickSpeechVoiceByName(
  voices: SpeechSynthesisVoice[],
  lang: string,
  preferredNames: readonly string[]
): SpeechSynthesisVoice | null {
  const targetPrimary = lang.toLowerCase().split("-")[0];
  const candidates = targetPrimary
    ? voices.filter(
        (voice) => voice.lang.toLowerCase().split("-")[0] === targetPrimary
      )
    : voices;
  for (const preferred of preferredNames) {
    const needle = preferred.toLowerCase();
    const match = candidates.find((voice) =>
      voice.name.toLowerCase().includes(needle)
    );
    if (match) return match;
  }
  return null;
}

/**
 * Resolve the voice for an utterance:
 *   1. the user's preferred browser TTS voice (Control Panels → Sound),
 *   2. the caller's preferred voice names (e.g. an assistant character's
 *      default voices),
 *   3. the automatic quality-ranked per-language pick.
 *
 * Every step is language-gated: a preference only applies when the voice
 * speaks the same primary language as the utterance — otherwise (e.g. an
 * English voice while reading a Japanese book) we fall back so speech stays
 * intelligible.
 */
export function resolveSpeechVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
  preferredVoiceURI?: string | null,
  preferredVoiceNames?: readonly string[]
): SpeechSynthesisVoice | null {
  const targetPrimary = lang.toLowerCase().split("-")[0];
  if (preferredVoiceURI) {
    const preferred = voices.find(
      (voice) => voice.voiceURI === preferredVoiceURI
    );
    if (preferred) {
      const voicePrimary = preferred.lang.toLowerCase().split("-")[0];
      if (!targetPrimary || voicePrimary === targetPrimary) {
        return preferred;
      }
    }
  }
  if (preferredVoiceNames && preferredVoiceNames.length > 0) {
    const named = pickSpeechVoiceByName(voices, lang, preferredVoiceNames);
    if (named) return named;
  }
  return pickSpeechVoiceForLanguage(voices, lang);
}

export function getBrowserSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

export interface CreateSpeechUtteranceOptions {
  /** BCP 47 utterance language (see {@link ryOSLocaleToSpeechLanguage}). */
  lang: string;
  /** Feature rate override (e.g. Books speech rate); beats the profile rate. */
  rate?: number;
  /** Persona defaults (voice names, pitch, rate). */
  profile?: SpeechVoiceProfile;
  /**
   * Voice list to resolve against. Defaults to the live synthesis voice
   * list; pass explicitly when the caller already holds a synth reference.
   */
  voices?: SpeechSynthesisVoice[];
}

/**
 * Unified browser-TTS utterance factory: sets the language, resolves the
 * voice (user setting → profile preference → automatic pick) and applies
 * profile pitch/rate. All web-speech features create utterances here so
 * voice/settings handling stays consistent.
 */
export function createSpeechUtterance(
  text: string,
  options: CreateSpeechUtteranceOptions
): SpeechSynthesisUtterance {
  const { lang, profile } = options;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  const rate = options.rate ?? profile?.rate;
  if (rate !== undefined) utterance.rate = rate;
  if (profile?.pitch !== undefined) utterance.pitch = profile.pitch;

  const voices =
    options.voices ?? getBrowserSpeechSynthesis()?.getVoices() ?? [];
  const voice = resolveSpeechVoice(
    voices,
    lang,
    useAudioSettingsStore.getState().browserTtsVoiceURI,
    profile?.preferredVoiceNames
  );
  if (voice) utterance.voice = voice;

  return utterance;
}
