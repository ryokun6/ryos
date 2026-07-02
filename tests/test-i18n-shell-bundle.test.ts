import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildShellTranslation } from "../scripts/generate-i18n-shell";
import fullTranslation from "../src/lib/locales/en/translation.json";
import shellTranslation from "../src/lib/locales/en/shell.json";

const ROOT = path.resolve(import.meta.dir, "..");

describe("English shell translation bundle", () => {
  test("matches the generated critical subset", () => {
    expect(buildShellTranslation(fullTranslation)).toEqual(shellTranslation);
  });

  test("keeps shell labels while excluding lazy app copy", () => {
    expect(shellTranslation.common).toBeDefined();
    expect(shellTranslation.apps.finder.folders).toBeDefined();
    expect(shellTranslation.apps.chats.messages.greeting).toBeDefined();
    expect(shellTranslation.apps.textedit.name).toBe(
      fullTranslation.apps.textedit.name
    );
    expect(Object.keys(shellTranslation.apps.textedit)).toEqual([
      "name",
      "description",
    ]);
  });

  test("is materially smaller than the complete catalog", () => {
    const fullBytes = readFileSync(
      path.join(ROOT, "src/lib/locales/en/translation.json")
    ).byteLength;
    const shellBytes = readFileSync(
      path.join(ROOT, "src/lib/locales/en/shell.json")
    ).byteLength;
    expect(shellBytes).toBeLessThan(fullBytes * 0.5);
  });

  test("hydrates full locale copy before a lazy app renders", () => {
    const lazyLoader = readFileSync(
      path.join(ROOT, "src/config/lazyAppComponent.tsx"),
      "utf8"
    );
    expect(lazyLoader).toContain("ensureCurrentLanguageResources()");
    expect(lazyLoader).toContain("Promise.all");
  });
});
