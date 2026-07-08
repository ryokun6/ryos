import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BOOKS_SETTINGS,
  isBooksCustomHexColor,
  normalizeBooksCustomColor,
} from "../../../src/stores/useBooksStore";
import {
  buildAccentReadingPalette,
  buildCustomReadingPalette,
  buildEpubImageRules,
  buildEpubTheme,
  getReadingOverlayBackground,
  resolveReadingPalette,
} from "../../../src/apps/books/utils/booksReader";
import {
  deriveAccentPagePalette,
  resolveAccentBaseHex,
} from "../../../src/themes/accents";

describe("Books custom color normalization", () => {
  test("accepts #rgb and #rrggbb hex colors only", () => {
    expect(isBooksCustomHexColor("#abc")).toBe(true);
    expect(isBooksCustomHexColor("#A1B2C3")).toBe(true);
    expect(isBooksCustomHexColor("papayawhip")).toBe(false);
    expect(isBooksCustomHexColor("#ab")).toBe(false);
    expect(isBooksCustomHexColor("#abcd")).toBe(false);
    expect(isBooksCustomHexColor(0x112233)).toBe(false);
    expect(isBooksCustomHexColor(undefined)).toBe(false);
  });

  test("normalizes to lowercase #rrggbb and falls back on garbage", () => {
    expect(normalizeBooksCustomColor("#A1B2C3", "#000000")).toBe("#a1b2c3");
    expect(normalizeBooksCustomColor("#1fA", "#000000")).toBe("#11ffaa");
    expect(normalizeBooksCustomColor(" #abc ", "#000000")).toBe("#aabbcc");
    expect(normalizeBooksCustomColor("red", "#123456")).toBe("#123456");
    expect(normalizeBooksCustomColor(null, "#123456")).toBe("#123456");
  });
});

describe("Books custom reading palette", () => {
  test("uses the picked colors and derives darkness from the background", () => {
    const light = buildCustomReadingPalette(
      {
        customThemeBackground: "#f2e8d8",
        customThemeText: "#30281c",
        customThemeTransparent: false,
      },
      true // OS dark mode must not matter for an opaque background
    );
    expect(light).toEqual({
      background: "#f2e8d8",
      text: "#30281c",
      link: "#1d4ed8",
      isDark: false,
    });

    const dark = buildCustomReadingPalette(
      {
        customThemeBackground: "#101820",
        customThemeText: "#dfe8f2",
        customThemeTransparent: false,
      },
      false
    );
    expect(dark.isDark).toBe(true);
    expect(dark.link).toBe("#7fabff");
  });

  test("transparent background keeps the text color and follows OS dark mode", () => {
    const base = {
      customThemeBackground: "#f2e8d8",
      customThemeText: "#30281c",
      customThemeTransparent: true,
    };
    const inLight = buildCustomReadingPalette(base, false);
    const inDark = buildCustomReadingPalette(base, true);

    expect(inLight.background).toBe("transparent");
    expect(inLight.text).toBe("#30281c");
    expect(inLight.isDark).toBe(false);
    expect(inDark.background).toBe("transparent");
    expect(inDark.isDark).toBe(true);
  });

  test("resolveReadingPalette routes the custom override through settings", () => {
    const palette = resolveReadingPalette(
      {
        themeOverride: "custom",
        customThemeBackground: "#101820",
        customThemeText: "#dfe8f2",
        customThemeTransparent: false,
      },
      false
    );
    expect(palette.background).toBe("#101820");
    expect(palette.text).toBe("#dfe8f2");

    const auto = resolveReadingPalette(
      { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "auto" },
      true
    );
    expect(auto.isDark).toBe(true);
  });

  test("opaque overlays fall back to the window surface when transparent", () => {
    const transparent = resolveReadingPalette(
      { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "custom", customThemeTransparent: true },
      false
    );
    expect(getReadingOverlayBackground(transparent)).toBe(
      "var(--os-color-window-bg)"
    );

    const opaque = resolveReadingPalette(
      { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "sepia" },
      false
    );
    expect(getReadingOverlayBackground(opaque)).toBe("#f4ecd8");
  });

  test("buildEpubTheme forces the transparent background on html and body", () => {
    const settings = {
      ...DEFAULT_BOOKS_SETTINGS,
      themeOverride: "custom" as const,
      customThemeTransparent: true,
    };
    const palette = resolveReadingPalette(settings, false);
    const theme = buildEpubTheme(settings, palette);

    expect(theme.html.background).toBe("transparent !important");
    expect(theme.body.background).toBe("transparent !important");
    expect(theme.body.color).toBe("#1c1c1c !important");
  });
});

