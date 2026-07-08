import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  enqueueCalculatorSpeech,
  formatDisplayForSpeech,
  formatKeyLabel,
  createCalculatorSpeechQueue,
  speakCalculatorText,
  __resetCalculatorSpeechStateForTests,
} from "../../../src/apps/calculator/utils/calculatorSpeech";
import {
  pickSpeechVoiceForLanguage,
  resolveSpeechVoice,
  ryOSLocaleToSpeechLanguage,
} from "../../../src/utils/browserSpeech";
import { useAudioSettingsStore } from "../../../src/stores/useAudioSettingsStore";

const enSpeech: Record<string, string> = {
  "apps.calculator.speech.error": "Error",
  "apps.calculator.speech.negative": "negative {{value}}",
  "apps.calculator.speech.scientific":
    "{{mantissa}} times 10 to the {{exponent}}",
  "apps.calculator.speech.keys.plus": "plus",
  "apps.calculator.speech.keys.minus": "minus",
  "apps.calculator.speech.keys.times": "times",
  "apps.calculator.speech.keys.divide": "divided by",
  "apps.calculator.speech.keys.clearEntry": "clear entry",
};

function t(key: string, options?: Record<string, string>): string {
  const template = enSpeech[key] ?? key;
  if (!options) return template;
  return Object.entries(options).reduce(
    (result, [name, value]) => result.replace(`{{${name}}}`, value),
    template
  );
}

describe("calculatorSpeechLocale", () => {
  test("ryOSLocaleToSpeechLanguage maps supported ryOS locales", () => {
    expect(ryOSLocaleToSpeechLanguage("en")).toBe("en-US");
    expect(ryOSLocaleToSpeechLanguage("zh-CN")).toBe("zh-CN");
    expect(ryOSLocaleToSpeechLanguage("zh-TW")).toBe("zh-TW");
    expect(ryOSLocaleToSpeechLanguage("ja")).toBe("ja-JP");
    expect(ryOSLocaleToSpeechLanguage("pt")).toBe("pt-PT");
  });

  test("pickSpeechVoiceForLanguage prefers exact and prefix matches", () => {
    const voices = [
      { lang: "en-US", name: "English US" },
      { lang: "en-GB", name: "English UK" },
      { lang: "fr-FR", name: "French" },
    ] as SpeechSynthesisVoice[];

    expect(pickSpeechVoiceForLanguage(voices, "en-US")?.name).toBe("English US");
    expect(pickSpeechVoiceForLanguage(voices, "en-AU")?.name).toBe("English US");
    expect(pickSpeechVoiceForLanguage(voices, "fr-CA")?.name).toBe("French");
  });

  test("resolveSpeechVoice honors the preferred voice when languages match", () => {
    const voices = [
      { voiceURI: "us", lang: "en-US", name: "English US" },
      { voiceURI: "uk", lang: "en-GB", name: "English UK" },
      { voiceURI: "fr", lang: "fr-FR", name: "French" },
    ] as SpeechSynthesisVoice[];

    expect(resolveSpeechVoice(voices, "en-US", "uk")?.name).toBe("English UK");
  });

  test("resolveSpeechVoice falls back to auto pick when preferred voice speaks another language", () => {
    const voices = [
      { voiceURI: "us", lang: "en-US", name: "English US" },
      { voiceURI: "fr", lang: "fr-FR", name: "French" },
    ] as SpeechSynthesisVoice[];

    expect(resolveSpeechVoice(voices, "fr-FR", "us")?.name).toBe("French");
  });

  test("resolveSpeechVoice falls back to auto pick when preferred voice is unavailable", () => {
    const voices = [
      { voiceURI: "us", lang: "en-US", name: "English US" },
    ] as SpeechSynthesisVoice[];

    expect(resolveSpeechVoice(voices, "en-US", "missing")?.name).toBe(
      "English US"
    );
    expect(resolveSpeechVoice(voices, "en-US", null)?.name).toBe("English US");
  });
});

