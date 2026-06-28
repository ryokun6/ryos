import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import { appRegistry } from "../src/config/appRegistry";
import { appIds } from "../src/config/appRegistryData";
import {
  APP_HELP_I18N_KEYS,
  getTranslatedHelpItems,
} from "../src/hooks/useTranslatedHelpItems";
import en from "../src/lib/locales/en/translation.json";
import fr from "../src/lib/locales/fr/translation.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getEnglishTranslation(path: string): unknown {
  let value: unknown = en;

  for (const segment of path.split(".")) {
    if (!isRecord(value) || !(segment in value)) {
      return undefined;
    }
    value = value[segment];
  }

  return value;
}

describe("app help -> i18n keys", () => {
  for (const appId of appIds) {
    test(`${appId} help rows match translated key list`, () => {
      const keys = APP_HELP_I18N_KEYS[appId];

      expect(appRegistry[appId].helpItems.length).toBe(keys.length);

      for (const key of keys) {
        const baseKey = `apps.${appId}.help.${key}`;
        expect(typeof getEnglishTranslation(`${baseKey}.title`)).toBe("string");
        expect(typeof getEnglishTranslation(`${baseKey}.description`)).toBe(
          "string"
        );
      }
    });
  }
});

describe("shared help item translation", () => {
  test("translates registry help items outside app-owned dialog paths", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "fr",
      resources: {
        fr: {
          translation: fr,
        },
      },
    });

    const [firstHelpItem] = getTranslatedHelpItems(
      i18n.getFixedT("fr"),
      "finder",
      appRegistry.finder.helpItems
    );

    expect(firstHelpItem?.title).toBe("Parcourir et naviguer");
    expect(firstHelpItem?.title).not.toBe(appRegistry.finder.helpItems[0]?.title);
    expect(firstHelpItem?.description).toContain("menu Aller");
  });
});
