import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  Check,
  Copy,
  FastForward,
  Pause,
  Play,
  Rewind,
  SpeakerHigh,
  Stop,
  TextAa,
  Trash,
  X,
} from "@phosphor-icons/react";
import ePub, {
  EpubCFI,
  type Book,
  type Contents,
  type NavItem,
  type Rendition,
} from "epubjs";
import { cn } from "@/lib/utils";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { readBookBlobContent } from "@/services/vfs/FileContentRepository";
import {
  BOOKS_HIGHLIGHT_COLORS,
  BOOKS_HIGHLIGHT_COLOR_HEX,
  clampBooksGutter,
  normalizeBooksSpeechRate,
  type BookBookmark,
  type BookHighlight,
  type BooksHighlightColor,
  type BooksReaderSettings,
} from "@/stores/useBooksStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  applyEpubTheme,
  buildEpubTheme,
  buildFontFaceCss,
  columnModeToSpread,
  createEpubThemeContentHook,
  displayEpubTargetWithFallback,
  getReadingOverlayBackground,
  isLikelyEpubBuffer,
  reflowEpubAfterFontsSettle,
  resolveEpubDisplayFallbackTarget,
  resolveOsAccentBaseHex,
  resolveReadingPalette,
} from "../utils/booksReader";
import {
  normalizeBookLanguage,
  resolveEffectiveChineseScript,
  resolveEffectiveTextLayout,
} from "../utils/booksLanguage";
import {
  applyChineseScriptToDocument,
  createChineseScriptConversionSession,
  resolveChineseScriptReadingLanguage,
} from "../utils/chineseScriptConverter";
import {
  applyEpubTextLayout,
  resolveEpubPageDirection,
} from "../utils/booksTextLayout";
import { sanitizeEpubSectionDocument } from "../utils/booksContentSanitizer";
import {
  BOOKS_SPEECH_HIGHLIGHT_CSS,
  getVisiblePageRange,
} from "../utils/booksSpeech";
import { useBooksSpeech } from "../hooks/useBooksSpeech";
import {
  BOOKS_HIGHLIGHT_CLASS,
  BOOKS_SELECTION_CONTENT_CSS,
  useBooksAnnotations,
} from "../hooks/useBooksAnnotations";
import {
  BOOKS_SPEECH_BAR_AUTO_REVEAL_MS,
  useBooksSpeechBarVisibility,
} from "../hooks/useBooksSpeechBarVisibility";
import {
  createSpeechUtterance,
  getBrowserSpeechSynthesis,
  ryOSLocaleToSpeechLanguage,
} from "@/utils/browserSpeech";
import { useBookCover } from "../utils/useBookCover";
import { BookCover } from "./BookCover";
import type {
  BooksLibraryEntry,
  BookOriginRect,
} from "../hooks/useBooksLogic";
import { createClientLogger } from "@/utils/logger";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { Sounds, useSound } from "@/hooks/useSound";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import {
  BOOKS_EDGE_TAP_RATIO,
  resolveBooksEdgeTapDirection,
} from "../utils/booksEdgeTap";
import { resolveBooksSwipeDirection } from "../utils/booksSwipe";

const booksLog = createClientLogger("BooksReader");

interface BooksReaderPaneProps {
  entry: BooksLibraryEntry;
  settings: BooksReaderSettings;
  osIsDark: boolean;
  /** Page-space rect of the clicked shelf cover, to zoom in from. */
  originRect?: BookOriginRect | null;
  initialCfi?: string;
  /** Cached reading progress (0..1) so the footer shows it without a 0% flash. */
  initialPercentage?: number;
  onProgress: (cfi: string, percentage: number) => void;
  onNavigationStateChange?: (state: BooksNavigationState) => void;
  onSpeechStateChange?: (isSpeaking: boolean) => void;
  /** EPUB metadata language once known (drives CJK-only menus / features). */
  onBookLanguageChange?: (language: string | null) => void;
  /** Opens the reading-appearance Customize panel (playback bar shortcut). */
  onShowCustomize?: () => void;
  /** Closes the reading-appearance Customize panel. */
  onHideCustomize?: () => void;
  /** Keeps the read-aloud toolbar expanded while Customize is open. */
  isCustomizeOpen?: boolean;
  /** Saved text highlights for this book. */
  highlights: BookHighlight[];
  onAddHighlight: (highlight: BookHighlight) => void;
  onSetHighlightColor: (id: string, color: BooksHighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
  /** Saved page bookmarks for this book. */
  bookmarks: BookBookmark[];
  onAddBookmark: (bookmark: BookBookmark) => void;
  onRemoveBookmark: (cfi: string) => void;
  /** Whether the current page holds a bookmark (drives the menu label). */
  onBookmarkStateChange?: (isBookmarked: boolean) => void;
  /** Continue the Ask Ryo conversation in Chats with the passage quoted. */
  onAskRyo: (passage: string) => void;
}

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export interface BooksChapterNavigationItem {
  id: string;
  label: string;
  href: string;
  depth: number;
}

export interface BooksNavigationState {
  isReady: boolean;
  canGoPreviousPage: boolean;
  canGoNextPage: boolean;
  chapters: BooksChapterNavigationItem[];
  currentChapterIndex: number;
}

export interface BooksReaderPaneHandle {
  goToPreviousPage: () => void;
  goToNextPage: () => void;
  goToChapter: (href: string) => void;
  goToCfi: (cfi: string) => void;
  toggleBookmark: () => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
}

interface ZoomRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface FlipState {
  dir: "next" | "prev";
  id: number;
}

type BooksDebugLevel = "info" | "warn" | "error";
type BooksDebugSnapshot = Record<string, unknown>;

// Extra top clearance so the page never sits under the hover-revealed window
// titlebar (the window uses the full-bleed "notitlebar" material).
const TOP_CLEARANCE = 36;
// Footer that holds the reading-progress bar.
const FOOTER_HEIGHT = 30;
// The horizontal gutter around the text column comes from
// `settings.gutterPx` (user-adjustable in the Customize panel). It is applied
// as a left/right inset on the epub.js render host (rather than body padding)
// so epub.js's paginated column math stays correct — it computes columns from
// the host width.
// Width at which auto column mode switches to a two-page spread. epub.js
// defaults to 800; a lower value shows two columns on narrower windows.
const SPREAD_MIN_WIDTH = 560;

// Shared style for the read-aloud overlay control buttons.
// Disabled dimming lives on the inner SVG (not the button): the stagger
// variants leave an inline `opacity: 1` on the motion.button element, which
// would override a `disabled:opacity-*` class on the button itself.
const SPEECH_OVERLAY_BUTTON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors disabled:[&_svg]:opacity-40 disabled:hover:bg-transparent";
const SPEECH_BAR_COLLAPSED = { width: 72, height: 5 } as const;
const SPEECH_BAR_EXPANDED = { width: 130, height: 36 } as const;
// Selection toolbar (shown in place of the read-aloud controls while text is
// selected): 5 color dots + divider + copy + ask-ryo (+ remove for saved
// highlights). Content is centered at these fixed widths, so width = content
// (195px / 225px) + 4px slack per side — matching the ~10px visual inset the
// 4px vertical padding + 6px in-button space give the top edge.
const SELECTION_BAR_WIDTH = 203;
const SELECTION_BAR_WIDTH_WITH_REMOVE = 233;

// Bar rows stagger their controls in reading order when a row enters or the
// selection/speech rows swap; exits fade as one so the swap stays snappy.
// `custom` carries whether the bar was already open before the swap — when a
// row is replaced while the pill was still collapsed (e.g. selecting text with
// the read-aloud bar minimized), the outgoing row vanishes instantly so its
// controls never flash during the expansion.
const BAR_ROW_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.16,
      ease: "easeOut",
      delayChildren: 0.02,
      staggerChildren: 0.03,
    },
  },
  exit: (barWasOpen: boolean) =>
    barWasOpen
      ? {
          opacity: 0,
          scale: 0.88,
          transition: { duration: 0.12, ease: "easeIn" },
        }
      : { opacity: 0, transition: { duration: 0 } },
};
const BAR_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 4, scale: 0.6 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 640, damping: 32 },
  },
};

// Simulated stream for the Ask Ryo bubble: the endpoint returns the full
// reply at once, so the text fades in chunk by chunk instead. CJK replies
// have no spaces, so long tokens are re-chunked to keep the stream visible.
const ASK_REPLY_CHUNK_STAGGER_S = 0.035;
const ASK_REPLY_MAX_DELAY_S = 2.2;
const ASK_REPLY_MAX_CHUNK_CHARS = 4;

function splitAskReplyChunks(text: string): string[] {
  const chunks: string[] = [];
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue;
    if (/^\s+$/.test(token) || token.length <= ASK_REPLY_MAX_CHUNK_CHARS * 3) {
      chunks.push(token);
      continue;
    }
    for (let i = 0; i < token.length; i += ASK_REPLY_MAX_CHUNK_CHARS) {
      chunks.push(token.slice(i, i + ASK_REPLY_MAX_CHUNK_CHARS));
    }
  }
  return chunks;
}

function AskRyoReply({
  text,
  trailing,
}: {
  text: string;
  trailing: ReactNode;
}) {
  const chunks = useMemo(() => splitAskReplyChunks(text), [text]);
  let visibleIndex = 0;
  let lastDelay = 0;
  const spans = chunks.map((chunk, index) => {
    if (/^\s+$/.test(chunk)) {
      return <span key={index}>{chunk}</span>;
    }
    const delay = Math.min(
      visibleIndex * ASK_REPLY_CHUNK_STAGGER_S,
      ASK_REPLY_MAX_DELAY_S
    );
    visibleIndex += 1;
    lastDelay = delay;
    return (
      <motion.span
        key={index}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut", delay }}
      >
        {chunk}
      </motion.span>
    );
  });
  return (
    /* px-0.5 + the pill's px-1.5 = 8px per side, matching the two py-1 rings */
    <>
      <div className="max-h-40 select-text overflow-y-auto px-0.5 pt-1 text-[12px] leading-relaxed whitespace-pre-wrap">
        {spans}
      </div>
      {/* Actions fade in after the last chunk, pinned below the scroller so
          long replies never bury them. */}
      <motion.div
        className="mt-1 flex shrink-0 items-center justify-end gap-1 px-0.5 pb-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: lastDelay + 0.15 }}
      >
        {trailing}
      </motion.div>
    </>
  );
}

/** Animated icon swap for bar buttons (copy → check, customize → close):
 * the outgoing glyph blurs/shrinks away while the incoming one sharpens in. */
