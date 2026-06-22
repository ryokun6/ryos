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
    cssStack:
      '"EB Garamond", "Charter", "Iowan Old Style", "Palatino", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif',
  },
  {
    id: "serif",
    label: "Serif",
    cssStack:
      '"Charter", "Iowan Old Style", "Palatino", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif',
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

export interface EpubContentVisibilitySnapshot {
  textLength: number;
  sampleText: string;
  imageCount: number;
  loadedImageCount: number;
  vectorCount: number;
  mediaCount: number;
  bodyChildCount: number;
  scrollWidth: number;
  scrollHeight: number;
  isBlank: boolean;
}

function getElementArea(element: Element): number {
  try {
    const rect = element.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  } catch {
    return 0;
  }
}

function hasLoadedRasterImage(element: Element): boolean {
  if (element.tagName.toLowerCase() !== "img") return false;
  const image = element as HTMLImageElement;
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

function hasVisibleVectorContent(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName !== "svg") return false;
  return element.childElementCount > 0 && getElementArea(element) > 4;
}

function hasVisibleEmbeddedMedia(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "canvas") {
    const canvas = element as HTMLCanvasElement;
    return canvas.width > 0 && canvas.height > 0;
  }
  if (tagName === "video") {
    const video = element as HTMLVideoElement;
    return video.videoWidth > 0 && video.videoHeight > 0;
  }
  return getElementArea(element) > 4;
}

/**
 * Safari can resolve epub.js display/render events even when the current iframe
 * paints no visible content (commonly a titlepage/cover image section whose
 * raster never decodes). Summarize the rendered section so the reader can move
 * past genuinely blank spine items instead of leaving a white page.
 */
export function getEpubContentVisibilitySnapshot(
  document: Document
): EpubContentVisibilitySnapshot {
  const body = document.body;
  const rawText = (body?.textContent ?? "").replace(/\s+/g, " ").trim();
  const images = Array.from(document.querySelectorAll("img"));
  const loadedImageCount = images.filter(hasLoadedRasterImage).length;
  const vectorCount = Array.from(document.querySelectorAll("svg")).filter(
    hasVisibleVectorContent
  ).length;
  const mediaCount = Array.from(
    document.querySelectorAll("canvas, video, object, embed")
  ).filter(hasVisibleEmbeddedMedia).length;
  const hasVisibleContent =
    rawText.length > 0 || loadedImageCount > 0 || vectorCount > 0 || mediaCount > 0;

  return {
    textLength: rawText.length,
    sampleText: rawText.slice(0, 80),
    imageCount: images.length,
    loadedImageCount,
    vectorCount,
    mediaCount,
    bodyChildCount: body?.childElementCount ?? 0,
    scrollWidth: document.documentElement?.scrollWidth ?? 0,
    scrollHeight: document.documentElement?.scrollHeight ?? 0,
    isBlank: !hasVisibleContent,
  };
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
