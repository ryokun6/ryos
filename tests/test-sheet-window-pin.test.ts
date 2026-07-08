import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isSheetWindowPinned,
  pinSheetWindow,
  subscribeSheetWindowPins,
  unpinSheetWindow,
} from "../src/components/shared/sheetWindowPin";

describe("sheetWindowPin", () => {
  beforeEach(() => {
    // Clear any leftover pins from prior tests by unpinning known ids.
    unpinSheetWindow("a");
    unpinSheetWindow("b");
  });

  test("pin / unpin toggles membership", () => {
    expect(isSheetWindowPinned("a")).toBe(false);
    pinSheetWindow("a");
    expect(isSheetWindowPinned("a")).toBe(true);
    expect(isSheetWindowPinned("b")).toBe(false);
    unpinSheetWindow("a");
    expect(isSheetWindowPinned("a")).toBe(false);
  });

  test("null / undefined instance ids are never pinned", () => {
    expect(isSheetWindowPinned(null)).toBe(false);
    expect(isSheetWindowPinned(undefined)).toBe(false);
  });

  test("subscribers are notified on pin and unpin", () => {
    let calls = 0;
    const unsubscribe = subscribeSheetWindowPins(() => {
      calls += 1;
    });

    pinSheetWindow("a");
    expect(calls).toBe(1);
    pinSheetWindow("a"); // idempotent — no second notify
    expect(calls).toBe(1);
    unpinSheetWindow("a");
    expect(calls).toBe(2);
    unpinSheetWindow("a"); // already gone — no notify
    expect(calls).toBe(2);

    unsubscribe();
    pinSheetWindow("a");
    expect(calls).toBe(2);
    unpinSheetWindow("a");
  });
});

describe("aqua sheet dialog wiring", () => {
  test("HelpDialog opts out of sheet presentation", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/components/dialogs/HelpDialog.tsx"),
      "utf8"
    );
    expect(source).toMatch(/disableSheet/);
  });

  test("sheet path paints a window-local scrim under the titlebar", () => {
    const dialog = readFileSync(
      join(import.meta.dir, "../src/components/ui/dialog.tsx"),
      "utf8"
    );
    const aqua = readFileSync(
      join(import.meta.dir, "../src/styles/themes/aqua.css"),
      "utf8"
    );
    expect(dialog).toMatch(/macosx-sheet-window-scrim/);
    expect(dialog).toMatch(/pinSheetWindow/);
    expect(aqua).toMatch(/\.macosx-sheet-window-scrim/);
  });

  test("sheet strip stacks above the window-local scrim", () => {
    const dialog = readFileSync(
      join(import.meta.dir, "../src/components/ui/dialog.tsx"),
      "utf8"
    );
    const aqua = readFileSync(
      join(import.meta.dir, "../src/styles/themes/aqua.css"),
      "utf8"
    );
    // Sheet must outrank the scrim: Radix portals each child separately, so a
    // late-mounted scrim can otherwise paint over the sheet at equal z-index.
    expect(dialog).toMatch(/macosx-sheet-strip[^"]*z-\[51\]/);
    expect(dialog).toMatch(
      /macosx-sheet-window-scrim[^"]*z-50|macosx-sheet-window-scrim fixed z-50/
    );
    expect(aqua).toMatch(
      /\.macosx-sheet-window-scrim\s*\{[^}]*z-index:\s*50/s
    );
    expect(aqua).toMatch(/\.macosx-sheet-strip\s*\{[^}]*z-index:\s*51/s);
  });

  test("WindowFrame pins immersive titlebar while a sheet is open", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/components/layout/window-frame/WindowFrame.tsx"),
      "utf8"
    );
    expect(source).toMatch(/isSheetWindowPinned/);
    expect(source).toMatch(/effectiveDisableTitlebarAutoHide/);
  });
});
