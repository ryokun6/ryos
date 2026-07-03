/**
 * Shared helpers for the browser's native SpeechSynthesis API (browser TTS).
 * Used by apps that speak locally without the AI `/api/speech` endpoint
 * (Calculator key/result speech, Books read-aloud).
 */

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

export function pickSpeechVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  lang: string
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const target = lang.toLowerCase();
  const exact = voices.find((voice) => voice.lang.toLowerCase() === target);
  if (exact) return exact;

  const targetPrimary = target.split("-")[0];
  const prefixMatches = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(`${targetPrimary}-`)
  );
  if (prefixMatches.length > 0) return prefixMatches[0];

  const primaryMatch = voices.find(
    (voice) => voice.lang.toLowerCase().split("-")[0] === targetPrimary
  );
  return primaryMatch ?? null;
}

/**
 * Resolve the voice for an utterance, honoring the user's preferred browser
 * TTS voice (Control Panels → Sound). The preference only applies when the
 * preferred voice speaks the same primary language as the utterance —
 * otherwise (e.g. an English voice while reading a Japanese book) we fall
 * back to the automatic per-language pick so speech stays intelligible.
 */
export function resolveSpeechVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
  preferredVoiceURI?: string | null
): SpeechSynthesisVoice | null {
  if (preferredVoiceURI) {
    const preferred = voices.find(
      (voice) => voice.voiceURI === preferredVoiceURI
    );
    if (preferred) {
      const targetPrimary = lang.toLowerCase().split("-")[0];
      const voicePrimary = preferred.lang.toLowerCase().split("-")[0];
      if (!targetPrimary || voicePrimary === targetPrimary) {
        return preferred;
      }
    }
  }
  return pickSpeechVoiceForLanguage(voices, lang);
}

export function getBrowserSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}
