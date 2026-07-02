import {
  clampBooksLineHeight,
  normalizeBooksCustomColor,
  type BooksReaderSettings,
  type BooksThemeOverride,
} from "@/stores/useBooksStore";
import {
  DEFAULT_ACCENT,
  deriveAccentPagePalette,
  getAccentChrome,
  resolveAccentBaseHex,
  type AccentId,
} from "@/themes/accents";
import type { OsThemeId } from "@/themes/types";
import { detectLanguageFromLocale } from "@/lib/languageConfig";
import { resolveEffectiveTextLayout } from "./booksLanguage";

const BOOK_SERIF_LATIN_FALLBACKS =
  '"Iowan Old Style", "Palatino", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif';

const BOOK_SANS_LATIN_STACK = '"Helvetica Neue", Helvetica, Arial';

/** Prefer system monospaces for body reading; classic Monaco is a later fallback. */
const BOOK_MONO_LATIN_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono"';

const BOOK_ROUNDED_STACK =
  '"ryOS VAG Rounded", "Chiron GoRound TC WS", "Hiragino Maru Gothic ProN", "Nanum Gothic", "Yuanti SC", ui-rounded, sans-serif';

const VERTICAL_BOOK_LINE_HEIGHT_MIN = 1.8;

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
 * CJK sans stacks mirror the macOS Aqua UI stack: Hiragino Sans / Hiragino
 * Sans GB before PingFang. Simplified Chinese deliberately omits Hiragino
 * Sans (JP glyph forms) and starts at Hiragino Sans GB.
 */
const BOOK_CJK_SANS_STACKS = {
  "zh-CN":
    '"Hiragino Sans GB", "PingFang SC", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", SimSun, "Apple SD Gothic Neo", "Malgun Gothic"',
  "zh-TW":
    '"Hiragino Sans", "Hiragino Sans GB", "PingFang TC", "Heiti TC", "LiHei Pro", "Microsoft JhengHei", "Noto Sans CJK TC", "Noto Sans TC", PMingLiU, "PingFang SC"',
  ja: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Hiragino Kaku Gothic Pro", "Yu Gothic", "Hiragino Sans GB", "PingFang SC", "Noto Sans CJK JP", "Noto Sans JP"',
  ko: '"Apple SD Gothic Neo", "AppleGothic", "Malgun Gothic", "Nanum Gothic", "Hiragino Sans", "Hiragino Sans GB", "PingFang SC", "Noto Sans CJK KR", "Noto Sans KR"',
} as const;

const DEFAULT_BOOK_CJK_SANS_STACK =
  '"Hiragino Sans", "Hiragino Sans GB", "Hiragino Kaku Gothic ProN", "PingFang SC", "PingFang TC", "Heiti SC", "Microsoft YaHei", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK SC", "Noto Sans SC"';

/**
 * True monospaced CJK faces when installed. Most machines lack these, so
 * `buildBookMonoStack` also appends the OS CJK sans stack (Hiragino / PingFang)
 * rather than ending on Courier.
 */
const BOOK_CJK_MONO_STACKS = {
  "zh-CN":
    '"Noto Sans Mono CJK SC", "Source Han Mono SC", "Sarasa Mono SC"',
  "zh-TW":
    '"Noto Sans Mono CJK TC", "Source Han Mono TC", "Sarasa Mono TC"',
  ja: '"Osaka-Mono", "MS Gothic", "Noto Sans Mono CJK JP", "Source Han Mono JP"',
  ko: '"Noto Sans Mono CJK KR", "Source Han Mono KR", "D2Coding"',
} as const;

const DEFAULT_BOOK_CJK_MONO_STACK =
  '"Osaka-Mono", "MS Gothic", "Noto Sans Mono CJK JP", "Noto Sans Mono CJK SC", "Noto Sans Mono CJK TC", "Noto Sans Mono CJK KR", "Source Han Mono"';

type BookCjkLanguage = keyof typeof BOOK_CJK_SERIF_STACKS;

