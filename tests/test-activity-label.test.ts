import { describe, expect, test } from "bun:test";
import { getActivityLabel } from "../src/hooks/useActivityLabel";

describe("getActivityLabel", () => {
  test("uses translated lyrics language labels for translation progress", () => {
    const translations: Record<string, string> = {
      "apps.ipod.translationLanguages.english": "英語",
    };

    const result = getActivityLabel(
      {
        isTranslating: true,
        translationLanguage: "en",
        translationProgress: 42.4,
      },
      (key, options) => translations[key] ?? String(options?.defaultValue ?? key)
    );

    expect(result).toEqual({
      isActive: true,
      label: "42% 英語",
    });
  });

  test("falls back to the language code when the code is not in the lyrics language list", () => {
    const result = getActivityLabel(
      {
        isTranslating: true,
        translationLanguage: "pl",
        translationProgress: 99,
      },
      (_key, options) => String(options?.defaultValue ?? "")
    );

    expect(result).toEqual({
      isActive: true,
      label: "99% pl",
    });
  });
});