function BarIconSwap({
  iconKey,
  children,
}: {
  iconKey: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={iconKey}
        className="flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.4, filter: "blur(2px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.4, filter: "blur(2px)" }}
        transition={{ duration: 0.12, ease: "easeOut" }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

// Open transition timings. Keep the page reveal slightly after the cover zoom
// settles so the two never fight (which reads as a "pop"). Shared with the
// closing zoom (BookCloseZoom) so open + close mirror each other exactly.
export const ZOOM_DURATION = 0.45;
export const ZOOM_EASE = [0.32, 0.72, 0, 1] as const;
const REVEAL_DELAY_MS = 480;
const INITIAL_DISPLAY_TIMEOUT_MS = 6500;
const FALLBACK_DISPLAY_TIMEOUT_MS = 6500;
const DEFAULT_BOOK_ASSET_BY_PATH: Record<string, string> = {
  "/Books/Meditations - Marcus Aurelius.epub":
    "/assets/books/meditations-marcus-aurelius.epub",
};

export function createInitialBooksNavigationState(): BooksNavigationState {
  return {
    isReady: false,
    canGoPreviousPage: false,
    canGoNextPage: false,
    chapters: [],
    currentChapterIndex: -1,
  };
}

function stripHrefFragment(href?: string): string {
  return (href ?? "").split("#")[0].replace(/^\.\//, "");
}

function hrefMatches(activeHref: string | undefined, chapterHref: string): boolean {
  const active = stripHrefFragment(activeHref);
  const chapter = stripHrefFragment(chapterHref);
  if (!active || !chapter) return false;
  return (
    active === chapter ||
    active.endsWith(`/${chapter}`) ||
    chapter.endsWith(`/${active}`)
  );
}

function findCurrentChapterIndex(
  chapters: BooksChapterNavigationItem[],
  activeHref: string | undefined
): number {
  if (!activeHref) return -1;
  return chapters.findIndex((chapter) => hrefMatches(activeHref, chapter.href));
}

function flattenBookChapters(
  items: NavItem[] | undefined,
  depth = 0,
  parentKey = "chapter"
): BooksChapterNavigationItem[] {
  if (!items?.length) return [];
  return items.flatMap((item, index) => {
    const key = item.id || `${parentKey}-${index}`;
    const label = item.label?.trim() || `Chapter ${index + 1}`;
    const current = item.href
      ? [{ id: key, label, href: item.href, depth }]
      : [];
    return [
      ...current,
      ...flattenBookChapters(item.subitems, depth + 1, key),
    ];
  });
}

function serializeDebugValue(
  value: unknown,
  seen = new WeakSet<object>()
): unknown {
  if (value instanceof Error) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const cause = "cause" in value ? value.cause : undefined;
    return {
      kind: "Error",
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: cause === undefined ? undefined : serializeDebugValue(cause, seen),
    };
  }
  if (typeof DOMException !== "undefined" && value instanceof DOMException) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return {
      kind: "DOMException",
      name: value.name,
      message: value.message,
      code: value.code,
      stack: value.stack,
    };
  }
  if (value instanceof Blob) {
    return {
      kind: "Blob",
      size: value.size,
      type: value.type,
      constructorName: value.constructor?.name,
    };
  }
  if (value instanceof ArrayBuffer) {
    return {
      kind: "ArrayBuffer",
      byteLength: value.byteLength,
    };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      kind: value.constructor?.name,
      byteLength: value.byteLength,
      length: "length" in value ? value.length : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeDebugValue(item, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = serializeDebugValue(nested, seen);
    }
    return result;
  }
  return value;
}

function getBooksDebugEnvironment() {
  if (typeof window === "undefined") return {};
  return {
    href: window.location.href,
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    language: window.navigator.language,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    standalone:
      "standalone" in window.navigator
        ? Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
        : undefined,
  };
}

function getElementSnapshot(element: HTMLElement | null): BooksDebugSnapshot | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
    rect: {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
    },
    isConnected: element.isConnected,
    childElementCount: element.childElementCount,
  };
}

export const BooksReaderPane = forwardRef<
  BooksReaderPaneHandle,
  BooksReaderPaneProps
