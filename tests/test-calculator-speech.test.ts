import { describe, expect, test } from "bun:test";
import {
  enqueueCalculatorSpeech,
  formatDisplayForSpeech,
  formatKeyLabel,
  createCalculatorSpeechQueue,
} from "../src/apps/calculator/utils/calculatorSpeech";
import {
  pickSpeechVoiceForLanguage,
  ryOSLocaleToSpeechLanguage,
} from "../src/apps/calculator/utils/calculatorSpeechLocale";

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
