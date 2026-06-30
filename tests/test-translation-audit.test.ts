import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import {
  APPLE_STYLE_GUIDE_SOURCE,
  APPLE_UI_TERMINOLOGY,
  ENGLISH_FORBIDDEN_VALUE_PATTERNS,
  ENGLISH_STYLE_EXPECTATIONS,
  getExpectedAppleUiTerm,
} from "../scripts/apple-ui-terminology";
import { APPLE_GLOSSARY_SOURCE } from "../scripts/apple-ui-terminology-data";
import { auditTranslations } from "../scripts/audit-translations";
import de from "../src/lib/locales/de/translation.json";
import en from "../src/lib/locales/en/translation.json";
import es from "../src/lib/locales/es/translation.json";
import fr from "../src/lib/locales/fr/translation.json";
import it from "../src/lib/locales/it/translation.json";
import pt from "../src/lib/locales/pt/translation.json";
import ru from "../src/lib/locales/ru/translation.json";

function collectEnglishStringValues(
  source: Record<string, unknown>
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];

  const walk = (value: unknown, path: string[]) => {
    if (typeof value === "string") {
      entries.push({ key: path.join("."), value });
      return;
    }
    if (value && typeof value === "object") {
      for (const [segment, nested] of Object.entries(value)) {
        walk(nested, [...path, segment]);
      }
    }
  };

  walk(source, []);
  return entries;
}

describe("translation audit", () => {
  const getNestedTranslationValue = (
    source: Record<string, unknown>,
    key: string
  ): string | undefined =>
    collectEnglishStringValues(source).find((entry) => entry.key === key)?.value;
  test("uses Apple English account and punctuation style", () => {
    expect(APPLE_STYLE_GUIDE_SOURCE.edition).toBe("June 2026");
    expect(en.common.auth.logIn).toBe("Sign In");
    expect(en.common.auth.logOut).toBe("Sign Out");
    expect(en.common.auth.loginDescription).toBe("Sign in to your account");

    const pending: unknown[] = [en];
    const asciiEllipsisValues: string[] = [];
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === "string") {
        if (value.includes("...")) {
          asciiEllipsisValues.push(value);
        }
      } else if (value && typeof value === "object") {
        pending.push(...Object.values(value));
      }
    }
    expect(asciiEllipsisValues).toEqual([]);
  });

  test("uses Apple glossary casing and inclusive-language English labels", () => {
    for (const [key, expected] of Object.entries(ENGLISH_STYLE_EXPECTATIONS)) {
      expect(getNestedTranslationValue(en, key)).toBe(expected);
    }

    expect(getNestedTranslationValue(en, "apps.control-panels.masterVolume")).not.toMatch(
      /\bMaster\b/u
    );
    expect(getNestedTranslationValue(en, "apps.control-panels.master")).not.toMatch(
      /\bMaster\b/u
    );
  });

  test("capitalizes standalone color labels in cased locales", () => {
    const locales = { de, es, fr, it, pt, ru };

    for (const [locale, translations] of Object.entries(locales)) {
      for (const color of ["orange", "purple"] as const) {
        const value = translations.common.colors[color];
        const firstLetter = value.charAt(0);
        expect(firstLetter).toBe(firstLetter.toLocaleUpperCase(locale));
        expect(value).toBe(translations.apps.stickies.colors[color]);
      }
    }
  });

  test("avoids forbidden Apple English style patterns in catalog values", () => {
    const retroIeKeys = new Set([
      "apps.internet-explorer.pleaseTryTheFollowing",
      "apps.internet-explorer.cannotFindServerOrDnsError",
      "apps.internet-explorer.cannotAccessWebsite",
    ]);

    for (const { key, value } of collectEnglishStringValues(en)) {
      if (retroIeKeys.has(key)) continue;
      for (const { pattern, reason } of ENGLISH_FORBIDDEN_VALUE_PATTERNS) {
        expect(value, `${key}: ${reason}`).not.toMatch(pattern);
      }
    }
  });

  test("uses terminology extracted from the macOS 26.1 corpus", () => {
    expect(APPLE_GLOSSARY_SOURCE.platform).toBe("macOS");
    expect(APPLE_GLOSSARY_SOURCE.version).toBe("26.1");
    expect(APPLE_GLOSSARY_SOURCE.revision).toBe(
      "95fff5dfcf53ed5b849756865e8e5c4c327f9bc7"
    );
    expect(Object.keys(APPLE_UI_TERMINOLOGY).length).toBeGreaterThanOrEqual(90);
    expect(APPLE_UI_TERMINOLOGY.Settings.pt).toBe("Ajustes");
    expect(APPLE_UI_TERMINOLOGY["Full Screen"].it).toBe("A tutto schermo");
    expect(APPLE_UI_TERMINOLOGY.Copy["zh-TW"]).toBe("拷貝");
    expect(en.apps.terminal.commands.about).toBe("About Terminal");

    for (const translations of Object.values(APPLE_UI_TERMINOLOGY)) {
      for (const value of Object.values(translations)) {
        expect(value.length).toBeGreaterThan(0);
        expect(value).toBe(value.trim());
      }
    }
  });

  test("uses contextual overrides for ambiguous English labels", () => {
    expect(
      getExpectedAppleUiTerm("OK", "es", "apps.admin.server.ok")
    ).toBe("OK");
    expect(
      getExpectedAppleUiTerm("Confirm", "es", "apps.admin.server.ok")
    ).toBeNull();
    expect(
      getExpectedAppleUiTerm(
        "OK",
        "es",
        "apps.control-panels.themePreviewButton"
      )
    ).toBe("Aceptar");
    expect(
      getExpectedAppleUiTerm(
        "Humidity",
        "de",
        "apps.dashboard.weather.humidity"
      )
    ).toBe("Luftfeuchtigkeit");
    expect(
      getExpectedAppleUiTerm(
        "Degrees",
        "ko",
        "apps.calculator.angle.deg"
      )
    ).toBe("도");
    expect(
      getExpectedAppleUiTerm(
        "Degrees",
        "ja",
        "apps.calculator.angle.deg"
      )
    ).toBe("度");
    expect(
      getExpectedAppleUiTerm(
        "Added",
        "fr",
        "apps.admin.tableHeaders.added"
      )
    ).toBe("Ajouté");
    expect(
      getExpectedAppleUiTerm("Pink", "zh-TW", "common.colors.pink")
    ).toBe("粉色");
  });

  test("all locales match the source and Apple UI terminology", async () => {
    expect(await auditTranslations()).toEqual([]);
  });

  test("Russian count labels resolve every CLDR plural form", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "ru",
      resources: { ru: { translation: ru } },
    });

    const cases: Array<[string, [number, string][]]> = [
      [
        "apps.ipod.menuItems.playlistTrackCount",
        [
          [1, "1 песня"],
          [2, "2 песни"],
          [5, "5 песен"],
        ],
      ],
      [
        "apps.contacts.status.cardsCount",
        [
          [1, "1 карточка"],
          [2, "2 карточки"],
          [5, "5 карточек"],
        ],
      ],
      [
        "apps.admin.statusBar.auditLogCount",
        [
          [1, "1 запись"],
          [2, "2 записи"],
          [5, "5 записей"],
        ],
      ],
      [
        "apps.admin.statusBar.redisKeysCount",
        [
          [1, "1 ключ"],
          [2, "2 ключа"],
          [5, "5 ключей"],
        ],
      ],
    ];

    for (const [key, samples] of cases) {
      for (const [count, expected] of samples) {
        expect(i18n.t(key, { count })).toBe(expected);
      }
    }
  });
});
