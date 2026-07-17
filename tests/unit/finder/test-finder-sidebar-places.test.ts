#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  orderSidebarRootFolders,
  SIDEBAR_FOLDER_ORDER,
  SIDEBAR_HIDDEN_FOLDERS,
  SIDEBAR_LAST_FOLDER,
} from "../../../src/apps/finder/utils/sidebarPlaces";

describe("Finder sidebar places ordering", () => {
  test("orders known folders, then unlisted, with Desktop last", () => {
    const folders = [
      { path: "/Desktop", name: "Desktop" },
      { path: "/Downloads", name: "Downloads" },
      { path: "/Applications", name: "Applications" },
      { path: "/Books", name: "Books" },
      { path: "/MyStuff", name: "MyStuff" },
      { path: "/Documents", name: "Documents" },
    ];

    expect(orderSidebarRootFolders(folders).map((f) => f.path)).toEqual([
      "/Applications",
      "/Documents",
      "/Books",
      "/Downloads",
      "/MyStuff",
      "/Desktop",
    ]);
  });

  test("hides Trash and Sites from sidebar places", () => {
    const folders = [
      { path: "/Applications", name: "Applications" },
      { path: "/Trash", name: "Trash" },
      { path: "/Sites", name: "Sites" },
      { path: "/Desktop", name: "Desktop" },
    ];

    const ordered = orderSidebarRootFolders(folders);
    expect(ordered.map((f) => f.path)).toEqual([
      "/Applications",
      "/Desktop",
    ]);
    for (const hidden of SIDEBAR_HIDDEN_FOLDERS) {
      expect(ordered.some((f) => f.path === hidden)).toBe(false);
    }
  });

  test("keeps Desktop last even when it is the only unlisted folder", () => {
    const folders = SIDEBAR_FOLDER_ORDER.map((path) => ({
      path,
      name: path.slice(1),
    })).concat([{ path: SIDEBAR_LAST_FOLDER, name: "Desktop" }]);

    const ordered = orderSidebarRootFolders(folders);
    expect(ordered.at(-1)?.path).toBe("/Desktop");
    expect(ordered.map((f) => f.path).slice(0, -1)).toEqual([
      ...SIDEBAR_FOLDER_ORDER,
    ]);
  });
});