function resolveBookCjkLanguage(
  language?: string | null
): BookCjkLanguage | null {
  if (!language) return null;
  const resolvedLanguage = detectLanguageFromLocale(language);
  switch (resolvedLanguage) {
    case "zh-CN":
    case "zh-TW":
    case "ko":
    case "ja":
      return resolvedLanguage;
    default:
      return null;
  }
}

/**
 * Resolve locale-specific CJK serif fallbacks. Simplified Chinese must prefer
 * SC glyph families; otherwise a JP-first stack can render mainland forms with
 * Japanese glyph variants.
 */
export function resolveBookCjkSerifStack(
  language?: string | null
): string {
  const resolvedLanguage = resolveBookCjkLanguage(language);
  return resolvedLanguage
    ? BOOK_CJK_SERIF_STACKS[resolvedLanguage]
    : DEFAULT_BOOK_CJK_SERIF_STACK;
}

/**
 * Resolve locale-specific CJK sans fallbacks (Hiragino before PingFang; no
 * Hiragino Sans for Simplified Chinese).
 */
export function resolveBookCjkSansStack(
  language?: string | null
): string {
  const resolvedLanguage = resolveBookCjkLanguage(language);
  return resolvedLanguage
    ? BOOK_CJK_SANS_STACKS[resolvedLanguage]
    : DEFAULT_BOOK_CJK_SANS_STACK;
}

/** Resolve locale-specific monospaced CJK fallbacks. */
export function resolveBookCjkMonoStack(
  language?: string | null
): string {
  const resolvedLanguage = resolveBookCjkLanguage(language);
  return resolvedLanguage
    ? BOOK_CJK_MONO_STACKS[resolvedLanguage]
    : DEFAULT_BOOK_CJK_MONO_STACK;
}

function buildBookSerifStack(
  primaryFonts: string,
  language?: string | null
): string {
  return `${primaryFonts}, ${resolveBookCjkSerifStack(language)}, ${BOOK_SERIF_LATIN_FALLBACKS}`;
}

function buildBookSansStack(language?: string | null): string {
  return `${BOOK_SANS_LATIN_STACK}, ${resolveBookCjkSansStack(language)}, sans-serif`;
}

function buildBookGenevaStack(language?: string | null): string {
  return `"Geneva-12", Geneva, "ArkPixel", ${resolveBookCjkSansStack(language)}, "SerenityOS-Emoji", system-ui, -apple-system, sans-serif`;
}

function buildBookMonoStack(language?: string | null): string {
  // Latin mono → optional monospaced CJK → OS CJK sans (region-correct
  // glyphs when no CJK mono is installed) → ubiquitous mono fallbacks.
  return `${BOOK_MONO_LATIN_STACK}, ${resolveBookCjkMonoStack(language)}, ${resolveBookCjkSansStack(language)}, "Courier New", monospace`;
}

export type BookFontId =
  | "original"
  | "eb-garamond"
  | "serif"
  | "sans"
  | "geneva"
  | "rounded"
  | "mono";

export interface BookFontOption {
  id: BookFontId;
  /**
   * CSS font-family stack to force on the book body, or null to keep the
   * publisher's original fonts.
   */
  cssStack: string | null;
}

/** Reading fonts offered in the View menu / Customize panel. */
export const BOOK_FONTS: BookFontOption[] = [
  { id: "original", cssStack: null },
  {
    id: "serif",
    cssStack: buildBookSerifStack('"Charter"'),
  },
  {
    id: "sans",
    cssStack: buildBookSansStack(),
  },
  {
    id: "rounded",
    cssStack: BOOK_ROUNDED_STACK,
  },
  {
    id: "mono",
    cssStack: buildBookMonoStack(),
  },
  {
    id: "eb-garamond",
    cssStack: buildBookSerifStack('"EB Garamond", "Charter"'),
  },
  {
    id: "geneva",
    cssStack: buildBookGenevaStack(),
  },
];

export function getBookFont(fontId: string): BookFontOption {
  return BOOK_FONTS.find((f) => f.id === fontId) ?? BOOK_FONTS[0];
}

