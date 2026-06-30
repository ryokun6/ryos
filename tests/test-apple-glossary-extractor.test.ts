import { describe, expect, test } from "bun:test";
import {
  APPLE_LOCALIZATION_SOURCE,
  buildSearchUrl,
  fetchTermTranslations,
  renderTypescript,
  selectDominantTranslations,
  type AppleLocalizationRow,
} from "../scripts/extract-apple-terminology";

const expectedSettings = {
  "zh-TW": "設定",
  ja: "設定",
  ko: "설정",
  fr: "Réglages",
  de: "Einstellungen",
  es: "Ajustes",
  pt: "Ajustes",
  it: "Impostazioni",
  ru: "Настройки",
} as const;

const languageCodes = {
  "zh-TW": "zh_TW",
  ja: "ja",
  ko: "ko",
  fr: "fr",
  de: "de",
  es: "es",
  pt: "pt_BR",
  it: "it",
  ru: "ru",
} as const;

function row(
  language: string,
  target: string,
  source = "Settings"
): AppleLocalizationRow {
  return {
    source,
    target,
    language,
    file_name: "Localizable.strings",
    bundle_name: "SystemSettings.app",
  };
}

describe("macOS 26 Apple glossary extractor", () => {
  test("builds an exact-source query for every supported language group", () => {
    const url = new URL(buildSearchUrl("Save Changes", 2));

    expect(`${url.origin}${url.pathname}`).toBe(
      APPLE_LOCALIZATION_SOURCE.api
    );
    expect(url.searchParams.get("c")).toBe("key");
    expect(url.searchParams.get("o")).toBe("equal");
    expect(url.searchParams.get("q")).toBe("Save Changes");
    expect(url.searchParams.get("size")).toBe("200");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.getAll("l")).toEqual([
      "Traditional Chinese",
      "Japanese",
      "Korean",
      "French",
      "German",
      "Spanish",
      "Portuguese",
      "Italian",
      "Russian",
    ]);
  });

  test("selects dominant desktop translations and excludes regional noise", () => {
    const rows = Object.entries(expectedSettings).flatMap(
      ([locale, translation]) => [
        row(languageCodes[locale as keyof typeof languageCodes], translation),
        row(languageCodes[locale as keyof typeof languageCodes], ` ${translation} `),
      ]
    );
    rows.push(
      row("fr", "Paramètres"),
      row("fr_CA", "Paramètres"),
      row("pt_PT", "Definições"),
      row("zh_HK", "設定"),
      row("fr", "Ignore me", "Different source")
    );

    expect(selectDominantTranslations("Settings", rows)).toEqual(
      expectedSettings
    );
  });

  test("fetches every result page before selecting translations", async () => {
    const rows = Object.entries(expectedSettings).map(
      ([locale, translation]) =>
        row(languageCodes[locale as keyof typeof languageCodes], translation)
    );
    const requestedPages: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const page = url.searchParams.get("page") ?? "1";
      requestedPages.push(page);
      const data = page === "1" ? rows.slice(0, 4) : rows.slice(4);
      return Response.json({
        data,
        last_page: 2,
        total: rows.length,
      });
    };

    await expect(
      fetchTermTranslations("Settings", {
        apiUrl: "https://example.test/search",
        fetchImpl,
        retries: 1,
      })
    ).resolves.toEqual(expectedSettings);
    expect(requestedPages.sort()).toEqual(["1", "2"]);
  });

  test("renders macOS 26 source provenance with generated terminology", () => {
    const output = renderTypescript({ Settings: expectedSettings });

    expect(output).toContain(
      "https://github.com/kishikawakatsumi/applelocalization-web"
    );
    expect(output).toContain('"version": "26"');
    expect(output).toContain('"Settings": {');
    expect(output).toContain('"pt": "Ajustes"');
  });
});
