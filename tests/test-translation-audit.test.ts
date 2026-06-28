import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import {
  APPLE_STYLE_GUIDE_SOURCE,
  APPLE_UI_TERMINOLOGY,
  ENGLISH_FORBIDDEN_VALUE_PATTERNS,
  ENGLISH_STYLE_EXPECTATIONS,
  getExpectedAppleUiTerm,
} from "../scripts/apple-ui-terminology";
import { auditTranslations } from "../scripts/audit-translations";
import en from "../src/lib/locales/en/translation.json";
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

  test("uses the expanded terminology extracted from Apple glossaries", () => {
    expect(Object.keys(APPLE_UI_TERMINOLOGY).length).toBeGreaterThanOrEqual(100);
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

    const key = "apps.ipod.menuItems.playlistTrackCount";
    expect(i18n.t(key, { count: 1 })).toBe("1 песня");
    expect(i18n.t(key, { count: 2 })).toBe("2 песни");
    expect(i18n.t(key, { count: 5 })).toBe("5 песен");
  });
});
