import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isSheetWindowPinned,
  pinSheetWindow,
  subscribeSheetWindowPins,
  unpinSheetWindow,
} from "../../../src/components/shared/sheetWindowPin";

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
      join(import.meta.dir, "../../../src/components/dialogs/HelpDialog.tsx"),
      "utf8"
    );
    expect(source).toMatch(/disableSheet/);
  });

  test("AboutDialog opts out of sheet presentation", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../../src/components/dialogs/AboutDialog.tsx"),
      "utf8"
    );
    expect(source).toMatch(/disableSheet/);
  });

  test("AboutFinderDialog opts out of sheet presentation", () => {
    const source = readFileSync(
      join(
        import.meta.dir,
        "../../../src/components/dialogs/AboutFinderDialog.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/disableSheet/);
  });

  test("sheet path paints a window-local scrim under the titlebar", () => {
    const dialog = readFileSync(
      join(import.meta.dir, "../../../src/components/ui/dialog.tsx"),
      "utf8"
    );
    const aqua = readFileSync(
      join(import.meta.dir, "../../../src/styles/themes/aqua.css"),
      "utf8"
    );
    expect(dialog).toMatch(/macosx-sheet-window-scrim/);
    expect(dialog).toMatch(/pinSheetWindow/);
    expect(aqua).toMatch(/\.macosx-sheet-window-scrim/);
  });

  test("window-local scrim lives in the sheet strip and fades with it", () => {
    const dialog = readFileSync(
      join(import.meta.dir, "../../../src/components/ui/dialog.tsx"),
      "utf8"
    );
    const aqua = readFileSync(
      join(import.meta.dir, "../../../src/styles/themes/aqua.css"),
      "utf8"
    );
    // Scrim is a child of the strip (not a sibling portal) so it shares
    // data-state and stays under the sheet body.
    const stripIdx = dialog.indexOf("macosx-sheet-strip");
    const scrimIdx = dialog.indexOf("macosx-sheet-window-scrim");
    const bodyIdx = dialog.indexOf("macosx-sheet-body");
    expect(stripIdx).toBeGreaterThan(-1);
    expect(scrimIdx).toBeGreaterThan(stripIdx);
    expect(bodyIdx).toBeGreaterThan(scrimIdx);
    expect(dialog).toMatch(/macosx-sheet-body[^"]*relative z-\[1\]/);
    expect(aqua).toMatch(
      /\.macosx-sheet-window-scrim\s*\{[^}]*z-index:\s*0/s
    );
    expect(aqua).toMatch(
      /\[data-state="open"\]\s*\n\s*\.macosx-sheet-window-scrim/
    );
    expect(aqua).toMatch(
      /\[data-state="closed"\]\s*\n\s*\.macosx-sheet-window-scrim/
    );
    expect(aqua).toMatch(/macosx-sheet-scrim-in/);
    expect(aqua).toMatch(/macosx-sheet-scrim-out/);
  });

  test("WindowFrame pins immersive titlebar while a sheet is open", () => {
    const source = readFileSync(
      join(
        import.meta.dir,
        "../../../src/components/layout/window-frame/WindowFrame.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/isSheetWindowPinned/);
    expect(source).toMatch(/effectiveDisableTitlebarAutoHide/);
  });
});
