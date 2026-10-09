import { Sparkle, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DICTIONARY_SOURCE_INFO,
  type DictionaryEntry,
  type DictionaryExample,
  type DictionaryPhrase,
  type DictionarySource,
} from "@/shared/dictionary";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import {
  DictionaryExampleText,
  DictionaryHeadword,
  ReadingLine,
} from "./DictionaryReading";
import { DictionarySpeakButton } from "./DictionarySpeakButton";
import { headwordSpeechText } from "../utils/speech";
import {
  DICTIONARY_CHIP_CLASS,
  DICTIONARY_ERROR_TEXT_CLASS,
  DICTIONARY_NOTE_BOX_CLASS,
} from "../utils/styles";
import { renderChineseWithReadings } from "@/utils/romanization";
import {
  chineseCharacterReadings,
  displayChineseHeadword,
  formatChineseReading,
  japaneseRomaji,
  koreanRomanization,
} from "../utils/phonetics";

/** Shared box for the headword speak and favorite buttons. */
const HEADWORD_ACTION_CLASS =
  "inline-flex size-7 shrink-0 items-center justify-center rounded p-0 leading-none hover:bg-black/5 dark:hover:bg-white/10";
const HEADWORD_ACTION_ICON = 18;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-1.5 text-[10px] font-bold uppercase tracking-wide text-black/45 dark:text-white/45">
      {children}
    </h3>
  );
}

function ExampleItem({
  l,
  entry,
  example,
  speechKey,
}: {
  l: DictionaryLogic;
  entry: DictionaryEntry;
  example: DictionaryExample;
  speechKey: string;
}) {
  return (
    <li className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        <DictionaryExampleText
          example={example}
          lang={entry.lang}
          chineseScript={l.chineseScript}
          phonetics={l.phonetics}
        />
      </div>
      <DictionarySpeakButton
        speech={l.speech}
        request={{ key: speechKey, text: example.text, lang: entry.lang }}
        label={l.t("apps.dictionary.actions.listenExample")}
        stopLabel={l.t("apps.dictionary.actions.stopSpeaking")}
        size={14}
        className="-mr-1 mt-0.5"
      />
    </li>
  );
}

function WordChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(DICTIONARY_CHIP_CLASS, "px-2 py-0.5 text-[12px]")}
    >
      {label}
    </button>
  );
}

function phraseReading(phrase: DictionaryPhrase, l: DictionaryLogic): string | null {
  if (!phrase.reading) return null;
  if (phrase.lang === "zh") {
    // Zhuyin sits beside each character. Keep pinyin as the inline line when it is on.
    if (l.phonetics.zhuyin && !l.phonetics.pinyin) return null;
    return formatChineseReading(phrase.reading, "pinyin");
  }
  if (phrase.lang === "ja") {
    return l.phonetics.romaji ? japaneseRomaji(phrase.reading) : phrase.reading;
  }
  return phrase.reading;
}

