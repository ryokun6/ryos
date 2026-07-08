import { describe, expect, test } from "bun:test";
import {
  APPLE_LOCALIZATION_SOURCE,
  buildRawFileUrl,
  extractTerminology,
  extractTerminologyFromDocuments,
  renderTypescript,
  type RawLocalization,
  type RawLocalizationDocument,
} from "../../../scripts/extract-apple-terminology";

const expectedSettings = {
  "zh-TW": "設定",
  "zh-CN": "设置",
  ja: "設定",
  ko: "설정",
  fr: "Réglages",
  de: "Einstellungen",
  es: "Ajustes",
  pt: "Ajustes",
  it: "Impostazioni",
  ru: "Настройки",
} as const;

const expectedPlaylists = {
  "zh-TW": "播放列表",
  "zh-CN": "播放列表",
  ja: "プレイリスト",
  ko: "플레이리스트",
  fr: "Playlists",
  de: "Playlists",
  es: "Listas de reproducción",
  pt: "Playlists",
  it: "Playlist",
  ru: "Плейлисты",
} as const;

const expectedSetPassword = {
  "zh-TW": "設定密碼",
  "zh-CN": "设定密码",
  ja: "パスワードを設定",
  ko: "암호 설정",
  fr: "Définir un mot de passe",
  de: "Passwort festlegen",
  es: "Definir contraseña",
  pt: "Definir Senha",
  it: "Imposta password",
  ru: "Задать пароль",
} as const;

const languageCodes = {
  "zh-TW": "zh_TW",
  "zh-CN": "zh_CN",
  ja: "Japanese",
  ko: "ko",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "pt",
  it: "Italian",
  ru: "ru",
} as const;

function localization(language: string, target: string): RawLocalization {
  return {
    target,
    language,
    filename: "Localizable.strings",
  };
}

function document(
  localizations: Record<string, RawLocalization[]>,
  framework = "System Settings.app"
): RawLocalizationDocument {
  return {
    bundlePath: "/System/Applications/System Settings.app",
    framework,
    localizations,
  };
}

describe("macOS 26 Apple glossary extractor", () => {
  test("builds a pinned raw-data URL with an encoded filename", () => {
    expect(buildRawFileUrl("System Settings #1.json")).toBe(
      `https://raw.githubusercontent.com/kishikawakatsumi/applelocalization-tools/${APPLE_LOCALIZATION_SOURCE.revision}/data/macos/26.1/System%20Settings%20%231.json`
    );
  });

  test("selects dominant desktop translations and excludes regional noise", () => {
    const settings = Object.entries(expectedSettings).flatMap(
      ([locale, translation]) =>
        Array.from({ length: 4 }, () =>
          localization(
            languageCodes[locale as keyof typeof languageCodes],
            ` ${translation} `
          )
        )
    );
    settings.push(
      localization("fr", "Paramètres"),
      localization("fr_CA", "Paramètres"),
      localization("pt_PT", "Definições"),
      localization("zh_HK", "設定"),
      ...Array.from({ length: 10 }, () => localization("fr", "Réglages…"))
    );

    expect(
      extractTerminologyFromDocuments(
        ["Settings"],
        [
          document({
            Settings: settings,
            "Different source": [localization("fr", "Ignore me")],
          }),
        ]
      )
    ).toEqual({ Settings: expectedSettings });
  });

  test("uses a term-specific framework hint for ambiguous source text", () => {
    const correct = Object.entries(expectedPlaylists).map(
      ([locale, translation]) =>
        localization(
          languageCodes[locale as keyof typeof languageCodes],
          translation
        )
    );
    const unrelated = Object.keys(expectedPlaylists).flatMap((locale) =>
      Array.from({ length: 10 }, () =>
        localization(
          languageCodes[locale as keyof typeof languageCodes],
          "Wrong podcast meaning"
        )
      )
    );

    expect(
      extractTerminologyFromDocuments(
        ["Playlists"],
        [
          document({ Playlists: unrelated }, "Podcasts.app"),
          document({ Playlists: correct }, "MusicKitInternal.framework"),
        ]
      )
    ).toEqual({ Playlists: expectedPlaylists });
  });

  test("uses a source-backed preference to resolve translation ties", () => {
    const localizations = Object.entries(expectedSetPassword).map(
      ([locale, translation]) =>
        localization(
          languageCodes[locale as keyof typeof languageCodes],
          translation
        )
    );
    localizations.push(localization("de", "Festlegen"));

    expect(
      extractTerminologyFromDocuments(
        ["Set Password"],
        [document({ "Set Password": localizations })]
      )
    ).toEqual({ "Set Password": expectedSetPassword });
  });

  test("streams the pinned manifest and raw localization files", async () => {
    const settings = Object.entries(expectedSettings).map(
      ([locale, translation]) =>
        localization(
          languageCodes[locale as keyof typeof languageCodes],
          translation
        )
    );
    const requestedUrls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requestedUrls.push(url.toString());
      if (url.pathname === "/tree") {
        return Response.json({
          sha: "tree-sha",
          tree: [
            {
              path: "System Settings.json",
              mode: "100644",
              type: "blob",
              sha: "blob-sha",
              size: 123,
            },
          ],
          truncated: false,
        });
      }
      return Response.json(document({ Settings: settings }));
    };

    await expect(
      extractTerminology(["Settings"], {
        manifestUrl: "https://example.test/tree",
        rawBaseUrl: "https://example.test/raw",
        fetchImpl,
        retries: 1,
      })
    ).resolves.toEqual({ Settings: expectedSettings });
    expect(requestedUrls).toEqual([
      "https://example.test/tree",
      "https://example.test/raw/System%20Settings.json",
    ]);
  });

  test("reports every missing term and locale together", () => {
    expect(() =>
      extractTerminologyFromDocuments(["Missing"], [])
    ).toThrow(
      'No macOS 26.1 entries for 10 term/locale pairs:\n"Missing" (zh-TW)'
    );
  });

  test("renders pinned macOS 26.1 source provenance", () => {
    const output = renderTypescript({ Settings: expectedSettings });

    expect(output).toContain(
      "https://github.com/kishikawakatsumi/applelocalization-web"
    );
    expect(output).toContain(
      "https://github.com/kishikawakatsumi/applelocalization-tools"
    );
    expect(output).toContain('"version": "26.1"');
    expect(output).toContain(APPLE_LOCALIZATION_SOURCE.revision);
    expect(output).toContain('"Settings": {');
    expect(output).toContain('"pt": "Ajustes"');
  });
});