/** Resolve a reading font stack, including locale-specific CJK faces. */
export function getBookFontCssStack(
  fontId: string,
  language?: string | null
): string | null {
  const font = getBookFont(fontId);
  switch (font.id) {
    case "eb-garamond":
      return buildBookSerifStack('"EB Garamond", "Charter"', language);
    case "serif":
      return buildBookSerifStack('"Charter"', language);
    case "sans":
      return buildBookSansStack(language);
    case "geneva":
      return buildBookGenevaStack(language);
    case "mono":
      return buildBookMonoStack(language);
    default:
      return font.cssStack;
  }
}

export interface ReadingPalette {
  background: string;
  text: string;
  /** Link color. */
  link: string;
  /** Whether this is a dark palette (used for chrome around the page). */
  isDark: boolean;
}

export type BooksThemePresetId = Exclude<
  BooksThemeOverride,
  "auto" | "accent" | "custom"
>;

const PALETTES: Record<BooksThemePresetId, ReadingPalette> = {
  light: {
    background: "#fdfdfb",
    text: "#1c1c1c",
    link: "#1d4ed8",
    isDark: false,
  },
  paper: {
    background: "#f9f4e9",
    text: "#33302a",
    link: "#2456c4",
    isDark: false,
  },
  sepia: {
    background: "#f4ecd8",
    text: "#5b4636",
    link: "#8a5a2b",
    isDark: false,
  },
  gray: {
    background: "#e4e4e4",
    text: "#262626",
    link: "#1d4ed8",
    isDark: false,
  },
  green: {
    background: "#dcead9",
    text: "#243428",
    link: "#1e6b46",
    isDark: false,
  },
  dark: {
    background: "#1b1b1d",
    text: "#d6d6d6",
    link: "#7fabff",
    isDark: true,
  },
  night: {
    background: "#141e2e",
    text: "#c2cbdb",
    link: "#8ab4ff",
    isDark: true,
  },
  black: {
    background: "#000000",
    text: "#b3b3b3",
    link: "#7fabff",
    isDark: true,
  },
};

/**
 * Reading color presets in display order (light pages first, then dark), used
 * by the Customize panel's color swatches.
 */
export const BOOK_THEME_PRESET_IDS: readonly BooksThemePresetId[] = [
  "light",
  "paper",
  "sepia",
  "gray",
  "green",
  "dark",
  "night",
  "black",
];

/** Palette for a specific (non-auto) reading theme preset. */
export function getReadingPalette(preset: BooksThemePresetId): ReadingPalette {
  return PALETTES[preset];
}

