import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASSISTANT_CHARACTERS } from "../src/components/assistant/characters";
import en from "../src/lib/locales/en/translation.json";

const LOCALES = [
  "en",
  "de",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pt",
  "ru",
  "zh-CN",
  "zh-TW",
] as const;

function getCharacterNames(locale: string): Record<string, unknown> {
  const catalog = JSON.parse(
    readFileSync(
      join(process.cwd(), `src/lib/locales/${locale}/translation.json`),
      "utf8"
    )
  );
  return catalog.common.assistant.characters ?? {};
}

describe("assistant character name localization", () => {
  test("every character has a nameKey under common.assistant.characters", () => {
    for (const character of ASSISTANT_CHARACTERS) {
      expect(character.nameKey).toBe(
        `common.assistant.characters.${character.id}`
      );
    }
  });

  test("English catalog names match the canonical character names", () => {
    const names = (en as Record<string, any>).common.assistant.characters;
    for (const character of ASSISTANT_CHARACTERS) {
      expect(names[character.id]).toBe(character.name);
    }
  });

  for (const locale of LOCALES) {
    test(`${locale} defines a translated name for every character`, () => {
      const names = getCharacterNames(locale);
      for (const character of ASSISTANT_CHARACTERS) {
        const value = names[character.id];
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
        expect(value as string).not.toStartWith("[TODO]");
      }
    });
  }

  test("historically documented localized names are preserved", () => {
    expect(getCharacterNames("de").clippy).toBe("Karl Klammer");
    expect(getCharacterNames("fr").clippy).toBe("Trombine");
    expect(getCharacterNames("es").clippy).toBe("Clipo");
    expect(getCharacterNames("ru").clippy).toBe("Скрепыш");
    expect(getCharacterNames("ja").clippy).toBe("クリッパー");
    expect(getCharacterNames("zh-CN").clippy).toBe("大眼夹");
    expect(getCharacterNames("zh-TW").clippy).toBe("大眼迴紋針");
    expect(getCharacterNames("ko").rocky).toBe("재롱이");
    expect(getCharacterNames("ja").saeko).toBe("冴子先生");
    expect(getCharacterNames("zh-CN").saeko).toBe("苗苗老师");
  });
});
