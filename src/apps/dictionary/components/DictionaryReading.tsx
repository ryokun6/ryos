import { useEffect, useState, type ReactNode } from "react";
import type { DictionaryEntry, DictionaryExample } from "@/shared/dictionary";
import type {
  DictionaryChineseScript,
  DictionaryPhoneticSettings,
} from "@/stores/useDictionaryStore";
import { loadChineseConverter } from "@/apps/books/utils/chineseScriptConverter";
import {
  getFuriganaSegmentsPronunciationOnly,
  renderChineseWithReadings,
  renderFuriganaSegments,
} from "@/utils/romanization";
import { cn } from "@/lib/utils";
import {
  alternateChineseHeadword,
  chineseCharacterReadings,
  chineseTextToPinyin,
  displayChineseHeadword,
  formatChineseReading,
  japaneseHeadwordSegments,
  japaneseRomaji,
  koreanRomanization,
} from "../utils/phonetics";

const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Convert free text (examples, AI output) to the preferred Chinese script. */
export function useChineseScriptText(
  text: string,
  script: DictionaryChineseScript,
  enabled: boolean
): string {
  const [converted, setConverted] = useState(text);
  useEffect(() => {
    setConverted(text);
    if (!enabled || !HAN_RE.test(text)) return;
    let cancelled = false;
    void loadChineseConverter(script).then((convert) => {
      if (!cancelled) setConverted(convert(text));
    });
    return () => {
      cancelled = true;
    };
  }, [text, script, enabled]);
  return converted;
}

function chineseRubySystem(phonetics: DictionaryPhoneticSettings) {
  if (phonetics.zhuyin) return "zhuyin" as const;
  if (phonetics.pinyin) return "pinyin" as const;
  return null;
}

export function ReadingLine({
  parts,
  className,
}: {
  parts: (string | null | undefined | false)[];
  className?: string;
}) {
  const visible = parts.filter((part): part is string => Boolean(part));
  if (visible.length === 0) return null;
  return (
    <div className={cn("text-[12px] text-black/55 dark:text-white/55", className)}>
      {visible.join("  ·  ")}
    </div>
  );
}

export function DictionaryHeadword({
  entry,
  chineseScript,
  phonetics,
  size = "large",
}: {
  entry: DictionaryEntry;
  chineseScript: DictionaryChineseScript;
  phonetics: DictionaryPhoneticSettings;
  size?: "large" | "card";
}) {
  const headwordClass =
    size === "card" ? "text-[44px] leading-[1.5]" : "text-[30px] leading-[1.5]";
  let headword: ReactNode = entry.headword;
  let readingParts: (string | null | undefined)[] = [];
  let secondary: string | null = null;

  if (entry.lang === "zh") {
    const text = displayChineseHeadword(entry, chineseScript);
    const system = chineseRubySystem(phonetics);
    headword = system
      ? renderChineseWithReadings(
          text,
          chineseCharacterReadings(text, entry.reading, system),
          `hw-${entry.id}`,
          system
        )
      : text;
    if (entry.reading && phonetics.pinyin && system !== "pinyin") {
      readingParts = [formatChineseReading(entry.reading, "pinyin")];
    }
    secondary = alternateChineseHeadword(entry, chineseScript);
  } else if (entry.lang === "ja") {
    const segments = japaneseHeadwordSegments(entry.headword, entry.reading);
    headword = phonetics.furigana
      ? renderFuriganaSegments(segments)
      : entry.headword;
    readingParts = [
      !phonetics.furigana && entry.reading !== entry.headword ? entry.reading : null,
      phonetics.romaji && entry.reading ? japaneseRomaji(entry.reading) : null,
      phonetics.romaji && !entry.reading ? japaneseRomaji(entry.headword) : null,
    ];
  } else if (entry.lang === "ko") {
    readingParts = [
      phonetics.koreanRomanization ? koreanRomanization(entry.headword) : null,
    ];
    secondary = entry.hanja ?? null;
  } else if (entry.ipa) {
    readingParts = [entry.ipa];
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2
          lang={entry.lang === "zh" ? (chineseScript === "traditional" ? "zh-TW" : "zh-CN") : entry.lang}
          className={cn("font-semibold break-words", headwordClass)}
        >
          {headword}
        </h2>
        {secondary ? (
          <span className="text-[18px] text-black/45 dark:text-white/45">
            {secondary}
          </span>
        ) : null}
      </div>
      <ReadingLine parts={readingParts} className={size === "card" ? "text-[15px]" : undefined} />
    </div>
  );
}

export function DictionaryExampleText({
  example,
  lang,
  chineseScript,
  phonetics,
}: {
  example: DictionaryExample;
  lang: DictionaryEntry["lang"];
  chineseScript: DictionaryChineseScript;
  phonetics: DictionaryPhoneticSettings;
}) {
  const zhText = useChineseScriptText(example.text, chineseScript, lang === "zh");
  let body: ReactNode = example.text;
  let readingParts: (string | null | undefined)[] = [];

  if (lang === "zh") {
    const system = chineseRubySystem(phonetics);
    body = system
      ? renderChineseWithReadings(
          zhText,
          chineseCharacterReadings(zhText, undefined, system),
          `ex-${zhText}`,
          system
        )
      : zhText;
    if (phonetics.pinyin && phonetics.zhuyin) {
      readingParts = [example.reading ?? chineseTextToPinyin(zhText)];
    }
  } else if (lang === "ja") {
    const segments = example.furigana?.length
      ? example.furigana
      : [{ text: example.text, reading: undefined }];
    body = phonetics.furigana ? renderFuriganaSegments(segments) : example.text;
    readingParts = [
      phonetics.romaji
        ? getFuriganaSegmentsPronunciationOnly(segments, { japaneseRomaji: true })
        : null,
    ];
  } else if (lang === "ko") {
    readingParts = [
      phonetics.koreanRomanization
        ? example.reading ?? koreanRomanization(example.text)
        : null,
    ];
  }

  return (
    <div className="min-w-0">
      <div className="text-[13px] leading-[1.9]" lang={lang}>
        {body}
      </div>
      <ReadingLine parts={readingParts} className="text-[11px]" />
      {example.translation ? (
        <div className="text-[12px] text-black/60 dark:text-white/60 italic">
          {example.translation}
        </div>
      ) : null}
    </div>
  );
}
