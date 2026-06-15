#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  formatShortcut,
  matchesShortcut,
  type KeyEventLike,
  type ShortcutEnv,
} from "../src/utils/shortcuts";

function ev(over: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: over.key ?? "",
    metaKey: over.metaKey ?? false,
    ctrlKey: over.ctrlKey ?? false,
    altKey: over.altKey ?? false,
    shiftKey: over.shiftKey ?? false,
  };
}

const mac: ShortcutEnv = { platform: "mac", electron: false };
const macApp: ShortcutEnv = { platform: "mac", electron: true };
const win: ShortcutEnv = { platform: "other", electron: false };
const winApp: ShortcutEnv = { platform: "other", electron: true };

describe("formatShortcut", () => {
  test("mac uses ⌘ symbols, windows uses Ctrl text", () => {
    expect(formatShortcut("save", mac)).toBe("⌘S");
    expect(formatShortcut("save", win)).toBe("Ctrl+S");
  });

  test("multi-modifier ordering", () => {
    expect(formatShortcut("saveAs", mac)).toBe("⇧⌘S");
    expect(formatShortcut("saveAs", win)).toBe("Ctrl+Shift+S");
  });

  test("redo differs per platform (⇧⌘Z vs Ctrl+Y)", () => {
    expect(formatShortcut("redo", mac)).toBe("⇧⌘Z");
    expect(formatShortcut("redo", win)).toBe("Ctrl+Y");
  });

  test("browser-reserved combos are hidden on the web, shown in the shell", () => {
    expect(formatShortcut("newFile", mac)).toBeNull();
    expect(formatShortcut("newFile", win)).toBeNull();
    expect(formatShortcut("newFile", macApp)).toBe("⌘N");
    expect(formatShortcut("newFile", winApp)).toBe("Ctrl+N");
  });

  test("close falls back to Alt/Option on the web, real ⌘W in the shell", () => {
    expect(formatShortcut("close", mac)).toBe("⌥W");
    expect(formatShortcut("close", win)).toBe("Alt+W");
    expect(formatShortcut("close", macApp)).toBe("⌘W");
    expect(formatShortcut("close", winApp)).toBe("Ctrl+W");
  });

  test("newFolder uses ⇧⌘N in the shell", () => {
    expect(formatShortcut("newFolder", macApp)).toBe("⇧⌘N");
    expect(formatShortcut("newFolder", winApp)).toBe("Ctrl+Shift+N");
  });
});

describe("matchesShortcut", () => {
  test("save matches the command modifier for the platform", () => {
    expect(matchesShortcut(ev({ key: "s", metaKey: true }), "save", mac)).toBe(
      true
    );
    expect(matchesShortcut(ev({ key: "s", ctrlKey: true }), "save", win)).toBe(
      true
    );
  });

  test("save does not match the wrong modifier", () => {
    // Ctrl+S on mac should not fire (mac command modifier is ⌘).
    expect(matchesShortcut(ev({ key: "s", ctrlKey: true }), "save", mac)).toBe(
      false
    );
    // ⌘S on windows should not fire (windows command modifier is Ctrl).
    expect(matchesShortcut(ev({ key: "s", metaKey: true }), "save", win)).toBe(
      false
    );
  });

  test("save rejects stray extra command modifier", () => {
    expect(
      matchesShortcut(
        ev({ key: "s", metaKey: true, ctrlKey: true }),
        "save",
        mac
      )
    ).toBe(false);
  });

  test("redo matches ⇧⌘Z on mac and Ctrl+Y on windows", () => {
    expect(
      matchesShortcut(ev({ key: "z", metaKey: true, shiftKey: true }), "redo", mac)
    ).toBe(true);
    expect(matchesShortcut(ev({ key: "y", ctrlKey: true }), "redo", win)).toBe(
      true
    );
    // Plain ⌘Z is undo, not redo.
    expect(matchesShortcut(ev({ key: "z", metaKey: true }), "redo", mac)).toBe(
      false
    );
  });

  test("browser-reserved combos only fire in the shell", () => {
    expect(
      matchesShortcut(ev({ key: "n", metaKey: true }), "newFile", mac)
    ).toBe(false);
    expect(
      matchesShortcut(ev({ key: "n", metaKey: true }), "newFile", macApp)
    ).toBe(true);
    expect(
      matchesShortcut(ev({ key: "n", ctrlKey: true }), "newFile", winApp)
    ).toBe(true);
  });

  test("close uses Alt fallback on web and ⌘W in the shell", () => {
    expect(matchesShortcut(ev({ key: "w", altKey: true }), "close", mac)).toBe(
      true
    );
    expect(matchesShortcut(ev({ key: "w", metaKey: true }), "close", mac)).toBe(
      false
    );
    expect(
      matchesShortcut(ev({ key: "w", metaKey: true }), "close", macApp)
    ).toBe(true);
  });

  test("case-insensitive key matching", () => {
    expect(matchesShortcut(ev({ key: "S", metaKey: true }), "save", mac)).toBe(
      true
    );
  });
});
