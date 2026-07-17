#!/usr/bin/env bun

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { applyLanguage, initializeI18n } from "../../../src/lib/i18n";
import {
  orderFinderRootFolders,
  orderSidebarRootFolders,
  SIDEBAR_HIDDEN_FOLDERS,
  SIDEBAR_LAST_FOLDER,
  SIDEBAR_PINNED_FOLDERS,
} from "../../../src/apps/finder/utils/sidebarPlaces";

describe("Finder places ordering", () => {
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
    await applyLanguage("en");
  });

  afterAll(async () => {
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

  test("pins Applications and Applets, then alphabetical, Desktop last", () => {
    const folders = [
      { path: "/Desktop", name: "Desktop" },
      { path: "/Videos", name: "Videos" },
      { path: "/Applets", name: "Applets" },
      { path: "/Downloads", name: "Downloads" },
      { path: "/Applications", name: "Applications" },
      { path: "/Books", name: "Books" },
      { path: "/MyStuff", name: "MyStuff" },
      { path: "/Documents", name: "Documents" },
      { path: "/Images", name: "Images" },
      { path: "/Music", name: "Music" },
    ];

    expect(orderFinderRootFolders(folders).map((f) => f.path)).toEqual([
      "/Applications",
      "/Applets",
      "/Books",
      "/Documents",
      "/Downloads",
      "/Images",
      "/Music",
      "/MyStuff",
      "/Videos",
      "/Desktop",
    ]);
  });

  test("hides Trash and Sites from sidebar places only", () => {
    const folders = [
      { path: "/Applications", name: "Applications" },
      { path: "/Trash", name: "Trash" },
      { path: "/Sites", name: "Sites" },
      { path: "/Documents", name: "Documents" },
      { path: "/Desktop", name: "Desktop" },
    ];

    expect(orderSidebarRootFolders(folders).map((f) => f.path)).toEqual([
      "/Applications",
      "/Documents",
      "/Desktop",
    ]);

    // Go menu keeps Sites (Trash is excluded upstream); order still applies.
    expect(orderFinderRootFolders(folders).map((f) => f.path)).toEqual([
      "/Applications",
      "/Documents",
      "/Sites",
      "/Trash",
      "/Desktop",
    ]);

    for (const hidden of SIDEBAR_HIDDEN_FOLDERS) {
      expect(
        orderSidebarRootFolders(folders).some((f) => f.path === hidden)
      ).toBe(false);
    }
  });

  test("keeps pinned folders first and Desktop last", () => {
    const folders = [
      { path: SIDEBAR_LAST_FOLDER, name: "Desktop" },
      { path: "/Zebra", name: "Zebra" },
      { path: "/Applets", name: "Applets" },
      { path: "/Applications", name: "Applications" },
      { path: "/Alpha", name: "Alpha" },
    ];

    const ordered = orderFinderRootFolders(folders);
    expect(ordered.slice(0, 2).map((f) => f.path)).toEqual([
      ...SIDEBAR_PINNED_FOLDERS,
    ]);
    expect(ordered.at(-1)?.path).toBe("/Desktop");
    expect(ordered.map((f) => f.path)).toEqual([
      "/Applications",
      "/Applets",
      "/Alpha",
      "/Zebra",
      "/Desktop",
    ]);
  });
});