/** Perceived brightness (0..1) of a #rgb / #rrggbb hex color. */
function hexBrightness(hex: string): number {
  const normalized = normalizeBooksCustomColor(hex, "#ffffff");
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Settings slice needed to resolve the active reading palette. */
export type BooksPaletteSettings = Pick<
  BooksReaderSettings,
  | "themeOverride"
  | "customThemeBackground"
  | "customThemeText"
  | "customThemeTransparent"
>;

/**
 * Palette for the user's custom theme. A transparent background lets the
 * window material (e.g. Aqua Glass) show through, so the surrounding chrome
 * follows the OS dark-mode setting instead of the (hidden) background color.
 */
export function buildCustomReadingPalette(
  settings: Pick<
    BooksPaletteSettings,
    "customThemeBackground" | "customThemeText" | "customThemeTransparent"
  >,
  osIsDark: boolean
): ReadingPalette {
  const background = normalizeBooksCustomColor(
    settings.customThemeBackground,
    PALETTES.light.background
  );
  const text = normalizeBooksCustomColor(
    settings.customThemeText,
    PALETTES.light.text
  );
  const isDark = settings.customThemeTransparent
    ? osIsDark
    : hexBrightness(background) < 0.5;
  return {
    background: settings.customThemeTransparent ? "transparent" : background,
    text,
    link: isDark ? PALETTES.dark.link : PALETTES.light.link,
    isDark,
  };
}

/**
 * Background for overlays that must visually cover the page (page-flip sheet,
 * loading shim, cover zoom). A transparent reading background can't hide the
 * content behind those overlays, so fall back to the window surface color
 * (which is itself translucent under Aqua Glass, keeping the glassy look).
 */
export function getReadingOverlayBackground(palette: ReadingPalette): string {
  return palette.background === "transparent"
    ? "var(--os-color-window-bg)"
    : palette.background;
}

/**
 * Soft page colors derived from the OS accent. Falls back to the classic Aqua
 * blue seed when no accent base is available (themes without accent chrome).
 */
export function buildAccentReadingPalette(
  accentBaseHex: string | null | undefined,
  osIsDark: boolean
): ReadingPalette {
  const colors = deriveAccentPagePalette(accentBaseHex ?? "#2765ca", osIsDark);
  return {
    ...colors,
    isDark: osIsDark,
  };
}

/** Resolve the live OS accent base hex from theme-store state. */
export function resolveOsAccentBaseHex(state: {
  current: OsThemeId;
  accentByTheme: Partial<Record<OsThemeId, AccentId>>;
  wallpaperAccentColor: string | null;
}): string {
  return resolveAccentBaseHex(
    getAccentChrome(state.current),
    state.accentByTheme[state.current] ?? DEFAULT_ACCENT,
    state.wallpaperAccentColor
  );
}

/** Resolve the active reading palette from settings + OS dark mode. */
export function resolveReadingPalette(
  settings: BooksPaletteSettings,
  osIsDark: boolean,
  /** Solid OS accent base, required for the `"accent"` theme override. */
  accentBaseHex?: string | null
): ReadingPalette {
  const { themeOverride } = settings;
  if (themeOverride === "auto") {
    return osIsDark ? PALETTES.dark : PALETTES.light;
  }
  if (themeOverride === "accent") {
    return buildAccentReadingPalette(accentBaseHex, osIsDark);
  }
  if (themeOverride === "custom") {
    return buildCustomReadingPalette(settings, osIsDark);
  }
  return PALETTES[themeOverride] ?? (osIsDark ? PALETTES.dark : PALETTES.light);
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
  display(target?: string): Promise<unknown> | unknown;
  display(target?: number): Promise<unknown> | unknown;
  /**
   * Destroy current views so the next `display()` rebuilds them. Needed for
   * vertical writing mode, which wires its page axis only during construction.
   */
  clear?: () => void;
}

interface EpubSpineSectionLike {
  href?: string;
  index?: number;
}

interface EpubDisplaySpineLike {
  get: (target?: string | number) => EpubSpineSectionLike | null | undefined;
}

interface EpubDisplayBookLike {
  spine?: EpubDisplaySpineLike;
}

export interface DisplayEpubTargetWithFallbackOptions<
  T extends EpubLayoutRendition,
> {
  rendition: T;
  target?: string | number;
  fallbackTarget?: string | number;
  initialTimeoutMs: number;
  fallbackTimeoutMs?: number;
  isActive: () => boolean;
  resetAfterTimeout?: () => T | null | Promise<T | null>;
  onTimeout?: () => void;
}

export type DisplayEpubTargetWithFallbackResult<
  T extends EpubLayoutRendition,
> =
  | { status: "displayed"; rendition: T; target?: string | number }
  | { status: "fallback-displayed"; rendition: T; target?: string | number }
  | { status: "inactive"; rendition: T; target?: string | number };

async function displayEpubTargetWithTimeout<T extends EpubLayoutRendition>(
  rendition: T,
  target: string | number | undefined,
  timeoutMs: number
): Promise<"displayed" | "timeout"> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutId = globalThis.setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => callEpubDisplay(rendition, target))
        .then(() => "displayed" as const),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

function callEpubDisplay(
  rendition: EpubLayoutRendition,
  target?: string | number
): Promise<unknown> | unknown {
  return typeof target === "number"
    ? rendition.display(target)
    : rendition.display(target);
}

export function resolveEpubDisplayFallbackTarget(
  book: EpubDisplayBookLike,
  target?: string | number
): string | number | undefined {
  if (target === undefined) return undefined;
  const section = book.spine?.get(target);
  if (!section) return undefined;
  return section.href || section.index;
}

