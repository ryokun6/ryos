import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type HanziWriter from "hanzi-writer";
import type { CharacterJson, HanziWriterOptions } from "hanzi-writer";
import type { DictionaryEntry, DictionaryHanziInfo } from "@/shared/dictionary";
import { useThemeStore } from "@/stores/useThemeStore";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import {
  hanziCardGlyph,
  hanziCardReadings,
  hanziCardVariant,
  hanziCardsForEntry,
} from "../utils/hanziCards";
import {
  hanziCharDataLoader,
  type HanziCharDataLoader,
} from "../utils/hanziStrokeData";
import { cn } from "@/lib/utils";
import { DICTIONARY_CHARACTER_CARD_BUTTON_CLASS } from "../utils/styles";
import { ReadingLine } from "./DictionaryReading";

const STROKE_SIZE = 64;

type StrokePhase = "loading" | "ready" | "fallback";

type WriterSession = {
  disposed: boolean;
  loaded: boolean;
};

function withAlpha(color: string, alpha: number): string {
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  const hex = /^#([\da-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  return `rgba(17, 17, 17, ${alpha})`;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Promise<unknown>).then === "function"
  );
}

/** hanzi-writer throws synchronously from `_withData` when character data failed. */
function callWriter(writer: HanziWriter, call: (writer: HanziWriter) => unknown): void {
  try {
    const result = call(writer);
    if (isThenable(result)) void result.catch(() => undefined);
  } catch {
    // Unloaded or failed writers throw "Failed to load character data".
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function hanziStrokeKey(wordKey: string, card: DictionaryHanziInfo, glyph: string): string {
  return `${wordKey}:${glyph}:${card.traditional}:${card.simplified}:${card.reading ?? ""}`;
}

function HanziGlyph({ character }: { character: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center text-[32px] leading-none"
      lang="zh"
    >
      {character}
    </span>
  );
}

const STROKE_FRAME_CLASS =
  "relative size-16 shrink-0 overflow-hidden rounded border border-black/10 bg-os-input-bg text-os-text-primary dark:border-white/15";

export function HanziStroke({
  character,
  label,
  charDataLoader = hanziCharDataLoader,
}: {
  character: string;
  label: string;
  charDataLoader?: HanziCharDataLoader;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  const loadedRef = useRef(false);
  const replayTokenRef = useRef(0);
  const reduceMotionRef = useRef(false);
  const [phase, setPhase] = useState<StrokePhase>("loading");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const isDarkMode = useThemeStore((state) => state.isDark);
  const currentTheme = useThemeStore((state) => state.current);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const session: WriterSession = { disposed: false, loaded: false };
    const abort = new AbortController();
    let activeWriter: HanziWriter | null = null;
    let pageVisible = document.visibilityState !== "hidden";
    let inView = true;
    let observer: IntersectionObserver | null = null;

    loadedRef.current = false;
    writerRef.current = null;
    setPhase("loading");
    host.replaceChildren();
    reduceMotionRef.current = prefersReducedMotion();

    const setPhaseIfActive = (next: StrokePhase) => {
      if (session.disposed) return;
      setPhase(next);
    };

    const syncPlayback = () => {
      const writer = activeWriter;
      if (session.disposed || !session.loaded || !writer) return;
      if (reduceMotionRef.current) {
        callWriter(writer, (current) => current.showCharacter());
        return;
      }
      if (pageVisible && inView) {
        callWriter(writer, (current) => current.loopCharacterAnimation());
        return;
      }
      callWriter(writer, (current) => current.pauseAnimation());
    };

    const onVisibility = () => {
      if (session.disposed) return;
      pageVisible = document.visibilityState !== "hidden";
      syncPlayback();
    };
    try {
      document.addEventListener("visibilitychange", onVisibility, { signal: abort.signal });
    } catch {
      document.addEventListener("visibilitychange", onVisibility);
    }

    const ObserverCtor = window.IntersectionObserver;
    if (typeof ObserverCtor === "function") {
      try {
        observer = new ObserverCtor((entries) => {
          if (session.disposed) return;
          const entry = entries[entries.length - 1];
          if (!entry) return;
          inView = entry.isIntersecting;
          syncPlayback();
        });
        observer.observe(host);
      } catch {
        observer = null;
      }
    }

    void import("hanzi-writer")
      .then(({ default: HanziWriter }) => {
        if (session.disposed || hostRef.current !== host) return;
        const ink = getComputedStyle(host).color || "#111111";
        const options: Partial<HanziWriterOptions> = {
          width: STROKE_SIZE,
          height: STROKE_SIZE,
          padding: 5,
          showOutline: true,
          showCharacter: false,
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 160,
          delayBetweenLoops: 800,
          strokeFadeDuration: 200,
          strokeColor: ink,
          radicalColor: null,
          outlineColor: withAlpha(ink, 0.28),
          charDataLoader: (char, onLoad, onError) => {
            charDataLoader(
              char,
              (data) => {
                if (session.disposed || abort.signal.aborted) {
                  onError?.(new DOMException("The operation was aborted.", "AbortError"));
                  return;
                }
                onLoad(data as CharacterJson);
              },
              (error) => {
                onError?.(error);
              },
              abort.signal
            );
          },
          onLoadCharDataSuccess: () => {
            if (session.disposed) return;
            session.loaded = true;
            loadedRef.current = true;
            setPhaseIfActive("ready");
            syncPlayback();
          },
          onLoadCharDataError: () => {
            if (session.disposed) return;
            session.loaded = false;
            loadedRef.current = false;
            setPhaseIfActive("fallback");
          },
        };
        try {
          activeWriter = new HanziWriter(host, options);
          writerRef.current = activeWriter;
          const pending = activeWriter.setCharacter(character);
          void Promise.resolve(pending).catch(() => {
            if (session.disposed) return;
            session.loaded = false;
            loadedRef.current = false;
            setPhaseIfActive("fallback");
          });
        } catch {
          activeWriter = null;
          writerRef.current = null;
          setPhaseIfActive("fallback");
        }
      })
      .catch(() => {
        setPhaseIfActive("fallback");
      });

    return () => {
      const current = writerRef.current;
      const wasLoaded = loadedRef.current;
      session.disposed = true;
      session.loaded = false;
      loadedRef.current = false;
      writerRef.current = null;
      activeWriter = null;
      replayTokenRef.current += 1;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (wasLoaded && current) {
        try {
          current.cancelQuiz();
        } catch {
          // Quiz teardown is optional once the node is discarded.
        }
        callWriter(current, (writer) => writer.pauseAnimation());
      }
      abort.abort();
      try {
        host.replaceChildren();
      } catch {
        // The host can already be detached during unmount.
      }
    };
  }, [character, charDataLoader, currentTheme, isDarkMode]);

  const replay = () => {
    const writer = writerRef.current;
    if (!writer || !loadedRef.current || phaseRef.current === "fallback") return;
    const token = ++replayTokenRef.current;
    callWriter(writer, (active) =>
      active.animateCharacter({
        onComplete: () => {
          if (
            token !== replayTokenRef.current ||
            reduceMotionRef.current ||
            !loadedRef.current
          ) {
            return;
          }
          callWriter(active, (current) => current.loopCharacterAnimation());
        },
      })
    );
  };

  return (
    <div className={STROKE_FRAME_CLASS}>
      {phase !== "ready" ? <HanziGlyph character={character} /> : null}
      <div
        ref={hostRef}
        role="button"
        tabIndex={0}
        className="dictionary-hanzi-stroke relative z-10 size-full cursor-pointer"
        aria-label={label}
        onClick={replay}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          replay();
        }}
      />
    </div>
  );
}