>(function BooksReaderPane(
  {
    entry,
    settings,
    osIsDark,
    originRect,
    initialCfi,
    initialPercentage,
    onProgress,
    onNavigationStateChange,
    onSpeechStateChange,
    onBookLanguageChange,
    onShowCustomize,
    onHideCustomize,
    isCustomizeOpen = false,
    highlights,
    onAddHighlight,
    onSetHighlightColor,
    onRemoveHighlight,
    bookmarks,
    onAddBookmark,
    onRemoveBookmark,
    onBookmarkStateChange,
    onAskRyo,
  },
  ref
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderHostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookLanguageRef = useRef<string | null>(null);
  const [bookLanguage, setBookLanguage] = useState<string | null>(null);
  const bookMetadataRef = useRef<{
    title: string | null;
    creator: string | null;
  }>({ title: null, creator: null });
  const publisherPageDirectionRef = useRef<"ltr" | "rtl">("ltr");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Raw preferences; application uses resolved (language-gated) values below.
  const textLayoutSettingRef = useRef(settings.textLayout);
  textLayoutSettingRef.current = settings.textLayout;
  const chineseScriptSettingRef = useRef(settings.chineseScript);
  chineseScriptSettingRef.current = settings.chineseScript;
  // Vertical / simp-trad only apply for qualifying book languages.
  const effectiveTextLayout = resolveEffectiveTextLayout(
    settings.textLayout,
    bookLanguage
  );
  const effectiveChineseScript = resolveEffectiveChineseScript(
    settings.chineseScript,
    bookLanguage
  );
  const appliedTextLayoutRef = useRef<BooksReaderSettings["textLayout"] | null>(
    null
  );
  const speechRateRef = useRef(settings.speechRate);
  speechRateRef.current = settings.speechRate;
  // Lets the rendition's `relocated` handler (created once per book) notify
  // the speech controller declared further down.
  const speechRelocatedRef = useRef<() => void>(() => {});
  const chineseScriptSessionRef = useRef(
    createChineseScriptConversionSession()
  );
  const flipLockRef = useRef(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const initialCfiRef = useRef(initialCfi);
  const activeSectionHrefRef = useRef<string | undefined>(undefined);

  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const uiLanguageRef = useRef(uiLanguage);
  uiLanguageRef.current = uiLanguage;
  const [isReady, setIsReady] = useState(false);
  const [coverVisible, setCoverVisible] = useState(true);
  // Set when the EPUB can't be opened (missing blob or display failure) so the
  // user sees a message instead of being stuck on the loading shim / cover.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Zoom-in geometry for the cover overlay: animates from the clicked shelf
  // cover (`from`) to full-bleed (`to`), both in viewport-local coordinates.
  const [zoom, setZoom] = useState<{ from: ZoomRect; to: ZoomRect } | null>(
    null
  );
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [navigationState, setNavigationState] = useState(
    createInitialBooksNavigationState
  );
  const navigationStateRef = useRef(navigationState);
  navigationStateRef.current = navigationState;
  // Seed from cached progress so the footer shows the real value immediately
  // (keyed by path, so this re-seeds per book). Refined once epub.js has real
  // locations and fires `relocated`.
  const [progressPct, setProgressPct] = useState(() =>
    clamp01(initialPercentage ?? 0)
  );
  // Latest progress, so the relocated handler can avoid clobbering a known-good
  // value with a transient 0 (epub.js reports 0 until locations are generated).
  const progressPctRef = useRef(progressPct);
  progressPctRef.current = progressPct;
  // Start/end CFIs of the visible page(s), for bookmark membership checks.
  const [pageCfis, setPageCfis] = useState<{
    startCfi: string;
    endCfi?: string;
  } | null>(null);

  const { info: coverInfo, loading: coverLoading } = useBookCover(
    entry.path,
    entry.modifiedAt
  );

  const displayDebugMode = useDisplaySettingsStore((s) => s.debugMode);
  const displayDebugModeRef = useRef(displayDebugMode);
  displayDebugModeRef.current = displayDebugMode;

  useEffect(() => {
    onNavigationStateChange?.(navigationState);
  }, [navigationState, onNavigationStateChange]);

  useEffect(
    () => () => onNavigationStateChange?.(createInitialBooksNavigationState()),
    [onNavigationStateChange]
  );

  const appendDebugEvent = useCallback(
    (step: string, data?: unknown, level: BooksDebugLevel = "info") => {
      if (!displayDebugModeRef.current) return;
      const debugData = serializeDebugValue(data);
      if (level === "error") {
        booksLog.error(step, debugData);
      } else if (level === "warn") {
        booksLog.warn(step, debugData);
      } else {
        booksLog.debug(step, debugData);
      }
    },
    []
  );

  const readActiveBookBlob = useCallback(async (): Promise<Blob | null> => {
    const fallbackAssetUrl = DEFAULT_BOOK_ASSET_BY_PATH[entry.path];
    try {
      const storedBlob = await readBookBlobContent(entry.path);
      if (storedBlob) return storedBlob;
      appendDebugEvent("content:vfs:missing", { fallbackAssetUrl }, "warn");
    } catch (error) {
      appendDebugEvent("content:vfs:failed", error, "error");
    }

    if (!fallbackAssetUrl) return null;

    appendDebugEvent("content:fallbackFetch:start", { fallbackAssetUrl });
    let response: Response;
    try {
      response = await fetch(fallbackAssetUrl, { credentials: "same-origin" });
    } catch (error) {
      // Offline / server unreachable — surface the regular "missing book"
      // error instead of an unhandled open failure.
      appendDebugEvent("content:fallbackFetch:failed", error, "error");
      return null;
    }
    appendDebugEvent("content:fallbackFetch:response", {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
    });
    if (!response.ok) return null;

    const blob = await response.blob();
    appendDebugEvent("content:fallbackFetch:success", { blob });
    return blob;
  }, [appendDebugEvent, entry.path]);

  const accentBaseHex = useThemeStore((state) => resolveOsAccentBaseHex(state));
  const palette = resolveReadingPalette(settings, osIsDark, accentBaseHex);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const { isAquaGlass } = useThemeFlags();
  const speechOverlayButtonClass = cn(
    SPEECH_OVERLAY_BUTTON_CLASS,
    isAquaGlass ? null : "hover:bg-white/20"
  );
  const overlayBackground = getReadingOverlayBackground(palette);
  const isVerticalText = effectiveTextLayout === "vertical";
  const sideClearance = clampBooksGutter(settings.gutterPx);

  // Measure the zoom-in geometry before first paint so the cover overlay starts
  // exactly on top of the clicked shelf book and grows to full-bleed. Runs once
  // per book (the pane is keyed by path), so the captured origin stays stable.
  useLayoutEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const to: ZoomRect = {
      top: 0,
      left: 0,
      width: hostRect.width,
      height: hostRect.height,
    };
    // Fall back to a plain full-bleed reveal (no fly-in) when there is no
    // origin, e.g. opened via deep link / "last opened" rather than a tap.
    const from: ZoomRect =
      originRect && originRect.width > 0 && originRect.height > 0
        ? {
            top: originRect.top - hostRect.top,
            left: originRect.left - hostRect.left,
            width: originRect.width,
            height: originRect.height,
          }
        : to;
    setZoom({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!displayDebugMode) return;
    const onError = (event: ErrorEvent) => {
      appendDebugEvent(
        "window.error",
        {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
        },
        "error"
      );
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendDebugEvent(
        "window.unhandledrejection",
        { reason: event.reason },
        "error"
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [appendDebugEvent, displayDebugMode]);

  // Create the book + rendition for the active EPUB.
  useEffect(() => {
    let cancelled = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;
    let displayedContentFontsReady: Promise<unknown> | undefined;
    // epub.js resolves display() before rendition content hooks run, so the
    // post-display font/axis reflow must wait for this signal from the hook.
    let resolveContentHooksReady: (() => void) | null = null;
    let contentHooksReady: Promise<void> = Promise.resolve();
    setIsReady(false);
    setCoverVisible(true);
    setLoadError(null);
    bookLanguageRef.current = null;
    setBookLanguage(null);
    onBookLanguageChange?.(null);
    publisherPageDirectionRef.current = "ltr";
    appliedTextLayoutRef.current = null;
    activeSectionHrefRef.current = undefined;
    setPageCfis(null);
    setNavigationState(createInitialBooksNavigationState());
    appendDebugEvent("open:start", {
      path: entry.path,
      fileName: entry.fileName,
      name: entry.name,
      modifiedAt: entry.modifiedAt,
      initialCfi: initialCfiRef.current,
      settings,
      environment: getBooksDebugEnvironment(),
    });

    const nextFrame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );

    const getReaderDebugSnapshot = (
      step: string,
      startedAt?: number
    ): BooksDebugSnapshot => {
      const debugBook = book as unknown as
        | {
            archived?: boolean;
            container?: { packagePath?: string };
            package?: { metadata?: unknown };
            settings?: unknown;
          }
        | null;
      const debugRendition = rendition as unknown as
        | {
            location?: unknown;
            manager?: { constructor?: { name?: string } };
            settings?: unknown;
            views?: () => unknown;
          }
        | null;
      let viewCount: number | undefined;
      try {
        const views = debugRendition?.views?.();
        viewCount = Array.isArray(views) ? views.length : undefined;
      } catch {
        viewCount = undefined;
      }
      return {
        step,
        elapsedMs: startedAt ? Date.now() - startedAt : undefined,
        entry: {
          path: entry.path,
          fileName: entry.fileName,
          name: entry.name,
          modifiedAt: entry.modifiedAt,
        },
        initialCfi: initialCfiRef.current,
        activeSectionHref: activeSectionHrefRef.current,
        host: getElementSnapshot(renderHostRef.current),
        book: book
          ? {
              archived: debugBook?.archived,
              packagePath: debugBook?.container?.packagePath,
              metadata: debugBook?.package?.metadata,
              settings: debugBook?.settings,
            }
          : null,
        rendition: rendition
          ? {
              location: debugRendition?.location,
              managerName: debugRendition?.manager?.constructor?.name,
              settings: debugRendition?.settings,
              viewCount,
            }
          : null,
      };
    };

    const watch = async <T,>(step: string, promise: Promise<T>): Promise<T> => {
      const startedAt = Date.now();
      const timeout = window.setTimeout(() => {
        appendDebugEvent(
          `${step}:stillPending`,
          getReaderDebugSnapshot(step, startedAt),
          "warn"
        );
      }, 8000);
      try {
        return await promise;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const cleanupInstance = () => {
      try {
        rendition?.destroy();
      } catch {
        // ignore
      }
      try {
        book?.destroy();
      } catch {
        // ignore
      }
      if (renditionRef.current === rendition) renditionRef.current = null;
      if (bookRef.current === book) bookRef.current = null;
      rendition = null;
      book = null;
    };

    (async () => {
      try {
        appendDebugEvent("content:read:start");
        const blob = await readActiveBookBlob();
        if (cancelled) return;
        if (!blob) {
          // No readable EPUB bytes — surface an error instead of hanging on the
          // loading shim / zoom cover forever.
          setLoadError(t("apps.books.reader.error"));
          setCoverVisible(false);
          setIsReady(true);
          appendDebugEvent("content:read:missing", undefined, "error");
          return;
        }
        appendDebugEvent("content:read:success", {
          blob,
          isBlobInstance: blob instanceof Blob,
          hasArrayBuffer: typeof blob.arrayBuffer === "function",
        });
        appendDebugEvent("blob:arrayBuffer:start");
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        const magic = Array.from(new Uint8Array(buffer, 0, 4)).map((byte) =>
          byte.toString(16).padStart(2, "0")
        );
        appendDebugEvent("blob:arrayBuffer:success", {
          byteLength: buffer.byteLength,
          magic,
        });
        // The stored blob isn't a valid EPUB (zip). This happens when a cloud
        // content download failed and an error payload (e.g. a 404
        // `{"error":"Not found"}` JSON body) got saved as the book's bytes —
        // show the error instead of feeding garbage to epub.js (which would
        // otherwise render the raw error text as the "book").
        if (!isLikelyEpubBuffer(buffer)) {
          setLoadError(t("apps.books.reader.error"));
          setCoverVisible(false);
          setIsReady(true);
          appendDebugEvent("epub:magic:invalid", { magic }, "error");
          return;
        }
        appendDebugEvent("epub:magic:valid", { magic });

        const host = renderHostRef.current;
        if (!host) {
          setLoadError(t("apps.books.reader.error"));
          setCoverVisible(false);
          setIsReady(true);
          appendDebugEvent("renderHost:missing", undefined, "error");
          return;
        }
        // Wait until the host has a measurable size so epub.js can lay out.
        for (let i = 0; i < 40 && host.clientHeight < 2; i++) {
          await nextFrame();
          if (cancelled) return;
        }
        appendDebugEvent("renderHost:measured", {
          clientWidth: host.clientWidth,
          clientHeight: host.clientHeight,
          rect: host.getBoundingClientRect().toJSON?.() ?? {
            width: host.getBoundingClientRect().width,
            height: host.getBoundingClientRect().height,
            top: host.getBoundingClientRect().top,
            left: host.getBoundingClientRect().left,
          },
        });
        if (host.clientWidth < 2 || host.clientHeight < 2) {
          setLoadError(t("apps.books.reader.error"));
          setCoverVisible(false);
          setIsReady(true);
          appendDebugEvent(
            "renderHost:zeroSize",
            { clientWidth: host.clientWidth, clientHeight: host.clientHeight },
            "error"
          );
          return;
        }

        appendDebugEvent("epubjs:createBook:start");
        book = ePub(buffer);
        bookRef.current = book;
        appendDebugEvent("epubjs:createBook:success", {
          archived: book.archived,
          settings: book.settings,
        });

        const bookEvents = book as unknown as {
          on?: (eventName: string, handler: (...args: unknown[]) => void) => void;
        };
        bookEvents.on?.("openFailed", (error) => {
          appendDebugEvent(
            "epubjs:book:openFailed",
            {
              error,
              snapshot: getReaderDebugSnapshot("epubjs:book:openFailed"),
            },
            "error"
          );
          if (!cancelled) {
            setLoadError(t("apps.books.reader.error"));
            setCoverVisible(false);
            setIsReady(true);
          }
        });

        appendDebugEvent("epubjs:bookReady:start");
        await watch("epubjs:bookReady", book.ready);
        const readyBook = book as unknown as {
          container?: { packagePath?: string };
          package?: {
            metadata?: {
              direction?: unknown;
              language?: string;
              title?: string;
              creator?: string;
            };
          };
        };
        // Title/author feed the Ask Ryo prompt so the model knows the source.
        bookMetadataRef.current = {
          title: readyBook.package?.metadata?.title?.trim() || null,
          creator: readyBook.package?.metadata?.creator?.trim() || null,
        };
        // Normalize legacy tags ("jpn", "zho", …) so downstream consumers
        // (layout gates, font stacks, TTS, lang attributes) all agree.
        const nextBookLanguage = normalizeBookLanguage(
          readyBook.package?.metadata?.language
        );
        bookLanguageRef.current = nextBookLanguage;
        setBookLanguage(nextBookLanguage);
        onBookLanguageChange?.(nextBookLanguage);
        publisherPageDirectionRef.current = resolveEpubPageDirection(
          "book",
          readyBook.package?.metadata?.direction
        );
        const readingLanguage = resolveChineseScriptReadingLanguage(
          resolveEffectiveChineseScript(
            chineseScriptSettingRef.current,
            nextBookLanguage
          ),
          nextBookLanguage ?? uiLanguage
        );
        book.spine.hooks.content.register((document: Document) => {
          // Strip active content (scripts, inline handlers, javascript: URLs)
          // BEFORE epub.js serializes the section into its iframe — required
          // because the rendition runs with `allowScriptedContent: true` (see
          // booksContentSanitizer.ts for the iOS selection rationale).
          try {
            const removedCount = sanitizeEpubSectionDocument(document);
            if (removedCount > 0) {
              appendDebugEvent("epubjs:section:sanitized", { removedCount });
            }
          } catch (error) {
            appendDebugEvent("epubjs:section:sanitizeFailed", error, "warn");
          }
          const textLayout = resolveEffectiveTextLayout(
            textLayoutSettingRef.current,
            bookLanguageRef.current
          );
          applyEpubTextLayout(document, textLayout);
          appliedTextLayoutRef.current = textLayout;
        });
        appendDebugEvent("epubjs:bookReady:success", {
          packagePath: readyBook.container?.packagePath,
          metadata: readyBook.package?.metadata,
        });
        const chapters = flattenBookChapters(book.navigation?.toc);
        setNavigationState((state) => ({
          ...state,
          chapters,
          currentChapterIndex: findCurrentChapterIndex(
            chapters,
            activeSectionHrefRef.current
          ),
        }));
        appendDebugEvent("epubjs:navigation:loaded", {
          chapterCount: chapters.length,
        });
        if (cancelled) {
          cleanupInstance();
          return;
        }

        const fontFaceCss = buildFontFaceCss(window.location.origin);
        const activeBook = book;

        const createRendition = (reason: "initial" | "fallback"): Rendition => {
          const renderStep =
            reason === "initial" ? "epubjs:renderTo" : "epubjs:renderToFallback";
          displayedContentFontsReady = undefined;
          contentHooksReady = new Promise<void>((resolve) => {
            resolveContentHooksReady = resolve;
          });
          const textLayout = resolveEffectiveTextLayout(
            textLayoutSettingRef.current,
            bookLanguageRef.current
          );
          appendDebugEvent(`${renderStep}:start`, {
            width: host.clientWidth,
            height: host.clientHeight,
            spread: columnModeToSpread(settings.columnMode),
            textLayout,
          });
          const pageDirection = resolveEpubPageDirection(
            textLayout,
            publisherPageDirectionRef.current
          );
          const nextRendition = activeBook.renderTo(host, {
            width: host.clientWidth || "100%",
            height: host.clientHeight || "100%",
            flow: "paginated",
            spread: columnModeToSpread(settings.columnMode),
            minSpreadWidth: SPREAD_MIN_WIDTH,
            manager: "default",
            defaultDirection: pageDirection,
            // WebKit blocks the long-press text-selection gesture (and
            // events generally) inside `sandbox="allow-same-origin"` iframes
            // without `allow-scripts`, killing selection/highlights on iOS.
            // Safe because sections are sanitized in the spine content hook
            // (booksContentSanitizer.ts) before they reach the iframe.
            allowScriptedContent: true,
          });
          rendition = nextRendition;
          renditionRef.current = nextRendition;
          appendDebugEvent(`${renderStep}:success`);

          nextRendition.on("started", () => {
            const layout = resolveEffectiveTextLayout(
              textLayoutSettingRef.current,
              bookLanguageRef.current
            );
            const direction = resolveEpubPageDirection(
              layout,
              publisherPageDirectionRef.current
            );
            nextRendition.direction(direction);
            appendDebugEvent("epubjs:rendition:started", {
              direction,
              textLayout: layout,
            });
          });
          nextRendition.on("attached", () =>
            appendDebugEvent("epubjs:rendition:attached")
          );
          nextRendition.on(
            "rendered",
            (section: { href?: string; idref?: string }) =>
              appendDebugEvent("epubjs:rendition:rendered", {
                href: section?.href,
                idref: section?.idref,
              })
          );
          nextRendition.on(
            "displayed",
            (section: { href?: string; idref?: string }) =>
              appendDebugEvent("epubjs:rendition:displayed", {
                href: section?.href,
                idref: section?.idref,
              })
          );
          nextRendition.on("displayError", (error: unknown) =>
            appendDebugEvent(
              "epubjs:rendition:displayError",
              {
                error,
                snapshot: getReaderDebugSnapshot("epubjs:rendition:displayError"),
              },
              "error"
            )
          );
          nextRendition.on(
            "layout",
            (props: unknown, changed: unknown) =>
              appendDebugEvent("epubjs:rendition:layout", { props, changed })
          );
          nextRendition.on("resized", (size: unknown) =>
            appendDebugEvent("epubjs:rendition:resized", size)
          );

          nextRendition.hooks.content.register(
            createEpubThemeContentHook(() => {
              const currentBookLanguage = bookLanguageRef.current;
              const readingLanguage = resolveChineseScriptReadingLanguage(
                resolveEffectiveChineseScript(
                  chineseScriptSettingRef.current,
                  currentBookLanguage
                ),
                currentBookLanguage ?? uiLanguageRef.current
              );
              return buildEpubTheme(
                settingsRef.current,
                paletteRef.current,
                readingLanguage,
                currentBookLanguage
              );
            })
          );

          nextRendition.hooks.content.register(
            async (contents: {
              addStylesheetCss: (css: string, key: string) => void;
              document?: Document;
            }) => {
              try {
                try {
                  contents.addStylesheetCss(fontFaceCss, "ryos-book-fonts");
                  appendDebugEvent("epubjs:contentHook:fonts:success");
                } catch {
                  appendDebugEvent(
                    "epubjs:contentHook:fonts:failed",
                    undefined,
                    "warn"
                  );
                }

                try {
                  contents.addStylesheetCss(
                    BOOKS_SPEECH_HIGHLIGHT_CSS,
                    "ryos-books-speech"
                  );
                } catch {
                  appendDebugEvent(
                    "epubjs:contentHook:speechCss:failed",
                    undefined,
                    "warn"
                  );
                }

                // Keep passages selectable (iOS long-press + publisher CSS).
                try {
                  contents.addStylesheetCss(
                    BOOKS_SELECTION_CONTENT_CSS,
                    "ryos-books-selection"
                  );
                } catch {
                  appendDebugEvent(
                    "epubjs:contentHook:selectionCss:failed",
                    undefined,
                    "warn"
                  );
                }

                const document = contents.document;
                if (!document) return;
                const textLayout = resolveEffectiveTextLayout(
                  textLayoutSettingRef.current,
                  bookLanguageRef.current
                );
                applyEpubTextLayout(document, textLayout);
                appliedTextLayoutRef.current = textLayout;

                // `hyphens: auto` and locale-specific CJK glyph forms depend on the
                // content language. Prefer EPUB metadata, then the ryOS UI locale.
                try {
                  const docEl = document.documentElement;
                  if (docEl && !docEl.getAttribute("lang")) {
                    docEl.setAttribute(
                      "lang",
                      bookLanguageRef.current ?? uiLanguageRef.current
                    );
                  }
                } catch {
                  // ignore
                }

                // Strip publisher inline `color` styles so the themed reading color
                // always wins. A stylesheet (even `!important`) can't beat an inline
                // `color: … !important`, so removing the inline declaration is the
                // only reliable way to guarantee legibility (e.g. dark-on-dark).
                try {
                  document
                    .querySelectorAll<HTMLElement>("[style]")
                    .forEach((el) => {
                      if (el.style?.color) {
                        el.style.removeProperty("color");
                      }
                    });
                } catch {
                  // ignore
                }

                // Capture fonts.ready before Chinese-script work so the settle
                // reflow can start waiting even while conversion continues.
                if (renditionRef.current === nextRendition) {
                  displayedContentFontsReady =
                    document.fonts?.ready ?? Promise.resolve();
                }

                const target = resolveEffectiveChineseScript(
                  chineseScriptSettingRef.current,
                  bookLanguageRef.current
                );
                try {
                  const changedNodeCount = await applyChineseScriptToDocument(
                    document,
                    target,
                    chineseScriptSessionRef.current,
                    () =>
                      !cancelled &&
                      resolveEffectiveChineseScript(
                        chineseScriptSettingRef.current,
                        bookLanguageRef.current
                      ) === target &&
                      renditionRef.current === nextRendition
                  );
                  appendDebugEvent("epubjs:contentHook:chineseScript:success", {
                    target,
                    changedNodeCount,
                  });
                } catch (error) {
                  appendDebugEvent(
                    "epubjs:contentHook:chineseScript:failed",
                    error,
                    "warn"
                  );
                }
              } finally {
                // Unblock the settle reflow even when the section document is
                // missing or Chinese-script conversion throws.
                resolveContentHooksReady?.();
                resolveContentHooksReady = null;
              }
            }
          );

          applyEpubTheme(
            nextRendition.themes,
            buildEpubTheme(
              settings,
              palette,
              readingLanguage,
              bookLanguageRef.current
            )
          );
          nextRendition.themes.fontSize(`${settings.fontSizePct}%`);
          appendDebugEvent("epubjs:theme:applied");

          nextRendition.on(
            "relocated",
            (location: {
              start?: { cfi?: string; href?: string; percentage?: number };
              end?: { cfi?: string };
              atStart?: boolean;
              atEnd?: boolean;
            }) => {
              const cfi = location?.start?.cfi;
              const atStartNow = !!location?.atStart;
              const atEndNow = !!location?.atEnd;
              const activeHref = location?.start?.href;
              activeSectionHrefRef.current = activeHref;
              setPageCfis(
                cfi ? { startCfi: cfi, endCfi: location?.end?.cfi } : null
              );
              setNavigationState((state) => ({
                ...state,
                canGoPreviousPage: !atStartNow,
                canGoNextPage: !atEndNow,
                currentChapterIndex: findCurrentChapterIndex(
                  state.chapters,
                  activeHref
                ),
              }));
              if (!cfi) return;
              let pct = location?.start?.percentage ?? 0;
              try {
                const total = activeBook.locations?.length?.() ?? 0;
                if ((!pct || pct === 0) && total > 0) {
                  pct = activeBook.locations.percentageFromCfi(cfi);
                }
              } catch {
                // ignore
              }
              const computed = clamp01(pct || 0);
              // A 0 that isn't genuinely the start of the book means epub.js
              // hasn't generated locations yet — don't drop the seeded/known value
              // to 0. Keep showing it and persist the cfi with the known percentage
              // so the cache isn't clobbered either.
              if (computed > 0 || atStartNow) {
                setProgressPct(computed);
                onProgressRef.current(cfi, computed);
              } else {
                onProgressRef.current(cfi, progressPctRef.current);
              }
              speechRelocatedRef.current();
            }
          );

          nextRendition.on("keyup", (event: KeyboardEvent) => handleKey(event));
          return nextRendition;
        };

        rendition = createRendition("initial");

        try {
          const initialDisplayTarget = initialCfiRef.current || undefined;
          const fallbackDisplayTarget = resolveEpubDisplayFallbackTarget(
            activeBook,
            initialDisplayTarget
          );
          appendDebugEvent("epubjs:display:start", {
            initialCfi: initialDisplayTarget,
            fallbackTarget: fallbackDisplayTarget,
          });
          const displayResult = await watch(
            "epubjs:display",
            displayEpubTargetWithFallback({
              rendition,
              target: initialDisplayTarget,
              fallbackTarget: fallbackDisplayTarget,
              initialTimeoutMs: INITIAL_DISPLAY_TIMEOUT_MS,
              fallbackTimeoutMs: FALLBACK_DISPLAY_TIMEOUT_MS,
              isActive: () =>
                !cancelled &&
                bookRef.current === activeBook &&
                renditionRef.current !== null,
              onTimeout: () =>
                appendDebugEvent(
                  "epubjs:display:timeout",
                  {
                    initialCfi: initialDisplayTarget,
                    fallbackTarget: fallbackDisplayTarget,
                    timeoutMs: INITIAL_DISPLAY_TIMEOUT_MS,
                    snapshot: getReaderDebugSnapshot("epubjs:display:timeout"),
                  },
                  "warn"
                ),
              resetAfterTimeout: () => {
                if (cancelled || bookRef.current !== activeBook) return null;
                const timedOutRendition = rendition;
                appendDebugEvent("epubjs:display:fallback:resetRendition", {
                  fallbackTarget: fallbackDisplayTarget,
                });
                try {
                  timedOutRendition?.destroy();
                } catch {
                  // ignore
                }
                if (renditionRef.current === timedOutRendition) {
                  renditionRef.current = null;
                }
                rendition = null;
                return createRendition("fallback");
              },
            })
          );
          if (displayResult.status === "inactive") return;
          appendDebugEvent("epubjs:display:success", {
            recovered: displayResult.status === "fallback-displayed",
            target: displayResult.target,
          });
          const displayedRendition = displayResult.rendition;
          // display() resolves before content hooks assign fontsReady. Wait for
          // the hook (with a timeout so a stuck hook can't pin the cover open).
          await Promise.race([
            contentHooksReady,
            new Promise<void>((resolve) => {
              window.setTimeout(resolve, FALLBACK_DISPLAY_TIMEOUT_MS);
            }),
          ]);
          if (cancelled || renditionRef.current !== displayedRendition) return;
          const textLayout = resolveEffectiveTextLayout(
            textLayoutSettingRef.current,
            bookLanguageRef.current
          );
          const isVerticalTextLayout = textLayout === "vertical";
          const reflowedAfterFonts = await reflowEpubAfterFontsSettle({
            fontsReady: displayedContentFontsReady ?? Promise.resolve(),
            rendition: displayedRendition,
            // Vertical writing mode never uses facing-page spreads; forcing
            // `auto`/`always` after the axis is already vertical sizes columns
            // against half-width and produces the stacked "tiers" layout.
            spread: isVerticalTextLayout
              ? "none"
              : columnModeToSpread(settings.columnMode),
            minSpreadWidth: SPREAD_MIN_WIDTH,
            target: displayResult.target,
            displayTimeoutMs: FALLBACK_DISPLAY_TIMEOUT_MS,
            // Must clear+rebuild — resize() no-ops when the host size is
            // unchanged, which is exactly the first-load case.
            rebuildViews: isVerticalTextLayout,
            isActive: () =>
              !cancelled && renditionRef.current === displayedRendition,
          });
          if (reflowedAfterFonts) {
            appendDebugEvent("epubjs:fonts:reflowed", {
              textLayout,
              rebuilt: isVerticalTextLayout,
            });
          }
        } catch (err) {
          // Corrupt / incompatible EPUB — show an error instead of revealing an
          // empty reader shell. Do not proceed to setIsReady / cover hide.
          if (!cancelled) {
            const snapshot = getReaderDebugSnapshot("epubjs:display:failed");
            booksLog.error("epubjs:display:failed", { error: err, snapshot });
            appendDebugEvent(
              "epubjs:display:failed",
              { error: err, snapshot },
              "error"
            );
            setLoadError(t("apps.books.reader.error"));
            setCoverVisible(false);
            setIsReady(true);
          }
          cleanupInstance();
          return;
        }
        if (cancelled) {
          cleanupInstance();
          return;
        }
        setIsReady(true);
        setNavigationState((state) => ({ ...state, isReady: true }));
        appendDebugEvent("reader:ready");
        // Reveal the page shortly after the zoom-in cover settles.
        window.setTimeout(() => {
          if (!cancelled) setCoverVisible(false);
        }, REVEAL_DELAY_MS);

        // Generate locations for accurate progress percentages (best-effort).
        activeBook.ready
          .then(() => activeBook.locations.generate(1600))
          .then(() => appendDebugEvent("epubjs:locations:generated"))
          .catch((error) =>
            appendDebugEvent("epubjs:locations:failed", error, "warn")
          );
      } catch (err) {
        if (!cancelled) {
          const snapshot = getReaderDebugSnapshot("reader:open:failed");
          booksLog.error("reader:open:failed", { error: err, snapshot });
          appendDebugEvent(
            "reader:open:failed",
            { error: err, snapshot },
            "error"
          );
          setLoadError(t("apps.books.reader.error"));
          setCoverVisible(false);
          setIsReady(true);
        }
        cleanupInstance();
      }
    })();

    return () => {
      cancelled = true;
      cleanupInstance();
    };
    // Only re-create when the book changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.path]);

  // Convert the already-rendered section immediately when the reader setting
  // (or book language) changes. Non-Chinese books always stay on original text.
  // Each section retains its original text so switching directions or returning
  // to Original never requires reloading the chapter.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!isReady || !rendition) return;
    let cancelled = false;
    const target = effectiveChineseScript;
    const renditionContents = rendition.getContents() as unknown;
    const contentsList = (
      Array.isArray(renditionContents)
        ? renditionContents
        : renditionContents
          ? [renditionContents]
          : []
    ) as Array<{ document?: Document }>;

    void Promise.all(
      contentsList.map(async (contents) => {
        if (!contents.document) return;
        const changedNodeCount = await applyChineseScriptToDocument(
          contents.document,
          target,
          chineseScriptSessionRef.current,
          () =>
            !cancelled &&
            resolveEffectiveChineseScript(
              chineseScriptSettingRef.current,
              bookLanguageRef.current
            ) === target
        );
        appendDebugEvent("reader:chineseScript:applied", {
          target,
          changedNodeCount,
        });
      })
    ).catch((error) =>
      appendDebugEvent("reader:chineseScript:failed", error, "warn")
    );

    return () => {
      cancelled = true;
    };
  }, [appendDebugEvent, isReady, effectiveChineseScript]);

  // Apply vertical text to source and rendered section documents, then let
  // epub.js clear and redisplay the current CFI with the matching page axis.
  // Vertical writing mode is only allowed for CJK books.
  useEffect(() => {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (
      !isReady ||
      !rendition ||
      !book ||
      appliedTextLayoutRef.current === effectiveTextLayout
    ) {
      return;
    }

    book.spine.each((section: { document?: Document }) => {
      if (section.document) {
        applyEpubTextLayout(section.document, effectiveTextLayout);
      }
    });

    const renditionContents = rendition.getContents() as unknown;
    const contentsList = (
      Array.isArray(renditionContents)
        ? renditionContents
        : renditionContents
          ? [renditionContents]
          : []
    ) as Array<{ document?: Document }>;
    for (const contents of contentsList) {
      if (contents.document) {
        applyEpubTextLayout(contents.document, effectiveTextLayout);
      }
    }

    appliedTextLayoutRef.current = effectiveTextLayout;
    const direction = resolveEpubPageDirection(
      effectiveTextLayout,
      publisherPageDirectionRef.current
    );
    rendition.direction(direction);
    appendDebugEvent("reader:textLayout:applied", {
      direction,
      textLayout: effectiveTextLayout,
    });
  }, [appendDebugEvent, isReady, effectiveTextLayout]);

  // Apply theme (colors, font family, line height) live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    const readingLanguage = resolveChineseScriptReadingLanguage(
      effectiveChineseScript,
      bookLanguageRef.current ?? uiLanguage
    );
    applyEpubTheme(
      renditionRef.current.themes,
      buildEpubTheme(
        settings,
        palette,
        readingLanguage,
        bookLanguageRef.current
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    settings.fontId,
    settings.themeOverride,
    settings.customThemeBackground,
    settings.customThemeText,
    effectiveChineseScript,
    bookLanguage,
    settings.customThemeTransparent,
    settings.lineHeight,
    // Live OS accent seed — page colors track wallpaper/Control Panels changes.
    accentBaseHex,
    osIsDark,
    uiLanguage,
  ]);

  // Apply font size live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    renditionRef.current.themes.fontSize(`${settings.fontSizePct}%`);
  }, [isReady, settings.fontSizePct]);

  // Apply column/spread mode live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    try {
      renditionRef.current.spread(columnModeToSpread(settings.columnMode));
    } catch {
      // ignore
    }
  }, [isReady, settings.columnMode]);

  // Keep the rendition sized to the render host (which is inset below the top
  // clearance and above the progress footer).
  useResizeObserverWithRef(
    renderHostRef,
    (resizeEntry) => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const { width, height } = resizeEntry.contentRect;
      if (width > 0 && height > 0) {
        try {
          rendition.resize(width, height);
        } catch {
          // ignore
        }
      }
    },
    { debounce: 80 }
  );

  const turnPage = useCallback((dir: "next" | "prev") => {
    const rendition = renditionRef.current;
    if (!rendition || flipLockRef.current) return;
    const state = navigationStateRef.current;
    if (dir === "prev" && !state.canGoPreviousPage) return;
    if (dir === "next" && !state.canGoNextPage) return;
    flipLockRef.current = true;
    setFlip({ dir, id: Date.now() });
    const action = dir === "next" ? rendition.next() : rendition.prev();
    Promise.resolve(action).finally(() => {
      // flip animation onComplete releases the lock
    });
  }, []);

  // Read-aloud (browser TTS). Utterances use the book's language (falling
  // back to the UI locale), honoring the Chinese-script conversion setting.
  const getSpeechLanguage = useCallback(
    () =>
      ryOSLocaleToSpeechLanguage(
        resolveChineseScriptReadingLanguage(
          resolveEffectiveChineseScript(
            chineseScriptSettingRef.current,
            bookLanguageRef.current
          ),
          bookLanguageRef.current ?? uiLanguageRef.current
        )
      ),
    []
  );
  const {
    isSpeaking,
    isPaused,
    startSpeaking,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    skipToPreviousSentence,
    skipToNextSentence,
    handleRelocated: handleSpeechRelocated,
  } = useBooksSpeech({
    getRendition: () => renditionRef.current,
    getSpeechLanguage,
    getSpeechRate: () => normalizeBooksSpeechRate(speechRateRef.current),
    canAdvancePage: () => navigationStateRef.current.canGoNextPage,
    advancePage: () => turnPage("next"),
  });
  speechRelocatedRef.current = handleSpeechRelocated;

  // Text selection + highlight annotations. The selection toolbar replaces
  // the read-aloud controls in the bottom pill while a passage is selected.
  const getRendition = useCallback(() => renditionRef.current, []);
  const {
    activeSelection,
    applyHighlightColor,
    removeActiveHighlight,
    copyActiveSelection,
    clearActiveSelection,
  } = useBooksAnnotations({
    getRendition,
    isReady,
    isDarkPage: palette.isDark,
    highlights,
    onAddHighlight,
    onSetHighlightColor,
    onRemoveHighlight,
  });

  // Edge-hover chevrons (desktop only): hovering a page-turn gutter fades in
  // a directional hint. Mobile/touch never hovers, so the media query gates
  // the synthetic mousemoves some touch browsers emit after taps.
  const [hoverSide, setHoverSide] = useState<"left" | "right" | null>(null);
  const supportsHover = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(hover: hover)").matches,
    []
  );
  const updateEdgeHover = useCallback(
    (hostX: number, hostY: number) => {
      if (!supportsHover) return;
      const host = viewportRef.current;
      if (!host) {
        setHoverSide(null);
        return;
      }
      const rect = host.getBoundingClientRect();
      if (hostY < TOP_CLEARANCE || hostY > rect.height - FOOTER_HEIGHT) {
        setHoverSide(null);
        return;
      }
      const edgeWidth = rect.width * BOOKS_EDGE_TAP_RATIO;
      const side =
        hostX <= edgeWidth
          ? "left"
          : hostX >= rect.width - edgeWidth
            ? "right"
            : null;
      if (!side) {
        setHoverSide(null);
        return;
      }
      const isVertical =
        resolveEffectiveTextLayout(
          textLayoutSettingRef.current,
          bookLanguageRef.current
        ) === "vertical";
      const direction =
        side === "left"
          ? isVertical
            ? "next"
            : "prev"
          : isVertical
            ? "prev"
            : "next";
      const canTurn =
        direction === "prev"
          ? navigationStateRef.current.canGoPreviousPage
          : navigationStateRef.current.canGoNextPage;
      setHoverSide(canTurn ? side : null);
    },
    [supportsHover]
  );
  const clearEdgeHover = useCallback(() => setHoverSide(null), []);

  // Handle page-turn taps and swipes inside the EPUB iframe instead of
  // covering its text with parent-document buttons. A live selection or
  // interactive target wins, so dragging / long-pressing near an edge
  // remains selectable.
  useEffect(() => {
    if (!isReady) return;
    const rendition = getRendition();
    if (!rendition) return;

    const attachedDocuments = new WeakSet<Document>();
    const cleanups: Array<() => void> = [];

    const attachPageTurnListeners = (contents: Contents) => {
      const document = contents.document;
      const contentWindow = contents.window;
      if (!document || !contentWindow || attachedDocuments.has(document)) {
        return;
      }
      attachedDocuments.add(document);

      const readSelectionState = () => {
        try {
          const selection = contentWindow.getSelection();
          return (
            !!selection && selection.rangeCount > 0 && !selection.isCollapsed
          );
        } catch {
          return false;
        }
      };

      const handleClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0) return;

        const hasSelection = readSelectionState();

        const target =
          event.target &&
          typeof (event.target as Element).closest === "function"
            ? (event.target as Element)
            : null;
        // In paginated mode epub.js makes the iframe as wide as the whole
        // section (every column) and clips it with the parent host, so iframe
        // coordinates don't map to what's visible. Convert the click into the
        // parent host's coordinate space and measure edges there.
        const host = viewportRef.current;
        const frame = contentWindow.frameElement;
        if (!host || !frame) return;
        const hostRect = host.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        // Highlight marks live in a pointer-transparent SVG overlay in the
        // parent document (marks-pane proxies iframe clicks onto them), so a
        // click on a highlight reaches this handler with the underlying text
        // as its target. Hit-test the individual mark rects in parent
        // coordinates so tapping a highlight opens its toolbar (markClicked)
        // instead of turning the page.
        const pointXInPage = frameRect.left + event.clientX;
        const pointYInPage = frameRect.top + event.clientY;
        const isOverHighlightMark = Array.from(
          frame.ownerDocument.querySelectorAll(
            `.${BOOKS_HIGHLIGHT_CLASS} rect`
          )
        ).some((mark) => {
          const rect = mark.getBoundingClientRect();
          return (
            pointXInPage >= rect.left &&
            pointXInPage <= rect.right &&
            pointYInPage >= rect.top &&
            pointYInPage <= rect.bottom
          );
        });
        const isInteractiveTarget =
          isOverHighlightMark ||
          target?.closest(
            `a, button, input, textarea, select, [role="button"], .${BOOKS_HIGHLIGHT_CLASS}`
          ) !== null ||
          target?.namespaceURI === "http://www.w3.org/2000/svg";
        const clientXInHost = frameRect.left + event.clientX - hostRect.left;
        const direction = resolveBooksEdgeTapDirection({
          clientX: clientXInHost,
          viewportWidth: hostRect.width,
          isVerticalText:
            resolveEffectiveTextLayout(
              textLayoutSettingRef.current,
              bookLanguageRef.current
            ) === "vertical",
          hasSelection,
          isInteractiveTarget,
        });
        if (!direction) return;

        event.preventDefault();
        turnPage(direction);
      };

      document.addEventListener("click", handleClick);
      cleanups.push(() => document.removeEventListener("click", handleClick));

      // Swipe-to-flip: a mostly-horizontal single-finger swipe anywhere on
      // the page turns it, mirroring the edge taps (vertical text reverses
      // the physical direction). Long-press selection drags carry a live
      // selection by the time the finger lifts, so they never flip.
      let swipeStart: { x: number; y: number } | null = null;

      const handleTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          swipeStart = null;
          return;
        }
        const touch = event.touches[0];
        swipeStart = { x: touch.clientX, y: touch.clientY };
      };

      const handleTouchMove = (event: TouchEvent) => {
        if (event.touches.length !== 1) swipeStart = null;
      };

      const handleTouchCancel = () => {
        swipeStart = null;
      };

      const handleTouchEnd = (event: TouchEvent) => {
        const start = swipeStart;
        swipeStart = null;
        if (!start || event.changedTouches.length !== 1) return;
        const touch = event.changedTouches[0];
        const direction = resolveBooksSwipeDirection({
          deltaX: touch.clientX - start.x,
          deltaY: touch.clientY - start.y,
          isVerticalText:
            resolveEffectiveTextLayout(
              textLayoutSettingRef.current,
              bookLanguageRef.current
            ) === "vertical",
          hasSelection: readSelectionState(),
        });
        if (!direction) return;
        turnPage(direction);
      };

      document.addEventListener("touchstart", handleTouchStart, {
        passive: true,
      });
      document.addEventListener("touchmove", handleTouchMove, {
        passive: true,
      });
      document.addEventListener("touchend", handleTouchEnd, { passive: true });
      document.addEventListener("touchcancel", handleTouchCancel, {
        passive: true,
      });
      cleanups.push(() => {
        document.removeEventListener("touchstart", handleTouchStart);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
        document.removeEventListener("touchcancel", handleTouchCancel);
      });

      // Parent mousemoves stop at the iframe boundary, so hover tracking for
      // the edge chevrons needs an in-document listener converting to host
      // coordinates (same mapping as the click handler above).
      const handlePointerMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        const host = viewportRef.current;
        const frame = contentWindow.frameElement;
        if (!host || !frame) return;
        const hostRect = host.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        updateEdgeHover(
          frameRect.left + event.clientX - hostRect.left,
          frameRect.top + event.clientY - hostRect.top
        );
      };
      document.addEventListener("pointermove", handlePointerMove);
      cleanups.push(() =>
        document.removeEventListener("pointermove", handlePointerMove)
      );
    };

    const attachToCurrentContents = () => {
      const renditionContents = rendition.getContents() as unknown;
      const contentsList = (
        Array.isArray(renditionContents)
          ? renditionContents
          : renditionContents
            ? [renditionContents]
            : []
      ) as Contents[];
      contentsList.forEach(attachPageTurnListeners);
    };

    const handleRendered = () => attachToCurrentContents();
    rendition.on("rendered", handleRendered);
    attachToCurrentContents();

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      try {
        rendition.off("rendered", handleRendered);
      } catch {
        // rendition may already be destroyed
      }
    };
  }, [getRendition, isReady, turnPage, updateEdgeHover]);

  // Copy feedback: the copy glyph swaps to a check for a beat instead of
  // raising a toast. Failure still surfaces as a toast.
  const [showCopyCheck, setShowCopyCheck] = useState(false);
  const copyCheckTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyCheckTimerRef.current !== null) {
        window.clearTimeout(copyCheckTimerRef.current);
      }
    },
    []
  );
  const handleCopySelection = useCallback(async () => {
    const copied = await copyActiveSelection();
    if (!copied) {
      toast.error(t("apps.books.selection.copyFailed"));
      return;
    }
    setShowCopyCheck(true);
    if (copyCheckTimerRef.current !== null) {
      window.clearTimeout(copyCheckTimerRef.current);
    }
    copyCheckTimerRef.current = window.setTimeout(() => {
      copyCheckTimerRef.current = null;
      setShowCopyCheck(false);
    }, 1200);
  }, [copyActiveSelection, t]);

  // Ask Ryo, inline: pressing the chat button auto-sends the passage and the
  // pill enlarges into a response bubble (thinking dots → reply text) instead
  // of bouncing the user out to the Chats app.
  const [askRyo, setAskRyo] = useState<{
    status: "thinking" | "done" | "error";
    passage: string;
    reply?: string;
    /** Pill width while the bubble is open (fits the window at ask time). */
    bubbleWidth: number;
  } | null>(null);
  const askRyoAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      askRyoAbortRef.current?.abort();
    },
    []
  );

  // UI sounds: toolbar buttons click; Ask Ryo keeps it to simple pings —
  // a soft synth pulse while thinking, a single ding when the reply lands,
  // and the typing synth during the reveal.
  const { play: playClickSound } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const { playNote } = useChatSynth();
  const { playErrorSound, playDingSound, playThinkingSound } =
    useTerminalSounds();
  // Gentle thinking pulse: hushed echoing notes while waiting (the dedicated
  // thinking synth self-initializes, so it is always audible).
  useEffect(() => {
    if (askRyo?.status !== "thinking") return;
    void playThinkingSound();
    const pulse = window.setInterval(() => void playThinkingSound(), 1600);
    return () => window.clearInterval(pulse);
  }, [askRyo?.status, playThinkingSound]);
  // Typing-synth notes paced with the reply's simulated stream.
  useEffect(() => {
    if (askRyo?.status !== "done" || !askRyo.reply) return;
    const chunkCount = splitAskReplyChunks(askRyo.reply).filter(
      (chunk) => !/^\s+$/.test(chunk)
    ).length;
    const revealMs =
      Math.min(
        chunkCount * ASK_REPLY_CHUNK_STAGGER_S,
        ASK_REPLY_MAX_DELAY_S
      ) *
        1000 +
      350;
    const noteInterval = window.setInterval(() => playNote(), 110);
    const stopTimer = window.setTimeout(
      () => window.clearInterval(noteInterval),
      revealMs
    );
    return () => {
      window.clearInterval(noteInterval);
      window.clearTimeout(stopTimer);
    };
  }, [askRyo, playNote]);

  // Speak the reply with browser TTS (non-AI), same voice/rate settings as
  // the book read-aloud. Toggle: press again to stop.
  const [isSpeakingAskReply, setIsSpeakingAskReply] = useState(false);
  const askSpeechStartedRef = useRef(false);
  const stopAskReplySpeech = useCallback(() => {
    if (!askSpeechStartedRef.current) return;
    askSpeechStartedRef.current = false;
    setIsSpeakingAskReply(false);
    try {
      getBrowserSpeechSynthesis()?.cancel();
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => () => stopAskReplySpeech(), [stopAskReplySpeech]);
  const handleToggleAskReplySpeech = useCallback(() => {
    if (isSpeakingAskReply) {
      stopAskReplySpeech();
      return;
    }
    const reply = askRyo?.reply;
    const synth = getBrowserSpeechSynthesis();
    if (!reply || !synth) return;
    // The reply follows the question's language (book language falling back
    // to the UI locale), so reuse the read-aloud language + voice resolution.
    const lang = getSpeechLanguage();
    const utterance = createSpeechUtterance(reply, {
      lang,
      rate: normalizeBooksSpeechRate(speechRateRef.current),
      voices: synth.getVoices(),
    });
    utterance.onend = () => {
      askSpeechStartedRef.current = false;
      setIsSpeakingAskReply(false);
    };
    utterance.onerror = () => {
      askSpeechStartedRef.current = false;
      setIsSpeakingAskReply(false);
    };
    // Page read-aloud shares the engine; stop it before speaking the reply.
    stopSpeaking();
    try {
      synth.cancel();
      synth.speak(utterance);
      askSpeechStartedRef.current = true;
      setIsSpeakingAskReply(true);
    } catch {
      askSpeechStartedRef.current = false;
      setIsSpeakingAskReply(false);
    }
  }, [
    askRyo,
    getSpeechLanguage,
    isSpeakingAskReply,
    stopAskReplySpeech,
    stopSpeaking,
  ]);

  const dismissAskRyo = useCallback(() => {
    askRyoAbortRef.current?.abort();
    askRyoAbortRef.current = null;
    setAskRyo(null);
    setShowAskCopyCheck(false);
    stopAskReplySpeech();
  }, [stopAskReplySpeech]);

  const handleContinueInChats = useCallback(() => {
    const passage = askRyo?.passage;
    if (!passage) return;
    dismissAskRyo();
    onAskRyo(passage);
  }, [askRyo, dismissAskRyo, onAskRyo]);

  // Copy-the-reply feedback mirrors the selection toolbar's copy → check swap.
  const [showAskCopyCheck, setShowAskCopyCheck] = useState(false);
  const askCopyCheckTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (askCopyCheckTimerRef.current !== null) {
        window.clearTimeout(askCopyCheckTimerRef.current);
      }
    },
    []
  );
  const handleCopyAskReply = useCallback(async () => {
    const reply = askRyo?.reply;
    if (!reply) return;
    try {
      await navigator.clipboard.writeText(reply);
    } catch {
      toast.error(t("apps.books.selection.copyFailed"));
      return;
    }
    setShowAskCopyCheck(true);
    if (askCopyCheckTimerRef.current !== null) {
      window.clearTimeout(askCopyCheckTimerRef.current);
    }
    askCopyCheckTimerRef.current = window.setTimeout(() => {
      askCopyCheckTimerRef.current = null;
      setShowAskCopyCheck(false);
    }, 1200);
  }, [askRyo, t]);

  const handleAskRyo = useCallback(async () => {
    const passage = activeSelection?.text;
    if (!passage) return;
    clearActiveSelection();

    const meta = bookMetadataRef.current;
    const navigation = navigationStateRef.current;
    const chapter =
      navigation.currentChapterIndex >= 0
        ? navigation.chapters[navigation.currentChapterIndex]?.label
        : undefined;
    const source = [
      meta.title || entry.name,
      meta.creator ? `by ${meta.creator}` : null,
      chapter ? `(${chapter})` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const prompt = [
      `“${passage}”`,
      source ? `— ${source}` : null,
      t("apps.books.selection.askRyoQuestion"),
    ]
      .filter(Boolean)
      .join("\n\n");

    const hostWidth = viewportRef.current?.clientWidth ?? 360;
    const bubbleWidth = Math.max(
      SELECTION_BAR_WIDTH,
      Math.min(340, hostWidth - 32)
    );

    askRyoAbortRef.current?.abort();
    stopAskReplySpeech();
    const controller = new AbortController();
    askRyoAbortRef.current = controller;
    setAskRyo({ status: "thinking", passage, bubbleWidth });

    try {
      const response = await abortableFetch(getApiUrl("/api/applet-ai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          context:
            "You are Ryo, a thoughtful reading companion inside the ryOS Books app. The user selected a passage from the book they are reading. Answer about the passage concisely in 2-4 short sentences, in the same language as the question.",
        }),
        signal: controller.signal,
        timeout: 30000,
      });
      const payload = (await response.json().catch(() => null)) as {
        reply?: string;
      } | null;
      const reply = payload?.reply?.trim();
      if (askRyoAbortRef.current !== controller) return;
      if (!response.ok || !reply) {
        setAskRyo({ status: "error", passage, bubbleWidth });
        playErrorSound();
        return;
      }
      setAskRyo({ status: "done", passage, reply, bubbleWidth });
      void playDingSound();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (askRyoAbortRef.current !== controller) return;
      setAskRyo({ status: "error", passage, bubbleWidth });
      playErrorSound();
    } finally {
      if (askRyoAbortRef.current === controller) {
        askRyoAbortRef.current = null;
      }
    }
  }, [
    activeSelection,
    clearActiveSelection,
    entry.name,
    playDingSound,
    playErrorSound,
    stopAskReplySpeech,
    t,
  ]);


  // Bookmark for the visible page: a saved CFI counts as "on this page" when
  // it falls between the page's start and end CFIs.
  const activeBookmark = useMemo<BookBookmark | null>(() => {
    if (!pageCfis || bookmarks.length === 0) return null;
    const comparator = new EpubCFI();
    for (const bookmark of bookmarks) {
      if (bookmark.cfi === pageCfis.startCfi) return bookmark;
      if (!pageCfis.endCfi) continue;
      try {
        if (
          comparator.compare(bookmark.cfi, pageCfis.startCfi) >= 0 &&
          comparator.compare(bookmark.cfi, pageCfis.endCfi) <= 0
        ) {
          return bookmark;
        }
      } catch {
        // Unparseable CFI — exact match already handled above.
      }
    }
    return null;
  }, [bookmarks, pageCfis]);

  useEffect(() => {
    onBookmarkStateChange?.(!!activeBookmark);
  }, [activeBookmark, onBookmarkStateChange]);
  useEffect(
    () => () => onBookmarkStateChange?.(false),
    [onBookmarkStateChange]
  );

  const toggleBookmark = useCallback(() => {
    if (activeBookmark) {
      onRemoveBookmark(activeBookmark.cfi);
      return;
    }
    if (!pageCfis) return;
    let snippet = "";
    const rendition = renditionRef.current;
    if (rendition) {
      try {
        snippet = (getVisiblePageRange(rendition)?.toString() ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
      } catch {
        snippet = "";
      }
    }
    onAddBookmark({
      cfi: pageCfis.startCfi,
      text: snippet || undefined,
      percentage: progressPctRef.current,
      createdAt: Date.now(),
    });
  }, [activeBookmark, pageCfis, onAddBookmark, onRemoveBookmark]);

  useEffect(() => {
    onSpeechStateChange?.(isSpeaking);
  }, [isSpeaking, onSpeechStateChange]);
  useEffect(
    () => () => onSpeechStateChange?.(false),
    [onSpeechStateChange]
  );

  // Read-aloud bar: stays expanded while playing; idle / paused collapses to
  // the home-indicator pill (hover or tap grows it again).
  const isSpeechPlaying = isSpeaking && !isPaused;
  const {
    isOpen: speechBarVisibilityOpen,
    handlePointerEnter: handleSpeechBarPointerEnter,
    handlePointerLeave: handleSpeechBarPointerLeave,
    handlePointerDown: handleSpeechBarPointerDown,
    handleFocus: handleSpeechBarFocus,
    handleBlur: handleSpeechBarBlur,
    revealTemporarily: revealSpeechBarTemporarily,
  } = useBooksSpeechBarVisibility({ isPlaying: isSpeechPlaying });
  // Auto-reveal the controls once the book is displayed so new readers see
  // them, then tuck the pill away after a couple of seconds.
  useEffect(() => {
    if (!isReady) return;
    revealSpeechBarTemporarily(BOOKS_SPEECH_BAR_AUTO_REVEAL_MS);
  }, [isReady, revealSpeechBarTemporarily]);
  const speechBarOpen = isCustomizeOpen || speechBarVisibilityOpen;
  // Active text selection swaps the bottom pill to the selection toolbar
  // (highlight colors / copy / ask Ryo) and keeps it open.
  const selectionBarActive = !!activeSelection;
  const askRyoActive = !!askRyo;
  const barOpen = askRyoActive || selectionBarActive || speechBarOpen;
  // Bar visibility from the previous render: when a row swap happens while
  // the pill was still collapsed, the outgoing row exits instantly (see
  // BAR_ROW_VARIANTS) so its controls never flash mid-expansion.
  const barWasOpenRef = useRef(barOpen);
  const barWasOpen = barWasOpenRef.current;
  useEffect(() => {
    barWasOpenRef.current = barOpen;
  });

  const displayTarget = useCallback(
    (target: string, step: string) => {
      const rendition = renditionRef.current;
      if (!rendition || !target) return;
      flipLockRef.current = false;
      setFlip(null);
      Promise.resolve(rendition.display(target)).catch((error) =>
        appendDebugEvent(step, error, "error")
      );
    },
    [appendDebugEvent]
  );

  useImperativeHandle(
    ref,
    () => ({
      goToPreviousPage: () => turnPage("prev"),
      goToNextPage: () => turnPage("next"),
      goToChapter: (href: string) =>
        displayTarget(href, "epubjs:chapterDisplay:failed"),
      goToCfi: (cfi: string) =>
        displayTarget(cfi, "epubjs:bookmarkDisplay:failed"),
      toggleBookmark,
      startSpeaking,
      stopSpeaking,
    }),
    [displayTarget, startSpeaking, stopSpeaking, toggleBookmark, turnPage]
  );

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "PageDown") {
        turnPage("next");
      } else if (event.key === "PageUp") {
        turnPage("prev");
      } else if (event.key === "ArrowRight") {
        turnPage(
          resolveEffectiveTextLayout(
            textLayoutSettingRef.current,
            bookLanguageRef.current
          ) === "vertical"
            ? "prev"
            : "next"
        );
      } else if (event.key === "ArrowLeft") {
        turnPage(
          resolveEffectiveTextLayout(
            textLayoutSettingRef.current,
            bookLanguageRef.current
          ) === "vertical"
            ? "next"
            : "prev"
        );
      }
    },
    [turnPage]
  );

  // Window-level keyboard navigation (in addition to the iframe keyup).
  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowLeft" ||
        e.key === "PageDown" ||
        e.key === "PageUp"
      ) {
        e.preventDefault();
        handleKey(e);
      }
    };
    host.addEventListener("keydown", onKeyDown);
    return () => host.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      className={cn(
        "relative h-full w-full overflow-hidden outline-none",
        // Transparent custom background: the reader becomes the frosted pane
        // under Aqua Glass (see books-reader-glass in aqua-glass.css).
        palette.background === "transparent" && "books-reader-glass"
      )}
      style={{ backgroundColor: palette.background }}
      onMouseMove={(event) => {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        updateEdgeHover(event.clientX - rect.left, event.clientY - rect.top);
      }}
      onMouseLeave={clearEdgeHover}
    >
      {/* The epub.js render target, inset below the top clearance, above the
          progress footer, and with side gutters for a comfortable measure.
          `books-reader-selectable` re-enables text selection on the epub.js
          iframe element — required for iOS long-press selection. */}
      <div
        ref={renderHostRef}
        className="books-reader-selectable absolute"
        style={{
          top: TOP_CLEARANCE,
          bottom: FOOTER_HEIGHT,
          left: sideClearance,
          right: sideClearance,
        }}
      />

      {/* Reading-progress footer — right-aligned percentage, no bar. */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-end px-4"
        style={{ height: FOOTER_HEIGHT }}
      >
        <span
          className={cn(
            "font-os-ui text-[10px] tabular-nums",
            palette.isDark ? "text-white/65" : "text-black/55"
          )}
        >
          {Math.round(progressPct * 100)}%
        </span>
      </div>

      {/* Edge-hover chevrons (desktop): fade in a page-turn hint over the
          hovered gutter; hidden on touch (no hover) and at book boundaries. */}
      <AnimatePresence>
        {hoverSide && (
          <motion.div
            key={hoverSide}
            className={cn(
              "pointer-events-none absolute z-10 flex items-center justify-center",
              hoverSide === "left" ? "left-0" : "right-0"
            )}
            style={{
              top: TOP_CLEARANCE,
              bottom: FOOTER_HEIGHT,
              // Center the caret within the reading gutter (with a floor so
              // it doesn't hug the window edge on very tight gutters).
              width: Math.max(sideClearance, 28),
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {hoverSide === "left" ? (
              <CaretLeft
                size={20}
                weight="bold"
                className={palette.isDark ? "text-white/45" : "text-black/35"}
              />
            ) : (
              <CaretRight
                size={20}
                weight="bold"
                className={palette.isDark ? "text-white/45" : "text-black/35"}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Read-aloud overlay: home-indicator pill when idle/paused; stays
          expanded while playing. Hover or tap grows it otherwise. */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
        style={{ bottom: 6 }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div
          className="pointer-events-auto flex w-full items-end justify-center"
          style={{ height: SPEECH_BAR_EXPANDED.height }}
          onPointerEnter={(event) =>
            handleSpeechBarPointerEnter(event.pointerType)
          }
          onPointerLeave={(event) =>
            handleSpeechBarPointerLeave(event.pointerType)
          }
          onPointerDown={(event) =>
            handleSpeechBarPointerDown(event.pointerType)
          }
          onFocusCapture={handleSpeechBarFocus}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) {
              return;
            }
            handleSpeechBarBlur();
          }}
        >
          <motion.div
            role={barOpen ? "toolbar" : "button"}
            aria-label={
              askRyoActive
                ? t("apps.books.selection.askRyo")
                : selectionBarActive
                  ? t("apps.books.selection.controls", {
                      defaultValue: "Selection controls",
                    })
                  : t("apps.books.speech.controls", {
                      defaultValue: "Read-aloud controls",
                    })
            }
            aria-expanded={barOpen ? undefined : false}
            className={cn(
              "books-speech-overlay flex items-center justify-center overflow-hidden",
              // The reply bubble squares off; the control pill (including the
              // compact thinking state) stays a capsule.
              askRyoActive && askRyo.status !== "thinking"
                ? "rounded-[18px]"
                : "rounded-full",
              barOpen ? "gap-0.5 px-1.5 py-1" : "cursor-pointer",
              isAquaGlass
                ? null
                : cn(
                    "border shadow-lg backdrop-blur-md",
                    palette.isDark
                      ? "border-white/15 bg-white/10 text-white"
                      : "border-black/10 bg-black/60 text-white"
                  )
            )}
            initial={false}
            animate={
              askRyoActive
                ? askRyo.status === "thinking"
                  ? {
                      // Stay compact while thinking; only the reply widens it.
                      width: 64,
                      height: SPEECH_BAR_EXPANDED.height,
                    }
                  : {
                      width: askRyo.bubbleWidth,
                      height: "auto",
                    }
                : selectionBarActive
                  ? {
                      width:
                        activeSelection?.kind === "highlight"
                          ? SELECTION_BAR_WIDTH_WITH_REMOVE
                          : SELECTION_BAR_WIDTH,
                      height: SPEECH_BAR_EXPANDED.height,
                    }
                  : speechBarOpen
                    ? {
                        width: SPEECH_BAR_EXPANDED.width,
                        height: SPEECH_BAR_EXPANDED.height,
                      }
                    : {
                        width: SPEECH_BAR_COLLAPSED.width,
                        height: SPEECH_BAR_COLLAPSED.height,
                      }
            }
            transition={{
              type: "spring",
              stiffness: 520,
              damping: 34,
              mass: 0.7,
            }}
            onClick={() => {
              if (barOpen) return;
              revealSpeechBarTemporarily();
            }}
            // One capture-phase handler clicks for every toolbar button
            // (speech, selection colors, copy, ask, done) without wiring each.
            onClickCapture={(event) => {
              const target = event.target as Element | null;
              if (target?.closest?.("button:not(:disabled)")) {
                playClickSound();
              }
            }}
          >
            <motion.div
              className="relative flex items-center justify-center"
              initial={false}
              animate={{
                opacity: barOpen ? 1 : 0,
                scale: barOpen ? 1 : 0.85,
              }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              style={{
                pointerEvents: barOpen ? "auto" : "none",
              }}
            >
              {/* Crossfade between the selection toolbar and the read-aloud
                  controls; popLayout keeps the exiting row out of the flex
                  flow so the pill's width spring never fights it. */}
              <AnimatePresence
                mode="popLayout"
                initial={false}
                custom={barWasOpen}
              >
              {askRyoActive ? (
                <motion.div
                  key="ask"
                  className="flex flex-col"
                  style={
                    askRyo.status === "thinking"
                      ? undefined
                      : { width: askRyo.bubbleWidth - 28 }
                  }
                  variants={BAR_ROW_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {askRyo.status === "thinking" ? (
                    <div
                      className="flex h-7 items-center justify-center gap-1"
                      aria-label={t("apps.books.selection.askRyo")}
                      aria-busy
                    >
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          className="h-1.5 w-1.5 rounded-full bg-current"
                          animate={{ opacity: [0.25, 0.9, 0.25] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: dot * 0.18,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <AskRyoReply
                      text={
                        askRyo.status === "error"
                          ? t("apps.books.selection.askRyoFailed")
                          : (askRyo.reply ?? "")
                      }
                      trailing={
                        <>
                          {askRyo.status === "done" && (
                            <button
                              type="button"
                              aria-label={
                                isSpeakingAskReply
                                  ? t("apps.books.speech.stop")
                                  : t("apps.books.menu.startSpeaking")
                              }
                              title={
                                isSpeakingAskReply
                                  ? t("apps.books.speech.stop")
                                  : t("apps.books.menu.startSpeaking")
                              }
                              onClick={handleToggleAskReplySpeech}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/15 transition-colors hover:bg-current/25"
                              tabIndex={0}
                            >
                              <BarIconSwap
                                iconKey={
                                  isSpeakingAskReply ? "stop" : "speak"
                                }
                              >
                                {isSpeakingAskReply ? (
                                  <Stop weight="fill" size={14} />
                                ) : (
                                  <SpeakerHigh weight="bold" size={14} />
                                )}
                              </BarIconSwap>
                            </button>
                          )}
                          {askRyo.status === "done" && (
                            <button
                              type="button"
                              aria-label={
                                showAskCopyCheck
                                  ? t("apps.books.selection.copied")
                                  : t("apps.books.selection.copy")
                              }
                              title={
                                showAskCopyCheck
                                  ? t("apps.books.selection.copied")
                                  : t("apps.books.selection.copy")
                              }
                              onClick={handleCopyAskReply}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/15 transition-colors hover:bg-current/25"
                              tabIndex={0}
                            >
                              <BarIconSwap
                                iconKey={showAskCopyCheck ? "check" : "copy"}
                              >
                                {showAskCopyCheck ? (
                                  <Check weight="bold" size={14} />
                                ) : (
                                  <Copy weight="bold" size={14} />
                                )}
                              </BarIconSwap>
                            </button>
                          )}
                          {askRyo.status === "done" && (
                            <button
                              type="button"
                              aria-label={t("apps.books.selection.askRyo")}
                              title={t("apps.books.selection.askRyo")}
                              onClick={handleContinueInChats}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/15 transition-colors hover:bg-current/25"
                              tabIndex={0}
                            >
                              <ChatCircleDots weight="bold" size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={t("common.dialog.done")}
                            onClick={dismissAskRyo}
                            className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-current/15 px-2.5 !text-[12px] leading-none transition-colors hover:bg-current/25"
                            tabIndex={0}
                          >
                            {t("common.dialog.done")}
                          </button>
                        </>
                      }
                    />
                  )}
                </motion.div>
              ) : selectionBarActive ? (
                <motion.div
                  key="selection"
                  className="flex items-center gap-0.5"
                  variants={BAR_ROW_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {/* Highlight color swatches */}
                  {BOOKS_HIGHLIGHT_COLORS.map((color) => {
                    const isActiveColor =
                      activeSelection?.kind === "highlight" &&
                      activeSelection.color === color;
                    return (
                      <motion.button
                        key={color}
                        type="button"
                        variants={BAR_ITEM_VARIANTS}
                        aria-label={t(`apps.books.selection.color.${color}`)}
                        title={t(`apps.books.selection.color.${color}`)}
                        onClick={() => applyHighlightColor(color)}
                        className={cn(
                          "group flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                          isAquaGlass ? null : "hover:bg-white/20"
                        )}
                        tabIndex={0}
                      >
                        <span
                          className={cn(
                            "h-4 w-4 rounded-full transition-transform group-hover:scale-110",
                            isActiveColor &&
                              "ring-2 ring-white ring-offset-1 ring-offset-black/40"
                          )}
                          style={{
                            backgroundColor: BOOKS_HIGHLIGHT_COLOR_HEX[color],
                          }}
                        />
                      </motion.button>
                    );
                  })}
                  {/* currentColor keeps the divider matched to the icon color
                      on both light and dark overlay palettes. */}
                  <motion.span
                    aria-hidden
                    variants={BAR_ITEM_VARIANTS}
                    className="mx-0.5 h-4 w-px shrink-0 bg-current/20"
                  />
                  <motion.button
                    type="button"
                    variants={BAR_ITEM_VARIANTS}
                    aria-label={
                      showCopyCheck
                        ? t("apps.books.selection.copied")
                        : t("apps.books.selection.copy")
                    }
                    title={
                      showCopyCheck
                        ? t("apps.books.selection.copied")
                        : t("apps.books.selection.copy")
                    }
                    onClick={handleCopySelection}
                    className={speechOverlayButtonClass}
                    tabIndex={0}
                  >
                    <BarIconSwap iconKey={showCopyCheck ? "check" : "copy"}>
                      {showCopyCheck ? (
                        <Check weight="bold" size={16} />
                      ) : (
                        <Copy weight="bold" size={16} />
                      )}
                    </BarIconSwap>
                  </motion.button>
                  <motion.button
                    type="button"
                    variants={BAR_ITEM_VARIANTS}
                    aria-label={t("apps.books.selection.askRyo")}
                    title={t("apps.books.selection.askRyo")}
                    onClick={handleAskRyo}
                    className={speechOverlayButtonClass}
                    tabIndex={0}
                  >
                    <ChatCircleDots weight="bold" size={16} />
                  </motion.button>
                  {activeSelection?.kind === "highlight" && (
                    <motion.button
                      type="button"
                      variants={BAR_ITEM_VARIANTS}
                      aria-label={t("apps.books.selection.removeHighlight")}
                      title={t("apps.books.selection.removeHighlight")}
                      onClick={removeActiveHighlight}
                      className={speechOverlayButtonClass}
                      tabIndex={0}
                    >
                      <Trash weight="bold" size={16} />
                    </motion.button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="speech"
                  className="flex items-center gap-0.5"
                  variants={BAR_ROW_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
              <motion.button
                type="button"
                variants={BAR_ITEM_VARIANTS}
                aria-label={t("apps.books.speech.rewind")}
                title={t("apps.books.speech.rewind")}
                onClick={skipToPreviousSentence}
                disabled={!isSpeaking}
                className={speechOverlayButtonClass}
                tabIndex={speechBarOpen ? 0 : -1}
              >
                <Rewind weight="fill" size={16} />
              </motion.button>
              <motion.button
                type="button"
                variants={BAR_ITEM_VARIANTS}
                aria-label={
                  !isSpeaking
                    ? t("apps.books.menu.startSpeaking")
                    : isPaused
                      ? t("apps.books.speech.resume")
                      : t("apps.books.speech.pause")
                }
                title={
                  !isSpeaking
                    ? t("apps.books.menu.startSpeaking")
                    : isPaused
                      ? t("apps.books.speech.resume")
                      : t("apps.books.speech.pause")
                }
                onClick={() => {
                  if (!isSpeaking) startSpeaking();
                  else if (isPaused) resumeSpeaking();
                  else pauseSpeaking();
                }}
                disabled={!isSpeaking && !isReady}
                className={speechOverlayButtonClass}
                tabIndex={speechBarOpen ? 0 : -1}
              >
                <BarIconSwap
                  iconKey={!isSpeaking || isPaused ? "play" : "pause"}
                >
                  {!isSpeaking || isPaused ? (
                    <Play weight="fill" size={16} />
                  ) : (
                    <Pause weight="fill" size={16} />
                  )}
                </BarIconSwap>
              </motion.button>
              <motion.button
                type="button"
                variants={BAR_ITEM_VARIANTS}
                aria-label={t("apps.books.speech.skip")}
                title={t("apps.books.speech.skip")}
                onClick={skipToNextSentence}
                disabled={!isSpeaking}
                className={speechOverlayButtonClass}
                tabIndex={speechBarOpen ? 0 : -1}
              >
                <FastForward weight="fill" size={16} />
              </motion.button>
              {/* Playback off → the stop slot becomes a Customize shortcut.
                  One button so the glyph swap (stop / close / customize)
                  animates instead of remounting. */}
              <motion.button
                type="button"
                variants={BAR_ITEM_VARIANTS}
                aria-label={
                  isSpeaking
                    ? t("apps.books.speech.stop")
                    : isCustomizeOpen
                      ? t("common.menu.close")
                      : t("apps.books.customize.title")
                }
                title={
                  isSpeaking
                    ? t("apps.books.speech.stop")
                    : isCustomizeOpen
                      ? t("common.menu.close")
                      : t("apps.books.customize.title")
                }
                onClick={
                  isSpeaking
                    ? stopSpeaking
                    : isCustomizeOpen
                      ? onHideCustomize
                      : onShowCustomize
                }
                className={speechOverlayButtonClass}
                tabIndex={speechBarOpen ? 0 : -1}
              >
                <BarIconSwap
                  iconKey={
                    isSpeaking
                      ? "stop"
                      : isCustomizeOpen
                        ? "close"
                        : "customize"
                  }
                >
                  {isSpeaking ? (
                    <Stop weight="fill" size={16} />
                  ) : isCustomizeOpen ? (
                    <X weight="bold" size={14} />
                  ) : (
                    <TextAa weight="bold" size={16} />
                  )}
                </BarIconSwap>
              </motion.button>
                </motion.div>
              )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Page-turn animation. epub.js only ever has the single current page
          rendered, so a true two-page slide (or a curl showing the outgoing
          page) would require expensive DOM snapshotting (html2canvas), which is
          too slow/janky to be worth it. Instead an opaque "page" sheet slides
          off in the reading direction, revealing the freshly-rendered next/prev
          page underneath — so the transition shows real content, cheaply. */}
      <AnimatePresence
        onExitComplete={() => {
          flipLockRef.current = false;
        }}
      >
        {flip && (
          <motion.div
            key={flip.id}
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
          >
            <motion.div
              className="absolute inset-0"
              style={{
                backgroundColor: overlayBackground,
                // Subtle fold shading along the sheet's leading edge.
                backgroundImage:
                  flip.dir === (isVerticalText ? "prev" : "next")
                    ? "linear-gradient(to right, rgba(0,0,0,0) 86%, rgba(0,0,0,0.08))"
                    : "linear-gradient(to left, rgba(0,0,0,0) 86%, rgba(0,0,0,0.08))",
                // Drop shadow cast onto the page being revealed.
                boxShadow:
                  flip.dir === (isVerticalText ? "prev" : "next")
                    ? "10px 0 26px rgba(0,0,0,0.28)"
                    : "-10px 0 26px rgba(0,0,0,0.28)",
              }}
              initial={{ x: "0%" }}
              animate={{
                x:
                  flip.dir === (isVerticalText ? "prev" : "next")
                    ? "-100%"
                    : "100%",
              }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
              onAnimationComplete={() => {
                // Release the lock as soon as the slide settles (not after the
                // exit fade) so fast page-turning stays responsive.
                flipLockRef.current = false;
                setFlip(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading shim shown behind the cover while the EPUB lays out. */}
      {!isReady && !loadError && (
        <div
          className={cn(
            "absolute inset-0 z-30 flex items-center justify-center",
            palette.isDark ? "text-white/70" : "text-black/50"
          )}
          style={{ backgroundColor: overlayBackground }}
        >
          <span className="font-os-ui text-sm">…</span>
        </div>
      )}

      {/* Error message shown when the EPUB can't be opened. */}
      {loadError && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center px-6 text-center"
          style={{ backgroundColor: overlayBackground }}
        >
          <span
            className={cn(
              "font-os-ui text-sm",
              palette.isDark ? "text-white/70" : "text-black/55"
            )}
          >
            {loadError}
          </span>
        </div>
      )}

      {/* Zoom-in cover overlay: grows from the clicked shelf cover to full-bleed.
          Animating width/height (not transform-scale) keeps the object-cover
          image from distorting during the zoom. */}
      <AnimatePresence>
        {coverVisible && zoom && (
          <motion.div
            className="pointer-events-none absolute z-40 overflow-hidden"
            style={{ backgroundColor: overlayBackground }}
            initial={{
              top: zoom.from.top,
              left: zoom.from.left,
              width: zoom.from.width,
              height: zoom.from.height,
              borderRadius: 4,
            }}
            animate={{
              top: zoom.to.top,
              left: zoom.to.left,
              width: zoom.to.width,
              height: zoom.to.height,
              borderRadius: 0,
            }}
            exit={{ opacity: 0 }}
            transition={{
              default: { duration: ZOOM_DURATION, ease: ZOOM_EASE },
              opacity: { duration: 0.3 },
            }}
          >
            <BookCover
              title={entry.name}
              fileName={entry.fileName}
              info={coverInfo}
              loading={coverLoading}
              large
              fit="contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
