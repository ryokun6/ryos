import {
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import ePub, { type Book, type NavItem, type Rendition } from "epubjs";
import { cn } from "@/lib/utils";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { readBookBlobContent } from "@/services/vfs/FileContentRepository";
import type { BooksReaderSettings } from "@/stores/useBooksStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import {
  buildEpubTheme,
  buildFontFaceCss,
  columnModeToSpread,
  displayEpubTargetWithFallback,
  isLikelyEpubBuffer,
  reflowEpubAfterFontsSettle,
  resolveEpubDisplayFallbackTarget,
  resolveReadingPalette,
} from "../utils/booksReader";
import {
  canTurnPage,
  isPageTurnGestureStartAllowed,
  measurePageTurnGesture,
  shouldCommitPageTurn,
  type PageTurnGestureMetrics,
  type PageTurnGesturePoint,
} from "../utils/pageTurnGesture";
import {
  applyChineseScriptToDocument,
  createChineseScriptConversionSession,
  resolveChineseScriptReadingLanguage,
} from "../utils/chineseScriptConverter";
import { useBookCover } from "../utils/useBookCover";
import { BookCover } from "./BookCover";
import type {
  BooksLibraryEntry,
  BookOriginRect,
} from "../hooks/useBooksLogic";
import { createClientLogger } from "@/utils/logger";

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
  originY: number;
  tiltDeg: number;
  dragProgress: number;
}

interface ActivePageTurnGesture {
  pointerId: number;
  pointerType: string;
  start: PageTurnGesturePoint;
  viewportWidth: number;
  viewportHeight: number;
}

interface PageTurnPointerSample extends PageTurnGesturePoint {
  pointerId: number;
  pointerType: string;
  viewportWidth: number;
  viewportHeight: number;
}

interface PageTurnGestureHandlers {
  start: (sample: PageTurnPointerSample) => boolean;
  move: (sample: PageTurnPointerSample) => boolean;
  end: (sample: PageTurnPointerSample) => boolean;
  cancel: (pointerId: number) => void;
  consumeClick: () => boolean;
}

type BooksDebugLevel = "info" | "warn" | "error";
type BooksDebugSnapshot = Record<string, unknown>;

// Extra top clearance so the page never sits under the hover-revealed window
// titlebar (the window uses the full-bleed "notitlebar" material).
const TOP_CLEARANCE = 36;
// Footer that holds the reading-progress bar.
const FOOTER_HEIGHT = 30;
// Horizontal gutter around the text column. Applied as a left/right inset on the
// epub.js render host (rather than body padding) so epub.js's paginated column
// math stays correct — it computes columns from the host width.
const SIDE_CLEARANCE = 24;
// Width at which auto column mode switches to a two-page spread. epub.js
// defaults to 800; a lower value shows two columns on narrower windows.
const SPREAD_MIN_WIDTH = 560;

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

