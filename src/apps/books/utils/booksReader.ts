import type {
  BooksReaderSettings,
  BooksThemeOverride,
} from "@/stores/useBooksStore";

export interface BookFontOption {
  id: string;
  label: string;
  /**
   * CSS font-family stack to force on the book body, or null to keep the
   * publisher's original fonts.
   */
  cssStack: string | null;
}

/** Reading fonts offered in the View menu. */
export const BOOK_FONTS: BookFontOption[] = [
  { id: "original", label: "Original", cssStack: null },
  {
    id: "eb-garamond",
    label: "EB Garamond",
    cssStack: '"EB Garamond", Georgia, "Times New Roman", serif',
  },
  {
    id: "serif",
    label: "Serif",
    cssStack: 'Georgia, "Times New Roman", "AppleGaramond", serif',
  },
  {
    id: "sans",
    label: "Sans Serif",
    cssStack:
      '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "geneva",
    label: "Geneva",
    cssStack: '"Geneva-12", Geneva, Helvetica, sans-serif',
  },
  { id: "mono", label: "Monospace", cssStack: '"Monaco", "Courier New", monospace' },
];

export function getBookFont(fontId: string): BookFontOption {
  return BOOK_FONTS.find((f) => f.id === fontId) ?? BOOK_FONTS[0];
}

export interface ReadingPalette {
  background: string;
  text: string;
  /** Link color. */
  link: string;
  /** Whether this is a dark palette (used for chrome around the page). */
  isDark: boolean;
}

const PALETTES: Record<Exclude<BooksThemeOverride, "auto">, ReadingPalette> = {
  light: {
    background: "#fdfdfb",
    text: "#1c1c1c",
    link: "#1d4ed8",
    isDark: false,
  },
  sepia: {
    background: "#f4ecd8",
    text: "#5b4636",
    link: "#8a5a2b",
    isDark: false,
  },
  dark: {
    background: "#1b1b1d",
    text: "#d6d6d6",
    link: "#7fabff",
    isDark: true,
  },
};

/** Resolve the active reading palette from settings + OS dark mode. */
export function resolveReadingPalette(
  themeOverride: BooksThemeOverride,
  osIsDark: boolean
): ReadingPalette {
  if (themeOverride === "auto") {
    return osIsDark ? PALETTES.dark : PALETTES.light;
  }
  return PALETTES[themeOverride];
}

/**
 * Build the epub.js theme object applied to the book body. Returns a nested
 * CSS-in-JS object understood by epub.js Themes.
 */
export function buildEpubTheme(
  settings: BooksReaderSettings,
  palette: ReadingPalette
): Record<string, Record<string, string>> {
  const font = getBookFont(settings.fontId);
  const fontFamily = font.cssStack ? `${font.cssStack} !important` : null;

  const bodyRules: Record<string, string> = {
    background: `${palette.background} !important`,
    color: `${palette.text} !important`,
    "line-height": `${settings.lineHeight} !important`,
    "padding-top": "0 !important",
    "padding-bottom": "0 !important",
  };
  if (fontFamily) {
    bodyRules["font-family"] = fontFamily;
  }

  const withFont = (rules: Record<string, string>): Record<string, string> => {
    if (fontFamily) {
      return { ...rules, "font-family": fontFamily };
    }
    return rules;
  };

  const textColor: Record<string, string> = {
    color: `${palette.text} !important`,
  };

  return {
    body: bodyRules,
    // Force colors so dark/sepia modes are legible regardless of publisher CSS.
    p: withFont(textColor),
    div: withFont({}),
    span: withFont({}),
    li: withFont(textColor),
    h1: withFont(textColor),
    h2: withFont(textColor),
    h3: withFont(textColor),
    h4: withFont(textColor),
    h5: withFont(textColor),
    h6: withFont(textColor),
    a: { color: `${palette.link} !important` },
    "::selection": {
      background: palette.isDark
        ? "rgba(127,171,255,0.35)"
        : "rgba(0,0,0,0.18)",
    },
  };
}

/**
 * @font-face CSS injected into every section iframe so custom reading fonts
 * (EB Garamond is loaded from the app origin) resolve inside the book.
 */
export function buildFontFaceCss(origin: string): string {
  return `
@font-face {
  font-family: "EB Garamond";
  src: url("${origin}/fonts/EBGaramond-Latin.woff2") format("woff2");
  font-weight: 400 800;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "EB Garamond";
  src: url("${origin}/fonts/EBGaramond-Italic-Latin.woff2") format("woff2");
  font-weight: 400 800;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Geneva-12";
  src: url("${origin}/fonts/geneva-12.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "AppleGaramond";
  src: url("${origin}/fonts/AppleGaramond-Light.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
`.trim();
}

/** Map the column-mode setting to an epub.js spread value. */
export function columnModeToSpread(
  columnMode: BooksReaderSettings["columnMode"]
): "none" | "auto" | "always" {
  switch (columnMode) {
    case "single":
      return "none";
    case "double":
      return "always";
    case "auto":
    default:
      return "auto";
  }
}

/** Deterministic pastel-ish spine color for a fallback cover, from a string. */
export function colorFromString(input: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const bg = `hsl(${hue}, 45%, 38%)`;
  const fg = "#f5f1e6";
  return { bg, fg };
}
