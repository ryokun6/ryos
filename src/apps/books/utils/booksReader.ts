import type {
  BooksReaderSettings,
  BooksThemeOverride,
} from "@/stores/useBooksStore";
import { detectLanguageFromLocale } from "@/lib/languageConfig";

const BOOK_SERIF_LATIN_FALLBACKS =
  '"Iowan Old Style", "Palatino", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif';

const BOOK_GENEVA_STACK =
  '"Geneva-12", Geneva, "ArkPixel", "SerenityOS-Emoji", system-ui, -apple-system, sans-serif';

const BOOK_ROUNDED_STACK =
  '"VAGRounded", "Chiron GoRound TC WS", "Hiragino Maru Gothic ProN", "Nanum Gothic", "Yuanti SC", "SerenityOS-Emoji", ui-rounded, sans-serif';

const BOOK_CJK_SERIF_STACKS = {
  "zh-CN":
    '"Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", STSong, SimSun, "Noto Serif JP", "Source Han Serif JP", "Noto Serif KR", "Source Han Serif KR"',
  "zh-TW":
    '"Noto Serif TC", "Source Han Serif TC", "Noto Serif CJK TC", "Songti TC", PMingLiU, MingLiU, "Noto Serif JP", "Source Han Serif JP", "Noto Serif SC", "Source Han Serif SC"',
  ja: '"Noto Serif JP", "Source Han Serif JP", "Noto Serif CJK JP", "Source Han Serif", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Yu Mincho", "Noto Serif SC", "Source Han Serif SC", "Noto Serif KR", "Source Han Serif KR"',
  ko: '"Noto Serif KR", "Source Han Serif KR", "Noto Serif CJK KR", "Nanum Myeongjo", "AppleMyungjo", Batang, "Noto Serif JP", "Source Han Serif JP", "Noto Serif SC", "Source Han Serif SC"',
} as const;

const DEFAULT_BOOK_CJK_SERIF_STACK = `${BOOK_CJK_SERIF_STACKS.ja}, "Noto Serif TC", "Source Han Serif TC", "Noto Serif CJK SC", "Songti TC", "Songti SC", SimSun`;

/**
 * Resolve locale-specific CJK serif fallbacks. Simplified Chinese must prefer
 * SC glyph families; otherwise a JP-first stack can render mainland forms with
 * Japanese glyph variants.
 */
export function resolveBookCjkSerifStack(
  language?: string | null
): string {
  const resolvedLanguage = language
    ? detectLanguageFromLocale(language)
    : null;

  switch (resolvedLanguage) {
    case "zh-CN":
      return BOOK_CJK_SERIF_STACKS["zh-CN"];
    case "zh-TW":
      return BOOK_CJK_SERIF_STACKS["zh-TW"];
    case "ko":
      return BOOK_CJK_SERIF_STACKS.ko;
    case "ja":
      return BOOK_CJK_SERIF_STACKS.ja;
    default:
      return DEFAULT_BOOK_CJK_SERIF_STACK;
  }
}

function buildBookSerifStack(
  primaryFonts: string,
  language?: string | null
): string {
  return `${primaryFonts}, ${resolveBookCjkSerifStack(language)}, ${BOOK_SERIF_LATIN_FALLBACKS}`;
}

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
    cssStack: buildBookSerifStack('"EB Garamond", "Charter"'),
  },
  {
    id: "serif",
    label: "Serif",
    cssStack: buildBookSerifStack('"Charter"'),
  },
  {
    id: "sans",
    label: "Sans Serif",
    cssStack:
      '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "Lucida Grande", Arial, sans-serif',
  },
  {
    id: "geneva",
    label: "Geneva",
    cssStack: BOOK_GENEVA_STACK,
  },
  {
    id: "rounded",
    label: "Rounded",
    cssStack: BOOK_ROUNDED_STACK,
  },
  {
    id: "mono",
    label: "Monospace",
    cssStack: '"Monaco", "Courier New", monospace',
  },
];

export function getBookFont(fontId: string): BookFontOption {
  return BOOK_FONTS.find((f) => f.id === fontId) ?? BOOK_FONTS[0];
}

/** Resolve a reading font stack, including locale-specific CJK serif faces. */
export function getBookFontCssStack(
  fontId: string,
  language?: string | null
): string | null {
  const font = getBookFont(fontId);
  if (font.id === "eb-garamond") {
    return buildBookSerifStack('"EB Garamond", "Charter"', language);
  }
  if (font.id === "serif") {
    return buildBookSerifStack('"Charter"', language);
  }
  return font.cssStack;
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
 * EPUBs are ZIP archives, so a valid file begins with the ZIP magic bytes
 * ("PK" + a local-file / empty / spanned marker). Validate this before handing
 * bytes to epub.js so a stray non-EPUB payload — e.g. a `{"error":"Not found"}`
 * JSON body that got stored as the book blob when a cloud download failed —
 * isn't rendered as the book's content.
 */
export function isLikelyEpubBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const b = new Uint8Array(buffer, 0, 4);
  if (b[0] !== 0x50 || b[1] !== 0x4b) return false; // "PK"
  return (
    (b[2] === 0x03 && b[3] === 0x04) || // local file header (normal zip)
    (b[2] === 0x05 && b[3] === 0x06) || // empty archive
    (b[2] === 0x07 && b[3] === 0x08) // spanned archive
  );
}

