import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import {
  APPLE_UI_TERMINOLOGY,
  getExpectedAppleUiTerm,
} from "../scripts/apple-ui-terminology";
import { auditTranslations } from "../scripts/audit-translations";
import en from "../src/lib/locales/en/translation.json";
import ru from "../src/lib/locales/ru/translation.json";

describe("translation audit", () => {
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