describe("Books image blending", () => {
  const IMAGE_SELECTOR = "img, svg, image";

  test("light palettes multiply-blend white image backgrounds into the page", () => {
    const palette = resolveReadingPalette(
      { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "sepia" },
      false
    );
    const rules = buildEpubImageRules(palette);
    expect(rules[IMAGE_SELECTOR]["mix-blend-mode"]).toBe(
      "multiply !important"
    );
    expect(rules[IMAGE_SELECTOR].filter).toBe("none !important");
  });

  test("dark palettes dim images instead of multiplying them to black", () => {
    const palette = resolveReadingPalette(
      { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "dark" },
      false
    );
    const rules = buildEpubImageRules(palette);
    expect(rules[IMAGE_SELECTOR]["mix-blend-mode"]).toBe("normal !important");
    expect(rules[IMAGE_SELECTOR].filter).toContain("brightness");
  });

  test("auto theme follows OS dark mode for image treatment", () => {
    const settings = { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "auto" as const };
    const lightRules = buildEpubImageRules(
      resolveReadingPalette(settings, false)
    );
    const darkRules = buildEpubImageRules(
      resolveReadingPalette(settings, true)
    );
    expect(lightRules[IMAGE_SELECTOR]["mix-blend-mode"]).toBe(
      "multiply !important"
    );
    expect(darkRules[IMAGE_SELECTOR].filter).toContain("brightness");
  });

  test("buildEpubTheme includes the image rules for the active palette", () => {
    const settings = { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "paper" as const };
    const palette = resolveReadingPalette(settings, false);
    const theme = buildEpubTheme(settings, palette);
    expect(theme[IMAGE_SELECTOR]).toEqual(
      buildEpubImageRules(palette)[IMAGE_SELECTOR]
    );

    const darkSettings = { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "night" as const };
    const darkPalette = resolveReadingPalette(darkSettings, false);
    const darkTheme = buildEpubTheme(darkSettings, darkPalette);
    expect(darkTheme[IMAGE_SELECTOR]["mix-blend-mode"]).toBe(
      "normal !important"
    );
  });
});

describe("Books accent reading palette", () => {
  test("derives a light tinted page from the accent base", () => {
    const palette = buildAccentReadingPalette("#2765ca", false);
    const expected = deriveAccentPagePalette("#2765ca", false);

    expect(palette.background).toBe(expected.background);
    expect(palette.text).toBe(expected.text);
    expect(palette.link).toBe(expected.link);
    expect(palette.isDark).toBe(false);
    // Page wash is lighter than the accent seed.
    expect(palette.background).not.toBe("#2765ca");
  });

  test("derives a dark tinted page when the OS is dark", () => {
    const palette = buildAccentReadingPalette("#d23b30", true);
    expect(palette.isDark).toBe(true);
    expect(palette.background).toBe(deriveAccentPagePalette("#d23b30", true).background);
  });

  test("resolveReadingPalette routes the accent override through the seed", () => {
    const seed = resolveAccentBaseHex("aqua", "purple");
    const palette = resolveReadingPalette(
      { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "accent" },
      false,
      seed
    );
    expect(palette).toEqual(buildAccentReadingPalette(seed, false));
  });

  test("falls back to classic Aqua blue when no seed is provided", () => {
    const palette = resolveReadingPalette(
      { ...DEFAULT_BOOKS_SETTINGS, themeOverride: "accent" },
      false
    );
    expect(palette).toEqual(buildAccentReadingPalette("#2765ca", false));
  });
});
