import { describe, expect, test } from "bun:test";

import { resolveInlineCodePath } from "../scripts/generate-docs";

describe("generate-docs inline code path links", () => {
  test("keeps repo-root test files out of src links", () => {
    expect(
      resolveInlineCodePath("tests/test-help-i18n-alignment.test.ts"),
    ).toEqual({
      fullPath: "tests/test-help-i18n-alignment.test.ts",
      matchedText: "tests/test-help-i18n-alignment.test.ts",
    });
  });

  test("keeps known repo-root folders unchanged", () => {
    expect(resolveInlineCodePath("scripts/generate-docs.ts")).toEqual({
      fullPath: "scripts/generate-docs.ts",
      matchedText: "scripts/generate-docs.ts",
    });
    expect(resolveInlineCodePath("docs/7.2-i18n.md")).toEqual({
      fullPath: "docs/7.2-i18n.md",
      matchedText: "docs/7.2-i18n.md",
    });
  });

  test("resolves app-relative component paths with app context", () => {
    expect(
      resolveInlineCodePath("components/TextEditAppComponent.tsx", "textedit"),
    ).toEqual({
      fullPath: "src/apps/textedit/components/TextEditAppComponent.tsx",
      matchedText: "components/TextEditAppComponent.tsx",
    });
  });

  test("resolves shared src-relative folders without app context", () => {
    expect(resolveInlineCodePath("stores/useLanguageStore.ts")).toEqual({
      fullPath: "src/stores/useLanguageStore.ts",
      matchedText: "stores/useLanguageStore.ts",
    });
  });
});