interface EpubLayoutRendition {
  spread: (spread: "none" | "auto" | "always", min?: number) => void;
  display: (target?: string) => Promise<unknown> | unknown;
}

interface ReflowEpubAfterFontsSettleOptions {
  fontsReady: Promise<unknown> | undefined;
  rendition: EpubLayoutRendition;
  spread: "none" | "auto" | "always";
  minSpreadWidth: number;
  target?: string;
  isActive: () => boolean;
}

/**
 * epub.js performs its first paginated layout before rendition content hooks
 * inject ryOS fonts. Recalculate the existing view after those fonts settle,
 * then restore the requested CFI against the settled column geometry.
 */
export async function reflowEpubAfterFontsSettle({
  fontsReady,
  rendition,
  spread,
  minSpreadWidth,
  target,
  isActive,
}: ReflowEpubAfterFontsSettleOptions): Promise<boolean> {
  if (!fontsReady) return false;
  await fontsReady;
  if (!isActive()) return false;

  rendition.spread(spread, minSpreadWidth);
  if (!isActive()) return false;

  await rendition.display(target);
  return isActive();
}

/**
 * Build the epub.js theme object applied to the book body. Returns a nested
 * CSS-in-JS object understood by epub.js Themes.
 */
export function buildEpubTheme(
  settings: BooksReaderSettings,
  palette: ReadingPalette,
  language?: string | null
): Record<string, Record<string, string>> {
  const fontStack = getBookFontCssStack(settings.fontId, language);
  const fontFamily = fontStack ? `${fontStack} !important` : null;

  // Left-align with automatic hyphenation reads far better than justified text
  // in a narrow column (justify opens up ugly rivers of whitespace). Applied
  // with !important so it overrides publisher `text-align: justify`. orphans/
  // widows reduce stranded single lines at column breaks.
  const readingFlow: Record<string, string> = {
    "text-align": "left !important",
    "-webkit-hyphens": "auto !important",
    hyphens: "auto !important",
    "-webkit-hyphenate-limit-before": "3",
    "-webkit-hyphenate-limit-after": "3",
    "hyphenate-limit-chars": "6 3 3 !important",
    orphans: "2",
    widows: "2",
  };

  const bodyRules: Record<string, string> = {
    background: `${palette.background} !important`,
    color: `${palette.text} !important`,
    "line-height": `${settings.lineHeight} !important`,
    "padding-top": "0 !important",
    "padding-bottom": "0 !important",
    ...readingFlow,
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

  // Paragraph/list rules also force left-align + hyphenation so publisher CSS
  // on `p`/`li` (commonly `text-align: justify`) can't win the cascade.
  const flowText: Record<string, string> = { ...textColor, ...readingFlow };

  return {
    body: bodyRules,
    // Catch-all: force the reading color on EVERY element except links, so no
    // publisher rule (incl. colors on span/div/blockquote/table cells, etc.)
    // can leave text dark-on-dark. Inline `color` styles are also stripped in
    // the content hook so even `color: … !important` inline can't win.
    "*:not(a)": { color: `${palette.text} !important` },
    // Force colors so dark/sepia modes are legible regardless of publisher CSS.
    p: withFont(flowText),
    div: withFont({}),
    span: withFont({}),
    li: withFont(flowText),
    // Headings keep their original alignment (often intentionally centered) but
    // still take the reading color + font.
    h1: withFont(textColor),
    h2: withFont(textColor),
    h3: withFont(textColor),
    h4: withFont(textColor),
    h5: withFont(textColor),
    h6: withFont(textColor),
    // Links (and anything inside them) stay the distinguishable link color,
    // overriding the catch-all above via higher specificity.
    "a, a *": { color: `${palette.link} !important` },
    "::selection": {
      background: palette.isDark
        ? "rgba(127,171,255,0.35)"
        : "rgba(0,0,0,0.18)",
    },
  };
}

/**
 * Font CSS injected into every section iframe so custom reading fonts resolve
 * inside the book. EPUB sections cannot inherit fonts loaded by the app shell,
 * so Noto's CJK serif families are imported again here.
 */
export function buildFontFaceCss(origin: string): string {
  return `
@import url("https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=Noto+Serif+TC:wght@400;700&display=swap");
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
  font-family: "ArkPixel";
  src: url("${origin}/fonts/fusion-pixel-12px-proportional-ja.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "SerenityOS-Emoji";
  src: url("${origin}/fonts/SerenityOS-Emoji.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "VAGRounded";
  src: url("${origin}/fonts/vag-rounded-100.woff2") format("woff2");
  font-weight: 100;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "VAGRounded";
  src: url("${origin}/fonts/vag-rounded-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "VAGRounded";
  src: url("${origin}/fonts/vag-rounded-700.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "VAGRounded";
  src: url("${origin}/fonts/vag-rounded-900.woff2") format("woff2");
  font-weight: 900;
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
