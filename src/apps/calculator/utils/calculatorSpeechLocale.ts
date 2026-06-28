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