function PhraseList({
  phrases,
  l,
}: {
  phrases: DictionaryPhrase[];
  l: DictionaryLogic;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      {phrases.map((phrase) => {
        const headword =
          phrase.lang === "zh"
            ? displayChineseHeadword(phrase, l.chineseScript)
            : phrase.headword;
        const reading =
          phrase.lang === "ko" && l.phonetics.koreanRomanization
            ? koreanRomanization(phrase.headword)
            : phraseReading(phrase, l);
        const sideZhuyin = phrase.lang === "zh" && l.phonetics.zhuyin;
        return (
          <button
            key={`${phrase.headword}-${phrase.reading ?? ""}`}
            type="button"
            onClick={() => l.searchFor(headword, phrase.lang)}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded px-1 text-left hover:bg-black/5 dark:hover:bg-white/10",
              sideZhuyin ? "py-1" : "py-0.5"
            )}
          >
            <span
              className={cn(
                "shrink-0 text-[14px]",
                sideZhuyin && "[--lyrics-zhuyin-size:8px]"
              )}
              lang={phrase.lang}
            >
              {sideZhuyin
                ? renderChineseWithReadings(
                    headword,
                    chineseCharacterReadings(headword, phrase.reading, "zhuyin"),
                    `phrase-${headword}`,
                    "zhuyin"
                  )
                : headword}
            </span>
            {reading ? (
              <span className="shrink-0 text-[11px] text-black/45 dark:text-white/45">
                {reading}
              </span>
            ) : null}
            <span className="min-w-0 truncate text-[12px] text-black/70 dark:text-white/70">
              {phrase.gloss}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SourcesFooter({ sources, t }: { sources: DictionarySource[]; t: DictionaryLogic["t"] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-6 border-t border-black/10 pt-2 text-[10px] text-black/45 dark:border-white/10 dark:text-white/45">
      {t("apps.dictionary.sources", { defaultValue: "Sources:" })}{" "}
      {sources.map((source, index) => {
        const info = DICTIONARY_SOURCE_INFO[source];
        return (
          <span key={source}>
            {index > 0 ? ", " : ""}
            <a
              href={info.url}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted"
            >
              {info.name}
            </a>{" "}
            ({info.license})
          </span>
        );
      })}
    </div>
  );
}

function AiExtrasSection({ l, entry }: { l: DictionaryLogic; entry: DictionaryEntry }) {
  const { t, aiExtras, aiStatus, aiError } = l;
  if (entry.source === "ai") return null;
  return (
    <div className={cn("mt-4", DICTIONARY_NOTE_BOX_CLASS)}>
      <div className="flex items-center gap-2">
        <Sparkle size={14} weight="fill" className="text-amber-500" />
        <span className="text-[12px] font-semibold">
          {t("apps.dictionary.ai.extrasTitle", { defaultValue: "AI Notes" })}
        </span>
        <div className="flex-1" />
        {!aiExtras?.usageNotes &&
        !aiExtras?.nuance &&
        !(aiExtras?.synonyms?.length) &&
        !(aiExtras?.examples?.length) ? (
          <Button
            variant={l.isSystem7Theme ? "retro" : l.isMacOSTheme ? "aqua" : "default"}
            size="sm"
            className="h-6 text-[11px]"
            disabled={aiStatus === "loading"}
            onClick={() => void l.askAi("extras")}
          >
            {aiStatus === "loading"
              ? t("apps.dictionary.ai.thinking", { defaultValue: "Thinking…" })
              : t("apps.dictionary.ai.askExtras", { defaultValue: "Explain Usage" })}
          </Button>
        ) : null}
      </div>
      {aiError && aiStatus === "error" ? (
        <p className={cn("mt-2 text-[11px]", DICTIONARY_ERROR_TEXT_CLASS)}>
          {aiError === "rate_limited"
            ? t("apps.dictionary.ai.rateLimited", {
                defaultValue: "AI limit reached. Sign in or try again later.",
              })
            : t("apps.dictionary.ai.error", { defaultValue: "AI is unavailable right now." })}
        </p>
      ) : null}
      {aiExtras ? (
        <div className="mt-2 space-y-2 text-[12px]">
          {aiExtras.usageNotes || aiStatus === "streaming" ? (
            <p>
              {aiExtras.usageNotes}
              {aiStatus === "streaming" ? (
                <span className="ml-0.5 inline-block animate-pulse" aria-hidden>
                  ▍
                </span>
              ) : null}
            </p>
          ) : null}
          {aiExtras.nuance ? <p className="text-black/70 dark:text-white/70">{aiExtras.nuance}</p> : null}
          {aiExtras.synonyms.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {aiExtras.synonyms.map((word) => (
                <WordChip key={word} label={word} onClick={() => l.searchFor(word, entry.lang)} />
              ))}
            </div>
          ) : null}
          {aiExtras.examples.length > 0 ? (
            <ul className="space-y-1.5">
              {aiExtras.examples.map((example) => (
                <ExampleItem
                  key={example.text}
                  l={l}
                  entry={entry}
                  example={example}
                  speechKey={`${entry.id}:ai:${example.text}`}
                />
              ))}
            </ul>
          ) : null}
          <p className="text-[10px] text-black/40 dark:text-white/40">
            {t("apps.dictionary.ai.disclaimer", {
              defaultValue: "Generated by AI — may contain mistakes.",
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DictionaryEntryView({
  l,
  entry,
  showRelated = true,
  showAi = true,
  footer,
}: {
  l: DictionaryLogic;
  entry: DictionaryEntry;
  showRelated?: boolean;
  showAi?: boolean;
  footer?: React.ReactNode;
}) {
  const { t, result } = l;

  const isFav = l.isFavorite(entry.id);
  const isTopEntry = showRelated && result?.entries[0]?.id === entry.id;
  const entrySources: DictionarySource[] = [
    entry.source,
    ...(entry.kanji?.length ? (["kanjidic2"] as const) : []),
    ...((showRelated ? result?.sources ?? [] : []).filter(
      (source) =>
        source !== entry.source && (source === "wiktionary" || source === "datamuse")
    ) as DictionarySource[]),
  ];

  return (
    <div className="px-5 py-4">
      <DictionaryHeadword
        entry={entry}
        chineseScript={l.chineseScript}
        phonetics={l.phonetics}
        actions={
          <>
            <DictionarySpeakButton
              speech={l.speech}
              request={{
                key: `${entry.id}:headword`,
                text: headwordSpeechText(entry, l.chineseScript),
                lang: entry.lang,
                audioUrl: entry.audioUrl,
              }}
              label={t("apps.dictionary.actions.listen")}
              stopLabel={t("apps.dictionary.actions.stopSpeaking")}
              size={HEADWORD_ACTION_ICON}
              className={HEADWORD_ACTION_CLASS}
            />
            <button
              type="button"
              className={cn(
                HEADWORD_ACTION_CLASS,
                isFav ? "text-amber-500" : "text-black/40 dark:text-white/40"
              )}
              title={
                isFav
                  ? t("apps.dictionary.actions.removeFavorite", { defaultValue: "Remove from Favorites" })
                  : t("apps.dictionary.actions.addFavorite", { defaultValue: "Add to Favorites" })
              }
              aria-pressed={isFav}
              onClick={() => l.toggleFavorite(entry)}
            >
              <Star size={HEADWORD_ACTION_ICON} weight={isFav ? "fill" : "regular"} />
            </button>
          </>
        }
      />

      {entry.tags?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-black/[0.06] px-1.5 py-px text-[10px] text-black/60 dark:bg-white/10 dark:text-white/60"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <ol className="mt-3 space-y-3">
        {entry.senses.map((sense, index) => (
          <li key={index} className="flex gap-2">
            <span className="w-4 shrink-0 text-right text-[12px] font-semibold text-black/40 dark:text-white/40">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              {sense.partOfSpeech ? (
                <span className="mr-1.5 text-[11px] italic text-black/50 dark:text-white/50">
                  {sense.partOfSpeech}
                </span>
              ) : null}
              <span className="text-[13px]">{sense.glosses.join("; ")}</span>
              {sense.notes?.length ? (
                <div className="text-[11px] text-black/45 dark:text-white/45">
                  {sense.notes.join(" · ")}
                </div>
              ) : null}
              {sense.examples?.length ? (
                <ul className="mt-1.5 space-y-1.5 border-l-2 border-black/10 pl-2.5 dark:border-white/15">
                  {sense.examples.map((example) => (
                    <ExampleItem
                      key={example.text}
                      l={l}
                      entry={entry}
                      example={example}
                      speechKey={`${entry.id}:${index}:${example.text}`}
                    />
                  ))}
                </ul>
              ) : null}
              {sense.synonyms?.length ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase text-black/40 dark:text-white/40">
                    {t("apps.dictionary.labels.synonymsShort", { defaultValue: "syn." })}
                  </span>
                  {sense.synonyms.map((word) => (
                    <WordChip key={word} label={word} onClick={() => l.searchFor(word, entry.lang)} />
                  ))}
                </div>
              ) : null}
              {sense.antonyms?.length ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase text-black/40 dark:text-white/40">
                    {t("apps.dictionary.labels.antonymsShort", { defaultValue: "ant." })}
                  </span>
                  {sense.antonyms.map((word) => (
                    <WordChip key={word} label={word} onClick={() => l.searchFor(word, entry.lang)} />
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {entry.synonyms?.length ? (
        <>
          <SectionTitle>{t("apps.dictionary.labels.synonyms", { defaultValue: "Synonyms" })}</SectionTitle>
          <div className="flex flex-wrap gap-1">
            {entry.synonyms.map((word) => (
              <WordChip key={word} label={word} onClick={() => l.searchFor(word, entry.lang)} />
            ))}
          </div>
        </>
      ) : null}

      {entry.kanji?.length ? (
        <>
          <SectionTitle>{t("apps.dictionary.labels.kanji", { defaultValue: "Kanji" })}</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {entry.kanji.map((kanji) => (
              <div
                key={kanji.literal}
                className="flex gap-2 rounded border border-black/10 p-2 dark:border-white/10"
              >
                <span className="text-[28px] leading-none" lang="ja">
                  {kanji.literal}
                </span>
                <div className="min-w-0 text-[11px]">
                  <div className="truncate">{kanji.meanings.join(", ")}</div>
                  {kanji.onyomi.length ? (
                    <ReadingLine
                      className="text-[11px]"
                      parts={[
                        `${t("apps.dictionary.labels.onyomi", { defaultValue: "On" })}: ${kanji.onyomi.join("、")}`,
                      ]}
                    />
                  ) : null}
                  {kanji.kunyomi.length ? (
                    <ReadingLine
                      className="text-[11px]"
                      parts={[
                        `${t("apps.dictionary.labels.kunyomi", { defaultValue: "Kun" })}: ${kanji.kunyomi.join("、")}`,
                      ]}
                    />
                  ) : null}
                  <div className="text-black/40 dark:text-white/40">
                    {[
                      kanji.strokeCount
                        ? t("apps.dictionary.labels.strokes", {
                            count: kanji.strokeCount,
                            defaultValue: "{{count}} strokes",
                          })
                        : null,
                      kanji.jlpt ? `JLPT N${kanji.jlpt}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {isTopEntry && result?.phrases.length ? (
        <>
          <SectionTitle>
            {t("apps.dictionary.labels.phrases", { defaultValue: "Words & Phrases" })}
          </SectionTitle>
          <PhraseList phrases={result.phrases} l={l} />
        </>
      ) : null}

      {isTopEntry && result?.similar.length ? (
        <>
          <SectionTitle>
            {t("apps.dictionary.labels.similar", { defaultValue: "Similar Words" })}
          </SectionTitle>
          <PhraseList phrases={result.similar} l={l} />
        </>
      ) : null}

      {footer}
      {showAi ? <AiExtrasSection l={l} entry={entry} /> : null}
      <SourcesFooter sources={entrySources} t={t} />
    </div>
  );
}