export async function displayEpubTargetWithFallback<
  T extends EpubLayoutRendition,
>({
  rendition,
  target,
  fallbackTarget,
  initialTimeoutMs,
  fallbackTimeoutMs = initialTimeoutMs,
  isActive,
  resetAfterTimeout,
  onTimeout,
}: DisplayEpubTargetWithFallbackOptions<T>): Promise<
  DisplayEpubTargetWithFallbackResult<T>
> {
  const initialResult = await displayEpubTargetWithTimeout(
    rendition,
    target,
    initialTimeoutMs
  );
  if (initialResult === "displayed") {
    return { status: "displayed", rendition, target };
  }
  if (!isActive()) return { status: "inactive", rendition, target };

  onTimeout?.();
  const fallbackRendition = (await resetAfterTimeout?.()) ?? rendition;
  if (!fallbackRendition) {
    throw new Error("EPUB display timed out and no fallback rendition exists");
  }
  if (!isActive()) {
    return {
      status: "inactive",
      rendition: fallbackRendition,
      target: fallbackTarget,
    };
  }

  const fallbackResult = await displayEpubTargetWithTimeout(
    fallbackRendition,
    fallbackTarget,
    fallbackTimeoutMs
  );
  if (fallbackResult === "timeout") {
    throw new Error("EPUB fallback display timed out");
  }
  if (!isActive()) {
    return {
      status: "inactive",
      rendition: fallbackRendition,
      target: fallbackTarget,
    };
  }
  return {
    status: "fallback-displayed",
    rendition: fallbackRendition,
    target: fallbackTarget,
  };
}

interface ReflowEpubAfterFontsSettleOptions {
  fontsReady: Promise<unknown> | undefined;
  rendition: EpubLayoutRendition;
  spread: "none" | "auto" | "always";
  minSpreadWidth: number;
  target?: string | number;
  displayTimeoutMs?: number;
  isActive: () => boolean;
  /**
   * Destroy and recreate views after fonts settle. Vertical writing mode wires
   * its page axis only during view construction; an in-place `spread`/`format`
   * pass (and `resize` at the same host size, which epub.js no-ops) leaves the
   * broken first layout in place. A manual window resize recovers only because
   * the size change forces that clear+rebuild path.
   */
  rebuildViews?: boolean;
}

/**
 * epub.js performs its first paginated layout before rendition content hooks
 * inject ryOS fonts (and before vertical writing-mode can influence the page
 * axis). Recalculate after those settle, then restore the requested CFI.
 */
export async function reflowEpubAfterFontsSettle({
  fontsReady,
  rendition,
  spread,
  minSpreadWidth,
  target,
  displayTimeoutMs,
  isActive,
  rebuildViews = false,
}: ReflowEpubAfterFontsSettleOptions): Promise<boolean> {
  if (!fontsReady) return false;
  await fontsReady;
  if (!isActive()) return false;

  // Vertical pagination disables facing-page spreads; force that before a
  // rebuild so updateLayout does not size half-width columns.
  rendition.spread(rebuildViews ? "none" : spread, minSpreadWidth);
  if (!isActive()) return false;

  if (rebuildViews) {
    // `resize(w, h)` early-returns when the stage size is unchanged, so it
    // cannot be used to recover a broken first layout at the same host size.
    // Clearing forces the next `display()` to construct views from scratch.
    rendition.clear?.();
    if (!isActive()) return false;
  }

  if (displayTimeoutMs !== undefined) {
    const displayResult = await displayEpubTargetWithTimeout(
      rendition,
      target,
      displayTimeoutMs
    );
    return displayResult === "displayed" && isActive();
  }

  await callEpubDisplay(rendition, target);
  return isActive();
}

export type EpubThemeRules = Record<string, Record<string, string>>;

/**
 * Serialize theme rules for epub.js `registerCss`. Unlike `themes.default(rules)`,
 * `registerCss` replaces the injected stylesheet instead of appending rules.
 */
