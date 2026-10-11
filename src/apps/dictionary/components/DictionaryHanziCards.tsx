import { useEffect, useRef, useState } from "react";
import type HanziWriter from "hanzi-writer";
import type { HanziWriterOptions } from "hanzi-writer";
import type { DictionaryEntry, DictionaryHanziInfo } from "@/shared/dictionary";
import { useThemeStore } from "@/stores/useThemeStore";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import {
  hanziCardGlyph,
  hanziCardReadings,
  hanziCardVariant,
  hanziCardsForEntry,
} from "../utils/hanziCards";
import { hanziCharDataLoader, type HanziStrokeCharData } from "../utils/hanziStrokeData";
import { ReadingLine } from "./DictionaryReading";

const STROKE_SIZE = 64;

type StrokePhase = "loading" | "ready" | "fallback";

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

function HanziStroke({
  character,
  label,
}: {
  character: string;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
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
    let cancelled = false;
    setPhase("loading");
    writerRef.current = null;
    host.replaceChildren();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduceMotionRef.current = reduceMotion;

    void import("hanzi-writer")
      .then(({ default: HanziWriter }) => {
        if (cancelled || hostRef.current !== host) return;
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
            hanziCharDataLoader(char, onLoad as (data: HanziStrokeCharData) => void, onError);
          },
          onLoadCharDataSuccess: () => {
            if (!cancelled) setPhase("ready");
          },
          onLoadCharDataError: () => {
            if (!cancelled) setPhase("fallback");
          },
        };
        const writer = HanziWriter.create(host, character, options);
        writerRef.current = writer;
        const started = reduceMotion ? writer.showCharacter() : writer.loopCharacterAnimation();
        void Promise.resolve(started).catch(() => {
          if (!cancelled) setPhase("fallback");
        });
      })
      .catch(() => {
        if (!cancelled) setPhase("fallback");
      });

    return () => {
      cancelled = true;
      replayTokenRef.current += 1;
      const writer = writerRef.current;
      writerRef.current = null;
      if (writer) void writer.pauseAnimation();
      host.replaceChildren();
    };
  }, [character, currentTheme, isDarkMode]);

  const replay = () => {
    const writer = writerRef.current;
    if (!writer || phaseRef.current === "fallback") return;
    const token = ++replayTokenRef.current;
    void writer.animateCharacter({
      onComplete: () => {
        if (token !== replayTokenRef.current || reduceMotionRef.current) return;
        void writer.loopCharacterAnimation().catch(() => undefined);
      },
    });
  };

  return (
    <div
      className="relative size-16 shrink-0 overflow-hidden rounded border border-black/10 bg-os-input-bg text-os-text-primary dark:border-white/15"
    >
      {phase !== "ready" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[32px] leading-none"
          lang="zh"
        >
          {character}
        </span>
      ) : null}
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
  l,
}: {
  card: DictionaryHanziInfo;
  l: DictionaryLogic;
}) {
  const glyph = hanziCardGlyph(card, l.chineseScript);
  const variant = hanziCardVariant(card, l.chineseScript);
  const readings = hanziCardReadings(card, l.phonetics);
  const variantLabel =
    l.chineseScript === "traditional"
      ? l.t("apps.dictionary.labels.simplifiedShort")
      : l.t("apps.dictionary.labels.traditionalShort");
  const variantLang = l.chineseScript === "traditional" ? "zh-CN" : "zh-TW";

  return (
    <div className="flex gap-2 rounded border border-black/10 p-2 dark:border-white/10">
      <HanziStroke
        character={glyph}
        label={l.t("apps.dictionary.ariaLabels.replayStrokes", { character: glyph })}
      />
      <div className="min-w-0 text-[11px]">
        {card.meaning ? <div className="line-clamp-2">{card.meaning}</div> : null}
        <ReadingLine className="text-[11px]" parts={[readings.pinyin, readings.zhuyin]} />
        {variant ? (
          <div className="text-black/40 dark:text-white/40">
            {variantLabel}{" "}
            <span lang={variantLang}>{variant}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SECTION_TITLE_CLASS =
  "mt-4 mb-1.5 text-[10px] font-bold uppercase tracking-wide text-black/45 dark:text-white/45";

export function DictionaryHanziCards({
  entry,
  l,
}: {
  entry: DictionaryEntry;
  l: DictionaryLogic;
}) {
  const cards = hanziCardsForEntry(entry);
  if (cards.length === 0) return null;
  return (
    <>
      <h3 className={SECTION_TITLE_CLASS}>{l.t("apps.dictionary.labels.characters")}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map((card) => (
          <HanziCard
            key={`${card.traditional}:${card.simplified}:${card.reading ?? ""}`}
            card={card}
            l={l}
          />
        ))}
      </div>
    </>
  );
}
