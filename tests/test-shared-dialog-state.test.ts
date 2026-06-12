/**
 * Guardrail tests for the shared dialog-state hooks.
 *
 * App logic hooks must use `useAppHelpAboutDialogs` (or, for media apps,
 * `useMediaAppDialogs`) instead of re-declaring per-app
 * `useState(false)` pairs for the Help/About dialogs.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const APPS_DIR = resolve(process.cwd(), "src/apps");

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

/** Recursively collect every .ts/.tsx file under src/apps/<app>/hooks. */
const collectAppHookFiles = (): string[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (/\.tsx?$/.test(entry)) {
        files.push(fullPath);
      }
    }
  };
  for (const app of readdirSync(APPS_DIR)) {
    const hooksDir = join(APPS_DIR, app, "hooks");
    try {
      if (statSync(hooksDir).isDirectory()) walk(hooksDir);
    } catch {
      // app has no hooks directory
    }
  }
  return files;
};

// Logic hooks that live outside a hooks/ directory but were migrated too.
const EXTRA_MIGRATED_FILES = [
  "src/apps/chats/components/chats-app/useChatsAppController.tsx",
];

const HELP_DIALOG_USESTATE =
  /const \[isHelpDialogOpen,\s*setIsHelpDialogOpen\]\s*=\s*useState/;
const ABOUT_DIALOG_USESTATE =
  /const \[isAboutDialogOpen,\s*setIsAboutDialogOpen\]\s*=\s*useState/;

describe("Shared dialog state wiring", () => {
  test("no logic hook under src/apps/**/hooks declares useState for isHelpDialogOpen/isAboutDialogOpen", () => {
    const offenders: string[] = [];
    for (const file of collectAppHookFiles()) {
      const source = readFileSync(file, "utf-8");
      if (
        HELP_DIALOG_USESTATE.test(source) ||
        ABOUT_DIALOG_USESTATE.test(source)
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("migrated logic hooks outside hooks/ directories don't re-declare dialog useState", () => {
    for (const relativePath of EXTRA_MIGRATED_FILES) {
      const source = readSource(relativePath);
      expect(HELP_DIALOG_USESTATE.test(source)).toBe(false);
      expect(ABOUT_DIALOG_USESTATE.test(source)).toBe(false);
      expect(source).toContain("useAppHelpAboutDialogs()");
    }
  });

  test("useIpodLogic uses useMediaAppDialogs", () => {
    const source = readSource("src/apps/ipod/hooks/useIpodLogic.ts");
    expect(source).toContain(
      'import { useMediaAppDialogs } from "@/hooks/useMediaAppDialogs"'
    );
    expect(source).toContain("useMediaAppDialogs()");
  });

  test("useKaraokeLogic uses useMediaAppDialogs", () => {
    const source = readSource("src/apps/karaoke/hooks/useKaraokeLogic.ts");
    expect(source).toContain(
      'import { useMediaAppDialogs } from "@/hooks/useMediaAppDialogs"'
    );
    expect(source).toContain("useMediaAppDialogs()");
  });

  test("shared hooks exist and expose the expected API", () => {
    const helpAbout = readSource("src/hooks/useAppHelpAboutDialogs.ts");
    expect(helpAbout).toContain("export function useAppHelpAboutDialogs");
    for (const key of [
      "isHelpDialogOpen",
      "setIsHelpDialogOpen",
      "isAboutDialogOpen",
      "setIsAboutDialogOpen",
    ]) {
      expect(helpAbout).toContain(key);
    }

    const mediaDialogs = readSource("src/hooks/useMediaAppDialogs.ts");
    expect(mediaDialogs).toContain("export function useMediaAppDialogs");
    for (const key of [
      "isHelpDialogOpen",
      "isAboutDialogOpen",
      "isConfirmClearOpen",
      "isShareDialogOpen",
      "isLyricsSearchDialogOpen",
      "isSongSearchDialogOpen",
      "isSyncModeOpen",
      "isAddingSong",
    ]) {
      expect(mediaDialogs).toContain(key);
    }
  });
});