function HanziCard({
  card,
  cardKey,
  l,
  animate,
  charDataLoader,
}: {
  card: DictionaryHanziInfo;
  cardKey: string;
  l: DictionaryLogic;
  animate: boolean;
  charDataLoader?: HanziCharDataLoader;
}) {
  const glyph = hanziCardGlyph(card, l.chineseScript);
  const variant = hanziCardVariant(card, l.chineseScript);
  const readings = hanziCardReadings(card, l.phonetics);
  const variantLabel =
    l.chineseScript === "traditional"
      ? l.t("apps.dictionary.labels.simplifiedShort")
      : l.t("apps.dictionary.labels.traditionalShort");
  const variantLang = l.chineseScript === "traditional" ? "zh-CN" : "zh-TW";

  const lookUp = () => l.searchFor(glyph, "zh");

  // The stroke box replays; the rest of the card is one button that looks the
  // character up, so the two targets never overlap or nest.
  return (
    <div
      data-hanzi-key={cardKey}
      className="flex overflow-hidden rounded border border-black/10 dark:border-white/10"
    >
      <div className="shrink-0 p-2 pr-0">
        {animate ? (
          <HanziStroke
            key={cardKey}
            character={glyph}
            label={l.t("apps.dictionary.ariaLabels.replayStrokes", { character: glyph })}
            charDataLoader={charDataLoader}
          />
        ) : (
          <div aria-hidden className={cn(STROKE_FRAME_CLASS, "cursor-pointer")} onClick={lookUp}>
            <HanziGlyph character={glyph} />
          </div>
        )}
      </div>
      <button
        type="button"
        data-hanzi-lookup={glyph}
        className={cn(
          DICTIONARY_CHARACTER_CARD_BUTTON_CLASS,
          "block min-w-0 flex-1 self-stretch p-2 text-[11px]"
        )}
        aria-label={l.t("apps.dictionary.ariaLabels.lookUpCharacter", { character: glyph })}
        onClick={lookUp}
      >
        {card.meaning ? <div className="line-clamp-2">{card.meaning}</div> : null}
        <ReadingLine className="text-[11px]" parts={[readings.pinyin, readings.zhuyin]} />
        {variant ? (
          <div className="text-black/40 dark:text-white/40">
            {variantLabel}{" "}
            <span lang={variantLang}>{variant}</span>
          </div>
        ) : null}
      </button>
    </div>
  );
}

type HanziCardsBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
};

type HanziCardsBoundaryState = {
  hasError: boolean;
  resetKey: string;
};

/** A stroke-card failure stays on the glyph fallback instead of crashing Dictionary. */
export class HanziCardsErrorBoundary extends Component<
  HanziCardsBoundaryProps,
  HanziCardsBoundaryState
> {
  state: HanziCardsBoundaryState = {
    hasError: false,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(): Partial<HanziCardsBoundaryState> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: HanziCardsBoundaryProps,
    state: HanziCardsBoundaryState
  ): Partial<HanziCardsBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey };
    }
    return null;
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const SECTION_TITLE_CLASS =
  "mt-4 mb-1.5 text-[10px] font-bold uppercase tracking-wide text-black/45 dark:text-white/45";

function HanziCardGrid({
  cards,
  wordKey,
  l,
  animate,
  charDataLoader,
}: {
  cards: DictionaryHanziInfo[];
  wordKey: string;
  l: DictionaryLogic;
  animate: boolean;
  charDataLoader?: HanziCharDataLoader;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {cards.map((card) => {
        const glyph = hanziCardGlyph(card, l.chineseScript);
        const cardKey = hanziStrokeKey(wordKey, card, glyph);
        return (
          <HanziCard
            key={cardKey}
            card={card}
            cardKey={cardKey}
            l={l}
            animate={animate}
            charDataLoader={charDataLoader}
          />
        );
      })}
    </div>
  );
}

export function DictionaryHanziCards({
  entry,
  l,
  charDataLoader,
}: {
  entry: DictionaryEntry;
  l: DictionaryLogic;
  charDataLoader?: HanziCharDataLoader;
}) {
  const cards = hanziCardsForEntry(entry);
  if (cards.length === 0) return null;
  const wordKey = `${entry.id}:${entry.headword}`;
  return (
    <>
      <h3 className={SECTION_TITLE_CLASS}>{l.t("apps.dictionary.labels.characters")}</h3>
      <HanziCardsErrorBoundary
        resetKey={wordKey}
        fallback={
          <HanziCardGrid cards={cards} wordKey={wordKey} l={l} animate={false} />
        }
      >
        <HanziCardGrid
          cards={cards}
          wordKey={wordKey}
          l={l}
          animate
          charDataLoader={charDataLoader}
        />
      </HanziCardsErrorBoundary>
    </>
  );
}
