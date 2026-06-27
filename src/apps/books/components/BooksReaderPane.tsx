import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
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
  isLikelyEpubBuffer,
  resolveReadingPalette,
} from "../utils/booksReader";
import { useBookCover } from "../utils/useBookCover";
import { BookCover } from "./BookCover";
import type {
  BooksLibraryEntry,
  BookOriginRect,
} from "../hooks/useBooksLogic";

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
}

type BooksDebugLevel = "info" | "warn" | "error";

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
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (value instanceof DOMException) {
    return {
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
  const flipLockRef = useRef(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const initialCfiRef = useRef(initialCfi);
  const activeSectionHrefRef = useRef<string | undefined>(undefined);

  const { t } = useTranslation();
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
      const log =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : console.log;
      log("[BooksReader]", step, debugData);
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
    setIsReady(false);
    setCoverVisible(true);
    setLoadError(null);
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

    const watch = async <T,>(step: string, promise: Promise<T>): Promise<T> => {
      const timeout = window.setTimeout(() => {
        appendDebugEvent(`${step}:stillPending`, undefined, "warn");
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
          appendDebugEvent("epubjs:book:openFailed", error, "error");
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
          package?: { metadata?: unknown };
        };
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

        appendDebugEvent("epubjs:renderTo:start", {
          width: host.clientWidth,
          height: host.clientHeight,
          spread: columnModeToSpread(settings.columnMode),
        });
        rendition = book.renderTo(host, {
          width: host.clientWidth || "100%",
          height: host.clientHeight || "100%",
          flow: "paginated",
          spread: columnModeToSpread(settings.columnMode),
          minSpreadWidth: SPREAD_MIN_WIDTH,
          manager: "default",
        });
        renditionRef.current = rendition;
        appendDebugEvent("epubjs:renderTo:success");

        rendition.on("started", () =>
          appendDebugEvent("epubjs:rendition:started")
        );
        rendition.on("attached", () =>
          appendDebugEvent("epubjs:rendition:attached")
        );
        rendition.on("rendered", (section: { href?: string; idref?: string }) =>
          appendDebugEvent("epubjs:rendition:rendered", {
            href: section?.href,
            idref: section?.idref,
          })
        );
        rendition.on("displayed", (section: { href?: string; idref?: string }) =>
          appendDebugEvent("epubjs:rendition:displayed", {
            href: section?.href,
            idref: section?.idref,
          })
        );
        rendition.on("displayError", (error: unknown) =>
          appendDebugEvent("epubjs:rendition:displayError", error, "error")
        );
        rendition.on(
          "layout",
          (props: unknown, changed: unknown) =>
            appendDebugEvent("epubjs:rendition:layout", { props, changed })
        );
        rendition.on("resized", (size: unknown) =>
          appendDebugEvent("epubjs:rendition:resized", size)
        );

        const fontFaceCss = buildFontFaceCss(window.location.origin);
        rendition.hooks.content.register(
          (contents: {
            addStylesheetCss: (css: string, key: string) => void;
            document?: Document;
          }) => {
            try {
              contents.addStylesheetCss(fontFaceCss, "ryos-book-fonts");
              appendDebugEvent("epubjs:contentHook:fonts:success");
            } catch {
              appendDebugEvent("epubjs:contentHook:fonts:failed", undefined, "warn");
            }
            // `hyphens: auto` only kicks in when the content language is known.
            // Many EPUBs omit it, so default to English when absent.
            try {
              const docEl = contents.document?.documentElement;
              if (docEl && !docEl.getAttribute("lang")) {
                docEl.setAttribute("lang", "en");
              }
            } catch {
              // ignore
            }
            // Strip publisher inline `color` styles so the themed reading color
            // always wins. A stylesheet (even `!important`) can't beat an inline
            // `color: … !important`, so removing the inline declaration is the
            // only reliable way to guarantee legibility (e.g. dark-on-dark).
            try {
              const doc = contents.document;
              if (doc) {
                doc
                  .querySelectorAll<HTMLElement>("[style]")
                  .forEach((el) => {
                    if (el.style?.color) {
                      el.style.removeProperty("color");
                    }
                  });
              }
            } catch {
              // ignore
            }
          }
        );

        rendition.themes.default(buildEpubTheme(settings, palette));
        rendition.themes.fontSize(`${settings.fontSizePct}%`);
        appendDebugEvent("epubjs:theme:applied");

        const activeBook = book;
        rendition.on(
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

        rendition.on("keyup", (event: KeyboardEvent) => handleKey(event));

        try {
          appendDebugEvent("epubjs:display:start", {
            initialCfi: initialCfiRef.current,
          });
          await watch(
            "epubjs:display",
            rendition.display(initialCfiRef.current || undefined)
          );
          appendDebugEvent("epubjs:display:success");
        } catch (err) {
          // Corrupt / incompatible EPUB — show an error instead of revealing an
          // empty reader shell. Do not proceed to setIsReady / cover hide.
          if (!cancelled) {
            console.error("[Books] Failed to display book", err);
            appendDebugEvent("epubjs:display:failed", err, "error");
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
          console.error("[Books] Failed to open book", err);
          appendDebugEvent("reader:open:failed", err, "error");
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

  // Apply theme (colors, font family, line height) live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    renditionRef.current.themes.default(buildEpubTheme(settings, palette));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    settings.fontId,
    settings.themeOverride,
    settings.lineHeight,
    osIsDark,
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

  useImperativeHandle(
    ref,
    () => ({
      goToPreviousPage: () => turnPage("prev"),
      goToNextPage: () => turnPage("next"),
      goToChapter: (href: string) => {
        const rendition = renditionRef.current;
        if (!rendition || !href) return;
        flipLockRef.current = false;
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
      style={{ backgroundColor: palette.background }}
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

      {/* Click zones for page turning (aligned with the render host) */}
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => turnPage("prev")}
        disabled={atStart}
        style={{ top: TOP_CLEARANCE, bottom: FOOTER_HEIGHT }}
        className="absolute left-0 z-10 w-[22%] cursor-w-resize disabled:cursor-default"
      />
      <button
        type="button"
        aria-label="Next page"
        onClick={() => turnPage("next")}
        disabled={atEnd}
        style={{ top: TOP_CLEARANCE, bottom: FOOTER_HEIGHT }}
        className="absolute right-0 z-10 w-[22%] cursor-e-resize disabled:cursor-default"
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
                backgroundColor: palette.background,
                // Subtle fold shading along the sheet's leading edge.
                backgroundImage:
                  flip.dir === "next"
                    ? "linear-gradient(to right, rgba(0,0,0,0) 86%, rgba(0,0,0,0.08))"
                    : "linear-gradient(to left, rgba(0,0,0,0) 86%, rgba(0,0,0,0.08))",
                // Drop shadow cast onto the page being revealed.
                boxShadow:
                  flip.dir === "next"
                    ? "10px 0 26px rgba(0,0,0,0.28)"
                    : "-10px 0 26px rgba(0,0,0,0.28)",
              }}
              initial={{ x: "0%" }}
              animate={{ x: flip.dir === "next" ? "-100%" : "100%" }}
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