export function serializeEpubThemeRules(rules: EpubThemeRules): string {
  return Object.entries(rules)
    .map(([selector, declarations]) => {
      const body = Object.entries(declarations)
        .map(([property, value]) => `${property}:${value};`)
        .join("");
      return `${selector}{${body}}`;
    })
    .join("\n");
}

/**
 * Apply a reading theme by fully replacing the injected default stylesheet.
 *
 * epub.js's `themes.default(rules)` uses `addStylesheetRules`, which only
 * appends `insertRule` entries. After a custom reading font is applied,
 * switching back to Original omits `font-family` from the new rules — but the
 * previous `font-family: … !important` declarations stay in the stylesheet and
 * keep winning. `registerCss` wipes that style element via `innerHTML`.
 */
export function applyEpubTheme(
  themes: { registerCss: (name: string, css: string) => void },
  rules: EpubThemeRules
): void {
  themes.registerCss("default", serializeEpubThemeRules(rules));
}

/**
 * Build the epub.js theme object applied to the book body. Returns a nested
 * CSS-in-JS object understood by epub.js Themes.
 */
export function buildEpubTheme(
  settings: BooksReaderSettings,
  palette: ReadingPalette,
  language?: string | null,
  /**
   * EPUB package language used to gate vertical layout. Defaults to `language`
   * so callers that already pass the book language keep working. Do not pass the
   * UI locale here — unknown/Latin books must not activate vertical styles.
   */
  bookLanguage: string | null | undefined = language
): EpubThemeRules {
  const fontStack = getBookFontCssStack(settings.fontId, language);
  const fontFamily = fontStack ? `${fontStack} !important` : null;
  const isVerticalText =
    resolveEffectiveTextLayout(settings.textLayout, bookLanguage) ===
    "vertical";
  const baseLineHeight = clampBooksLineHeight(settings.lineHeight);
  const lineHeight = isVerticalText
    ? Math.max(baseLineHeight, VERTICAL_BOOK_LINE_HEIGHT_MIN)
    : baseLineHeight;
  const lineHeightRule = {
    "line-height": `${lineHeight} !important`,
  };

  // Physical left alignment and hyphenation are horizontal-reading choices.
  // In vertical mode they fight the top-to-bottom inline flow and CJK line
  // breaking, so preserve only the column-break controls. Vertical columns
  // also need a wider line-height floor than horizontal prose.
  //
  // The line-height rule is part of the reading flow in BOTH modes: applying
  // it only on `body` is not enough, because publisher rules on `p`/`li`/`div`
  // beat inherited values, leaving the Line Spacing setting without effect.
  const readingFlow: Record<string, string> =
    isVerticalText
      ? {
          ...lineHeightRule,
          orphans: "2",
          widows: "2",
        }
      : {
          ...lineHeightRule,
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
    ...lineHeightRule,
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

  // Paragraph/list rules also apply the active reading-flow policy so
  // publisher CSS on `p`/`li` cannot reintroduce horizontal-only formatting.
  const flowText: Record<string, string> = { ...textColor, ...readingFlow };

  return {
    // A transparent reading background only works when the publisher's own
    // root background can't paint over it (iframes are transparent by
    // default, but EPUB CSS often sets `html { background: … }`).
    html: { background: `${palette.background} !important` },
    body: bodyRules,
    // Catch-all: force the reading color on EVERY element except links, so no
    // publisher rule (incl. colors on span/div/blockquote/table cells, etc.)
    // can leave text dark-on-dark. Inline `color` styles are also stripped in
    // the content hook so even `color: … !important` inline can't win.
    "*:not(a)": { color: `${palette.text} !important` },
    // Force colors so dark/sepia modes are legible regardless of publisher CSS.
    p: withFont(flowText),
    div: withFont(lineHeightRule),
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
  font-family: "ryOS VAG Rounded";
  src: url("${origin}/fonts/vag-rounded-light.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "ryOS VAG Rounded";
  src: url("${origin}/fonts/vag-rounded-bold.woff2") format("woff2");
  font-weight: 700;
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