function measureActivePageTurnGesture(
  active: ActivePageTurnGesture,
  current: PageTurnGesturePoint
): PageTurnGestureMetrics {
  return measurePageTurnGesture({
    start: active.start,
    current,
    viewportWidth: active.viewportWidth,
    viewportHeight: active.viewportHeight,
  });
}

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
  },
  ref
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderHostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookLanguageRef = useRef<string | null>(null);
  const chineseScriptRef = useRef(settings.chineseScript);
  chineseScriptRef.current = settings.chineseScript;
  const chineseScriptSessionRef = useRef(
    createChineseScriptConversionSession()
  );
  const flipLockRef = useRef(false);
  const flipNavigationCompleteRef = useRef(true);
  const flipAnimationCompleteRef = useRef(true);
  const activePageTurnGestureRef = useRef<ActivePageTurnGesture | null>(null);
  const pageTurnGestureHandlersRef = useRef<PageTurnGestureHandlers | null>(null);
  const suppressGestureClickUntilRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const initialCfiRef = useRef(initialCfi);
  const activeSectionHrefRef = useRef<string | undefined>(undefined);

  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const uiLanguageRef = useRef(uiLanguage);
  uiLanguageRef.current = uiLanguage;
  const prefersReducedMotion = useReducedMotion();
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
  const [pageTurnGesture, setPageTurnGesture] =
    useState<PageTurnGestureMetrics | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
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
    const response = await fetch(fallbackAssetUrl, { credentials: "same-origin" });
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

  const palette = resolveReadingPalette(settings.themeOverride, osIsDark);

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
    let displayedContentFontsReady: Promise<FontFaceSet> | undefined;
    setIsReady(false);
    setCoverVisible(true);
    setLoadError(null);
    bookLanguageRef.current = null;
    activeSectionHrefRef.current = undefined;
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
          package?: { metadata?: { language?: string } };
        };
        const bookLanguage =
          readyBook.package?.metadata?.language?.trim() || null;
        bookLanguageRef.current = bookLanguage;
        const readingLanguage = resolveChineseScriptReadingLanguage(
          chineseScriptRef.current,
          bookLanguage ?? uiLanguage
        );
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
          appendDebugEvent(`${renderStep}:start`, {
            width: host.clientWidth,
            height: host.clientHeight,
            spread: columnModeToSpread(settings.columnMode),
          });
          const nextRendition = activeBook.renderTo(host, {
            width: host.clientWidth || "100%",
            height: host.clientHeight || "100%",
            flow: "paginated",
            spread: columnModeToSpread(settings.columnMode),
            minSpreadWidth: SPREAD_MIN_WIDTH,
            manager: "default",
          });
          rendition = nextRendition;
          renditionRef.current = nextRendition;
          appendDebugEvent(`${renderStep}:success`);

          nextRendition.on("started", () =>
            appendDebugEvent("epubjs:rendition:started")
          );
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
            async (contents: {
              addStylesheetCss: (css: string, key: string) => void;
              document?: Document;
            }) => {
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

              const document = contents.document;
              if (!document) return;

              // epub.js renders into an iframe, so pointer events do not bubble
              // to the reader shell. Forward them through a stable ref and keep
              // pinch zoom available while reserving one-finger drags for page
              // turns.
              const contentWindow = document.defaultView;
              const getPointerSample = (
                event: PointerEvent
              ): PageTurnPointerSample => ({
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                x: event.clientX,
                y: event.clientY,
                time: event.timeStamp,
                viewportWidth:
                  contentWindow?.innerWidth ??
                  document.documentElement.clientWidth,
                viewportHeight:
                  contentWindow?.innerHeight ??
                  document.documentElement.clientHeight,
              });
              const onContentPointerDown = (event: PointerEvent) => {
                if (
                  !event.isPrimary ||
                  (event.pointerType === "mouse" && event.button !== 0)
                ) {
                  return;
                }
                pageTurnGestureHandlersRef.current?.start(
                  getPointerSample(event)
                );
              };
              const onContentPointerMove = (event: PointerEvent) => {
                if (
                  pageTurnGestureHandlersRef.current?.move(
                    getPointerSample(event)
                  )
                ) {
                  event.preventDefault();
                }
              };
              const onContentPointerUp = (event: PointerEvent) => {
                if (
                  pageTurnGestureHandlersRef.current?.end(
                    getPointerSample(event)
                  )
                ) {
                  event.preventDefault();
                }
              };
              const onContentPointerCancel = (event: PointerEvent) => {
                pageTurnGestureHandlersRef.current?.cancel(event.pointerId);
              };
              const onContentClick = (event: MouseEvent) => {
                if (pageTurnGestureHandlersRef.current?.consumeClick()) {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                }
              };
              const removePageTurnListeners = () => {
                document.removeEventListener(
                  "pointerdown",
                  onContentPointerDown
                );
                document.removeEventListener(
                  "pointermove",
                  onContentPointerMove
                );
                document.removeEventListener("pointerup", onContentPointerUp);
                document.removeEventListener(
                  "pointercancel",
                  onContentPointerCancel
                );
                document.removeEventListener("click", onContentClick, true);
              };
              document.documentElement.style.touchAction = "pinch-zoom";
              if (document.body) document.body.style.touchAction = "pinch-zoom";
              document.addEventListener("pointerdown", onContentPointerDown);
              document.addEventListener("pointermove", onContentPointerMove, {
                passive: false,
              });
              document.addEventListener("pointerup", onContentPointerUp);
              document.addEventListener(
                "pointercancel",
                onContentPointerCancel
              );
              document.addEventListener("click", onContentClick, true);
              contentWindow?.addEventListener(
                "unload",
                removePageTurnListeners,
                { once: true }
              );

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
                document.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
                  if (el.style?.color) {
                    el.style.removeProperty("color");
                  }
                });
              } catch {
                // ignore
              }

              if (document.fonts && renditionRef.current === nextRendition) {
                displayedContentFontsReady = document.fonts.ready;
              }

              const target = chineseScriptRef.current;
              try {
                const changedNodeCount = await applyChineseScriptToDocument(
                  document,
                  target,
                  chineseScriptSessionRef.current,
                  () =>
                    !cancelled &&
                    chineseScriptRef.current === target &&
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
            }
          );

          nextRendition.themes.default(
            buildEpubTheme(settings, palette, readingLanguage)
          );
          nextRendition.themes.fontSize(`${settings.fontSizePct}%`);
          appendDebugEvent("epubjs:theme:applied");

          nextRendition.on(
            "relocated",
            (location: {
              start?: { cfi?: string; href?: string; percentage?: number };
              atStart?: boolean;
              atEnd?: boolean;
            }) => {
              const cfi = location?.start?.cfi;
              const atStartNow = !!location?.atStart;
              const atEndNow = !!location?.atEnd;
              const activeHref = location?.start?.href;
              activeSectionHrefRef.current = activeHref;
              setAtStart(atStartNow);
              setAtEnd(atEndNow);
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
          const reflowedAfterFonts = await reflowEpubAfterFontsSettle({
            fontsReady: displayedContentFontsReady,
            rendition: displayedRendition,
            spread: columnModeToSpread(settings.columnMode),
            minSpreadWidth: SPREAD_MIN_WIDTH,
            target: displayResult.target,
            displayTimeoutMs: FALLBACK_DISPLAY_TIMEOUT_MS,
            isActive: () =>
              !cancelled && renditionRef.current === displayedRendition,
          });
          if (reflowedAfterFonts) {
            appendDebugEvent("epubjs:fonts:reflowed");
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
  // changes. Each section retains its original text so switching directions or
  // returning to Original never requires reloading the chapter.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!isReady || !rendition) return;
    let cancelled = false;
    const target = settings.chineseScript;
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
          () => !cancelled && chineseScriptRef.current === target
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
  }, [appendDebugEvent, isReady, settings.chineseScript]);

  // Apply theme (colors, font family, line height) live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    const readingLanguage = resolveChineseScriptReadingLanguage(
      settings.chineseScript,
      bookLanguageRef.current ?? uiLanguage
    );
    renditionRef.current.themes.default(
      buildEpubTheme(settings, palette, readingLanguage)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    settings.fontId,
    settings.themeOverride,
    settings.chineseScript,
    settings.lineHeight,
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

  const completeFlipWhenReady = useCallback(() => {
    if (
      !flipNavigationCompleteRef.current ||
      !flipAnimationCompleteRef.current
    ) {
      return;
    }
    flipLockRef.current = false;
    setFlip(null);
  }, []);

  const turnPage = useCallback(
    (dir: "next" | "prev", gesture?: PageTurnGestureMetrics) => {
      const rendition = renditionRef.current;
      if (!rendition || flipLockRef.current) return;
      const state = navigationStateRef.current;
      if (!canTurnPage(dir, state)) return;

      flipLockRef.current = true;
      flipNavigationCompleteRef.current = false;
      flipAnimationCompleteRef.current = false;
      setFlip({
        dir,
        id: Date.now(),
        originY: gesture?.originY ?? 0.5,
        tiltDeg: gesture?.tiltDeg ?? 0,
        dragProgress: gesture?.progress ?? 0,
      });

      let action: Promise<unknown> | unknown;
      try {
        action = dir === "next" ? rendition.next() : rendition.prev();
      } catch (error) {
        flipNavigationCompleteRef.current = true;
        flipAnimationCompleteRef.current = true;
        completeFlipWhenReady();
        appendDebugEvent("epubjs:pageTurn:failed", error, "error");
        return;
      }

      Promise.resolve(action)
        .catch((error) =>
          appendDebugEvent("epubjs:pageTurn:failed", error, "error")
        )
        .finally(() => {
          flipNavigationCompleteRef.current = true;
          completeFlipWhenReady();
        });
    },
    [appendDebugEvent, completeFlipWhenReady]
  );

  const beginPageTurnGesture = useCallback(
    (sample: PageTurnPointerSample): boolean => {
      const state = navigationStateRef.current;
      if (
        flipLockRef.current ||
        !state.isReady ||
        (!state.canGoPreviousPage && !state.canGoNextPage) ||
        !isPageTurnGestureStartAllowed({
          pointerType: sample.pointerType,
          startX: sample.x,
          viewportWidth: sample.viewportWidth,
        })
      ) {
        return false;
      }

      activePageTurnGestureRef.current = {
        pointerId: sample.pointerId,
        pointerType: sample.pointerType,
        start: { x: sample.x, y: sample.y, time: sample.time },
        viewportWidth: sample.viewportWidth,
        viewportHeight: sample.viewportHeight,
      };
      return true;
    },
    []
  );

  const movePageTurnGesture = useCallback(
    (sample: PageTurnPointerSample): boolean => {
      const active = activePageTurnGestureRef.current;
      if (!active || active.pointerId !== sample.pointerId) return false;

      const metrics = measureActivePageTurnGesture(active, sample);
      if (
        !metrics.isIntentional ||
        !metrics.direction ||
        !canTurnPage(metrics.direction, navigationStateRef.current)
      ) {
        setPageTurnGesture(null);
        return false;
      }

      setPageTurnGesture(metrics);
      return true;
    },
    []
  );

  const endPageTurnGesture = useCallback(
    (sample: PageTurnPointerSample): boolean => {
      const active = activePageTurnGestureRef.current;
      if (!active || active.pointerId !== sample.pointerId) return false;
      activePageTurnGestureRef.current = null;

      const metrics = measureActivePageTurnGesture(active, sample);
      const consumed = metrics.isIntentional;
      setPageTurnGesture(null);

      if (consumed) {
        suppressGestureClickUntilRef.current = Date.now() + 500;
      }

      if (
        metrics.direction &&
        shouldCommitPageTurn(metrics, navigationStateRef.current)
      ) {
        turnPage(metrics.direction, metrics);
      }

      return consumed;
    },
    [turnPage]
  );

  const cancelPageTurnGesture = useCallback((pointerId: number) => {
    if (activePageTurnGestureRef.current?.pointerId !== pointerId) return;
    activePageTurnGestureRef.current = null;
    setPageTurnGesture(null);
  }, []);

  const consumeGestureClick = useCallback((): boolean => {
    if (Date.now() > suppressGestureClickUntilRef.current) return false;
    suppressGestureClickUntilRef.current = 0;
    return true;
  }, []);

  pageTurnGestureHandlersRef.current = {
    start: beginPageTurnGesture,
    move: movePageTurnGesture,
    end: endPageTurnGesture,
    cancel: cancelPageTurnGesture,
    consumeClick: consumeGestureClick,
  };

  const getReaderPointerSample = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>
    ): PageTurnPointerSample => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        time: event.timeStamp,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
      };
    },
    []
  );

  const handleReaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      if (beginPageTurnGesture(getReaderPointerSample(event))) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort (some embedded WebViews omit it).
        }
      }
    },
    [beginPageTurnGesture, getReaderPointerSample]
  );

  const handleReaderPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (movePageTurnGesture(getReaderPointerSample(event))) {
        event.preventDefault();
      }
    },
    [getReaderPointerSample, movePageTurnGesture]
  );

  const handleReaderPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (endPageTurnGesture(getReaderPointerSample(event))) {
        event.preventDefault();
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore when capture was not established.
      }
    },
    [endPageTurnGesture, getReaderPointerSample]
  );

  const handleReaderPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      cancelPageTurnGesture(event.pointerId);
    },
    [cancelPageTurnGesture]
  );

  useImperativeHandle(
    ref,
    () => ({
      goToPreviousPage: () => turnPage("prev"),
      goToNextPage: () => turnPage("next"),
      goToChapter: (href: string) => {
        const rendition = renditionRef.current;
        if (!rendition || !href) return;
        flipLockRef.current = false;
        flipNavigationCompleteRef.current = true;
        flipAnimationCompleteRef.current = true;
        activePageTurnGestureRef.current = null;
        setPageTurnGesture(null);
        setFlip(null);
        Promise.resolve(rendition.display(href)).catch((error) =>
          appendDebugEvent("epubjs:chapterDisplay:failed", error, "error")
        );
      },
    }),
    [appendDebugEvent, turnPage]
  );

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        turnPage("next");
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        turnPage("prev");
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
      className="relative h-full w-full overflow-hidden outline-none"
      style={{
        backgroundColor: palette.background,
        touchAction: "pinch-zoom",
      }}
      onPointerDown={handleReaderPointerDown}
      onPointerMove={handleReaderPointerMove}
      onPointerUp={handleReaderPointerUp}
      onPointerCancel={handleReaderPointerCancel}
    >
      {/* The epub.js render target, inset below the top clearance, above the
          progress footer, and with side gutters for a comfortable measure. */}
      <div
        ref={renderHostRef}
        className="absolute"
        style={{
          top: TOP_CLEARANCE,
          bottom: FOOTER_HEIGHT,
          left: SIDE_CLEARANCE,
          right: SIDE_CLEARANCE,
        }}
      />

      {/* A quiet page-edge vignette gives the flat EPUB iframe some depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-[5]"
        style={{
          top: TOP_CLEARANCE,
          bottom: FOOTER_HEIGHT,
          left: SIDE_CLEARANCE,
          right: SIDE_CLEARANCE,
          background: palette.isDark
            ? "linear-gradient(to right, rgba(0,0,0,0.18), transparent 4%, transparent 96%, rgba(0,0,0,0.18))"
            : "linear-gradient(to right, rgba(58,45,30,0.06), transparent 4%, transparent 96%, rgba(58,45,30,0.06))",
          boxShadow: palette.isDark
            ? "inset 0 0 22px rgba(0,0,0,0.12)"
            : "inset 0 0 18px rgba(76,58,36,0.035)",
        }}
      />

      {/* Click zones for page turning (aligned with the render host) */}
      <button
        type="button"
        aria-label="Previous page"
        aria-disabled={atStart}
        onClick={() => {
          if (!consumeGestureClick()) turnPage("prev");
        }}
        style={{ top: TOP_CLEARANCE, bottom: FOOTER_HEIGHT }}
        className={cn(
          "absolute left-0 z-10 w-[22%]",
          atStart ? "cursor-default" : "cursor-w-resize"
        )}
      />
      <button
        type="button"
        aria-label="Next page"
        aria-disabled={atEnd}
        onClick={() => {
          if (!consumeGestureClick()) turnPage("next");
        }}
        style={{ top: TOP_CLEARANCE, bottom: FOOTER_HEIGHT }}
        className={cn(
          "absolute right-0 z-10 w-[22%]",
          atEnd ? "cursor-default" : "cursor-e-resize"
        )}
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

      {/* Follow a held pointer with a light page curl before committing the
          rendition change. The contact point controls both the crease and tilt,
          so diagonal drags feel attached rather than forced onto a flat axis. */}
      <AnimatePresence>
        {!flip && pageTurnGesture?.direction && (
          <motion.div
            key={`gesture-${pageTurnGesture.direction}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            style={{ perspective: 1200 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.12 }}
          >
            <motion.div
              className={cn(
                "absolute w-[28%]",
                pageTurnGesture.direction === "next" ? "right-0" : "left-0"
              )}
              style={{
                top: TOP_CLEARANCE,
                bottom: FOOTER_HEIGHT,
                background:
                  pageTurnGesture.direction === "next"
                    ? "linear-gradient(to left, rgba(0,0,0,0.12), transparent)"
                    : "linear-gradient(to right, rgba(0,0,0,0.12), transparent)",
                transformOrigin:
                  pageTurnGesture.direction === "next"
                    ? "right center"
                    : "left center",
              }}
              animate={{
                opacity: 0.12 + pageTurnGesture.progress * 0.58,
                scaleX: 0.2 + pageTurnGesture.progress * 0.8,
              }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 42,
                mass: 0.25,
              }}
            />
            <motion.div
              className={cn(
                "absolute overflow-hidden",
                pageTurnGesture.direction === "next" ? "right-[-2px]" : "left-[-2px]"
              )}
              style={{
                top: TOP_CLEARANCE + 3,
                bottom: FOOTER_HEIGHT + 3,
                width: `${Math.min(
                  34,
                  5 + pageTurnGesture.progress * 31
                )}%`,
                backgroundColor: palette.background,
                backgroundImage: `${
                  palette.isDark
                    ? "radial-gradient(ellipse at center, rgba(255,255,255,0.08), transparent 62%)"
                    : "radial-gradient(ellipse at center, rgba(255,255,255,0.72), transparent 64%)"
                }, ${
                  pageTurnGesture.direction === "next"
                    ? "linear-gradient(to right, rgba(0,0,0,0.02), rgba(0,0,0,0.13))"
                    : "linear-gradient(to left, rgba(0,0,0,0.02), rgba(0,0,0,0.13))"
                }`,
                borderRadius:
                  pageTurnGesture.direction === "next"
                    ? "70% 0 0 70% / 18% 0 0 18%"
                    : "0 70% 70% 0 / 0 18% 18% 0",
                boxShadow:
                  pageTurnGesture.direction === "next"
                    ? "-10px 0 24px rgba(0,0,0,0.2)"
                    : "10px 0 24px rgba(0,0,0,0.2)",
                transformOrigin: `${
                  pageTurnGesture.direction === "next" ? "right" : "left"
                } ${pageTurnGesture.originY * 100}%`,
                transformPerspective: 1200,
              }}
              initial={{ opacity: 0, scaleX: 0.35 }}
              animate={{
                opacity: 0.72 + pageTurnGesture.progress * 0.28,
                x:
                  pageTurnGesture.direction === "next"
                    ? -pageTurnGesture.progress * 14
                    : pageTurnGesture.progress * 14,
                rotateY: prefersReducedMotion
                  ? 0
                  : pageTurnGesture.direction === "next"
                    ? -(8 + pageTurnGesture.progress * 15)
                    : 8 + pageTurnGesture.progress * 15,
                rotateZ: prefersReducedMotion
                  ? 0
                  : pageTurnGesture.tiltDeg *
                    (pageTurnGesture.direction === "next" ? -0.45 : 0.45),
                scaleX: 1,
              }}
              exit={{
                opacity: 0,
                scaleX: 0.45,
                transition: { duration: prefersReducedMotion ? 0 : 0.14 },
              }}
              transition={{
                type: "spring",
                stiffness: 520,
                damping: 40,
                mass: 0.28,
              }}
            >
              <div
                className={cn(
                  "absolute inset-y-0 w-[3px]",
                  pageTurnGesture.direction === "next" ? "left-0" : "right-0"
                )}
                style={{
                  background: palette.isDark
                    ? "linear-gradient(to right, rgba(255,255,255,0.03), rgba(0,0,0,0.32))"
                    : "linear-gradient(to right, rgba(255,255,255,0.75), rgba(73,52,30,0.2))",
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* epub.js keeps one live page, so the committed turn uses a paper sheet
          while it swaps content underneath. A shaped edge, contact-point
          lighting, and perspective make the inexpensive transition read as a
          curl instead of a blank horizontal panel. */}
      <AnimatePresence>
        {flip && (
          <motion.div
            key={flip.id}
            aria-hidden="true"
            className="absolute inset-0 z-20 overflow-hidden"
            style={{ perspective: 1400 }}
          >
            <motion.div
              className="absolute inset-0 overflow-hidden"
              style={{
                backgroundColor: palette.background,
                backgroundImage: `${
                  palette.isDark
                    ? `radial-gradient(ellipse at ${
                        flip.dir === "next" ? "100%" : "0%"
                      } ${flip.originY * 100}%, rgba(255,255,255,0.08), transparent 48%)`
                    : `radial-gradient(ellipse at ${
                        flip.dir === "next" ? "100%" : "0%"
                      } ${flip.originY * 100}%, rgba(255,255,255,0.7), transparent 52%)`
                }, ${
                  flip.dir === "next"
                    ? "linear-gradient(to right, transparent 79%, rgba(59,43,25,0.1) 96%, rgba(0,0,0,0.16))"
                    : "linear-gradient(to left, transparent 79%, rgba(59,43,25,0.1) 96%, rgba(0,0,0,0.16))"
                }, repeating-linear-gradient(0deg, transparent 0, transparent 4px, rgba(80,60,40,0.012) 5px)`,
                boxShadow:
                  flip.dir === "next"
                    ? "12px 0 32px rgba(0,0,0,0.3)"
                    : "-12px 0 32px rgba(0,0,0,0.3)",
                transformOrigin: `${
                  flip.dir === "next" ? "right" : "left"
                } ${flip.originY * 100}%`,
                transformPerspective: 1400,
              }}
              initial={{
                x: `${
                  (flip.dir === "next" ? -1 : 1) *
                  Math.min(14, flip.dragProgress * 18)
                }%`,
                rotateY: prefersReducedMotion
                  ? 0
                  : (flip.dir === "next" ? -1 : 1) *
                    (1.5 + flip.dragProgress * 5),
                rotateZ: prefersReducedMotion ? 0 : flip.tiltDeg * 0.28,
              }}
              animate={{
                x: flip.dir === "next" ? "-104%" : "104%",
                rotateY: prefersReducedMotion
                  ? 0
                  : flip.dir === "next"
                    ? -8
                    : 8,
                rotateZ: prefersReducedMotion ? 0 : flip.tiltDeg * 0.12,
                scaleY: prefersReducedMotion ? 1 : 0.992,
              }}
              exit={{
                opacity: 0,
                transition: { duration: prefersReducedMotion ? 0 : 0.08 },
              }}
              transition={{
                duration: prefersReducedMotion
                  ? 0.12
                  : flip.dragProgress > 0
                    ? 0.34
                    : 0.42,
                ease: [0.32, 0.72, 0, 1],
              }}
              onAnimationComplete={() => {
                flipAnimationCompleteRef.current = true;
                completeFlipWhenReady();
              }}
            >
              <div
                className={cn(
                  "absolute inset-y-0 w-[7%]",
                  flip.dir === "next" ? "right-0" : "left-0"
                )}
                style={{
                  background:
                    flip.dir === "next"
                      ? "linear-gradient(to right, transparent, rgba(0,0,0,0.13))"
                      : "linear-gradient(to left, transparent, rgba(0,0,0,0.13))",
                }}
              />
              <div
                className={cn(
                  "absolute inset-y-0 w-px",
                  flip.dir === "next" ? "right-0" : "left-0"
                )}
                style={{
                  backgroundColor: palette.isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(66,46,24,0.2)",
                }}
              />
            </motion.div>
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
          style={{ backgroundColor: palette.background }}
        >
          <span className="font-os-ui text-sm">…</span>
        </div>
      )}

      {/* Error message shown when the EPUB can't be opened. */}
      {loadError && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center px-6 text-center"
          style={{ backgroundColor: palette.background }}
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
            style={{ backgroundColor: palette.background }}
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
