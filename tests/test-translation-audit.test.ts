import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import { auditTranslations } from "../scripts/audit-translations";
import ru from "../src/lib/locales/ru/translation.json";

describe("translation audit", () => {
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
