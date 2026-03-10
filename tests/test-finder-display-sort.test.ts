#!/usr/bin/env bun

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { applyLanguage, initializeI18n } from "../src/lib/i18n";
import { useThemeStore } from "../src/stores/useThemeStore";
import {
  compareFinderItemsByDisplayName,
  getFinderDisplayName,
  type FinderDisplayItem,
} from "../src/utils/finderDisplay";

const applications: FinderDisplayItem[] = [
  {
    name: "Photo Booth.app",
    isDirectory: false,
    path: "/Applications/Photo Booth.app",
    appId: "photo-booth",
  },
  {
    name: "Virtual PC.app",
    isDirectory: false,
    path: "/Applications/Virtual PC.app",
    appId: "pc",
  },
];

describe("finder localized display sorting", () => {
  const originalTheme = useThemeStore.getState().current;
  const originalNavigator = globalThis.navigator;

  beforeAll(async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        language: "en",
        languages: ["en"],
      },
    });

    await initializeI18n();
    useThemeStore.setState({ current: "macosx" });
  });

  afterAll(async () => {
    useThemeStore.setState({ current: originalTheme });
    await applyLanguage("en");

    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
      return;
    }

    Reflect.deleteProperty(globalThis, "navigator");
  });

  test("uses translated application names for display", async () => {
    await applyLanguage("ja");

    expect(getFinderDisplayName(applications[0])).toBe("フォトブース");
    expect(getFinderDisplayName(applications[1])).toBe("バーチャルPC");
  });

  test("sorts application entries by translated name instead of source filename", async () => {
    await applyLanguage("en");
    const englishOrder = [...applications]
      .sort(compareFinderItemsByDisplayName)
      .map((file) => getFinderDisplayName(file));

    await applyLanguage("ja");
    const japaneseOrder = [...applications]
      .sort(compareFinderItemsByDisplayName)
      .map((file) => getFinderDisplayName(file));

    expect(englishOrder).toEqual(["Photo Booth", "Virtual PC"]);
    expect(japaneseOrder).toEqual(["バーチャルPC", "フォトブース"]);
  });
});