describe("calculatorSpeech", () => {
  test("formatKeyLabel uses localized operator labels", () => {
    expect(formatKeyLabel("×", t)).toBe("times");
    expect(formatKeyLabel("÷", t)).toBe("divided by");
    expect(formatKeyLabel("CE", t)).toBe("clear entry");
  });

  test("formatKeyLabel passes through digits", () => {
    expect(formatKeyLabel("7", t)).toBe("7");
  });

  test("formatDisplayForSpeech handles negatives and errors", () => {
    expect(formatDisplayForSpeech("-42", t)).toBe("negative 42");
    expect(formatDisplayForSpeech("Error", t)).toBe("Error");
  });

  test("formatDisplayForSpeech handles scientific notation", () => {
    expect(formatDisplayForSpeech("1.5e10", t)).toBe(
      "1.5 times 10 to the 10"
    );
  });

  test("enqueueCalculatorSpeech stores text and language", () => {
    const queue = enqueueCalculatorSpeech(createCalculatorSpeechQueue(), {
      text: "plus",
      lang: "ja-JP",
    });
    expect(queue.items).toEqual([{ text: "plus", lang: "ja-JP" }]);
  });

  test("enqueueCalculatorSpeech dedupes consecutive identical result utterances", () => {
    let queue = enqueueCalculatorSpeech(createCalculatorSpeechQueue(), {
      text: "42",
      lang: "en-US",
    });
    queue = enqueueCalculatorSpeech(
      queue,
      { text: "42", lang: "en-US" },
      { dedupeConsecutive: true }
    );
    expect(queue.items).toEqual([{ text: "42", lang: "en-US" }]);
  });

  test("enqueueCalculatorSpeech allows repeated key presses", () => {
    let queue = enqueueCalculatorSpeech(createCalculatorSpeechQueue(), {
      text: "7",
      lang: "en-US",
    });
    queue = enqueueCalculatorSpeech(queue, { text: "7", lang: "en-US" });
    expect(queue.items).toHaveLength(2);
  });
});

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe("calculatorSpeech synchronous playback (mobile Safari)", () => {
  const g = globalThis as Record<string, unknown>;
  const originalWindow = g.window;
  const originalUtterance = g.SpeechSynthesisUtterance;
  let spoken: FakeUtterance[];
  let fakeVoices: SpeechSynthesisVoice[];

  beforeEach(() => {
    spoken = [];
    fakeVoices = [];
    const synth = {
      speak: (u: FakeUtterance) => {
        spoken.push(u);
      },
      cancel: () => {},
      resume: () => {},
      getVoices: () => fakeVoices,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    g.window = globalThis;
    g.speechSynthesis = synth;
    g.SpeechSynthesisUtterance = FakeUtterance;
    __resetCalculatorSpeechStateForTests();
  });

  afterEach(() => {
    // Flush any pending utterance timeout timers via onend before teardown.
    spoken.forEach((u) => u.onend?.());
    __resetCalculatorSpeechStateForTests();
    useAudioSettingsStore.setState({ browserTtsVoiceURI: null });
    g.window = originalWindow;
    g.SpeechSynthesisUtterance = originalUtterance;
    delete g.speechSynthesis;
  });

  test("speaks synchronously within the calling turn (iOS Safari gesture)", () => {
    speakCalculatorText("plus", { locale: "en" });
    // Must speak immediately and in-line — iOS Safari silently drops
    // utterances spoken outside the user gesture (e.g. via setTimeout/Promise).
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("plus");
    expect(spoken[0].lang).toBe("en-US");
  });

  test("maps the locale onto the utterance language", () => {
    speakCalculatorText("は", { locale: "ja" });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe("ja-JP");
  });

  test("uses the preferred browser TTS voice from audio settings", () => {
    fakeVoices = [
      { voiceURI: "us", lang: "en-US", name: "English US" },
      { voiceURI: "uk", lang: "en-GB", name: "English UK" },
    ] as SpeechSynthesisVoice[];
    useAudioSettingsStore.setState({ browserTtsVoiceURI: "uk" });

    speakCalculatorText("plus", { locale: "en" });
    expect(spoken).toHaveLength(1);
    expect((spoken[0].voice as SpeechSynthesisVoice).name).toBe("English UK");
  });

  test("queues subsequent utterances until the previous one ends", () => {
    speakCalculatorText("plus", { locale: "en" });
    speakCalculatorText("equals", { locale: "en" });
    // Only the first speaks immediately; the second waits for onend.
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("plus");
    spoken[0].onend?.();
    expect(spoken).toHaveLength(2);
    expect(spoken[1].text).toBe("equals");
  });
});
