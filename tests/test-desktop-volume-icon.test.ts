import { describe, expect, test } from "bun:test";
import { pickIconPath, resolveIconLegacyAware } from "@/utils/icons";

describe("desktop volume icon theming", () => {
  test("macosx theme resolves disk.png to macosx assets", () => {
    expect(pickIconPath("disk.png", { theme: "macosx" })).toBe(
      "/icons/macosx/disk.png"
    );
    expect(resolveIconLegacyAware("disk.png", "macosx")).toBe(
      "/icons/macosx/disk.png"
    );
  });

  test("legacy default disk path re-themes for macosx", () => {
    expect(resolveIconLegacyAware("/icons/default/disk.png", "macosx")).toBe(
      "/icons/macosx/disk.png"
    );
  });
});
