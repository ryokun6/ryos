import { Sparkle, SpeakerHigh, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DICTIONARY_SOURCE_INFO,
  type DictionaryEntry,
  type DictionaryPhrase,
  type DictionarySource,
} from "@/shared/dictionary";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import {
  DictionaryExampleText,
  DictionaryHeadword,
  ReadingLine,
} from "./DictionaryReading";
import {
  displayChineseHeadword,
  formatChineseReading,
  japaneseRomaji,
  koreanRomanization,
} from "../utils/phonetics";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-1.5 text-[10px] font-bold uppercase tracking-wide text-black/45 dark:text-white/45">
      {children}
    </h3>
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
      className="rounded-full border border-black/15 bg-black/[0.03] px-2 py-0.5 text-[12px] hover:bg-black/10 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/15"
    >
      {label}
    </button>
  );
}

function phraseReading(phrase: DictionaryPhrase, l: DictionaryLogic): string | null {
  if (!phrase.reading) return null;
  if (phrase.lang === "zh") {
    return formatChineseReading(phrase.reading, l.phonetics.zhuyin && !l.phonetics.pinyin ? "zhuyin" : "pinyin");
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
        return (
          <button
            key={`${phrase.headword}-${phrase.reading ?? ""}`}
            type="button"
            onClick={() => l.searchFor(headword, phrase.lang)}
            className="flex min-w-0 items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="shrink-0 text-[14px]" lang={phrase.lang}>
              {headword}
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
    <div className="mt-4 rounded-md border border-black/10 bg-black/[0.025] p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <Sparkle size={14} weight="fill" className="text-amber-500" />
        <span className="text-[12px] font-semibold">
          {t("apps.dictionary.ai.extrasTitle", { defaultValue: "AI Notes" })}
        </span>
        <div className="flex-1" />
        {!aiExtras ? (
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
        <p className="mt-2 text-[11px] text-red-600">
          {aiError === "rate_limited"
            ? t("apps.dictionary.ai.rateLimited", {
                defaultValue: "AI limit reached. Sign in or try again later.",
              })
            : t("apps.dictionary.ai.error", { defaultValue: "AI is unavailable right now." })}
        </p>
      ) : null}
      {aiExtras ? (
        <div className="mt-2 space-y-2 text-[12px]">
          <p>{aiExtras.usageNotes}</p>
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
                <li key={example.text}>
                  <DictionaryExampleText
                    example={example}
                    lang={entry.lang}
                    chineseScript={l.chineseScript}
                    phonetics={l.phonetics}
                  />
                </li>
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
      <div className="flex items-start gap-3">
        <DictionaryHeadword
          entry={entry}
          chineseScript={l.chineseScript}
          phonetics={l.phonetics}
        />
        <div className="flex-1" />
        {entry.audioUrl ? (
          <button
            type="button"
            className="mt-2 rounded p-1 text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
            title={t("apps.dictionary.actions.listen", { defaultValue: "Listen" })}
            aria-label={t("apps.dictionary.actions.listen", { defaultValue: "Listen" })}
            onClick={() => void new Audio(entry.audioUrl).play().catch(() => {})}
          >
            <SpeakerHigh size={18} />
          </button>
        ) : null}
        <button
          type="button"
          className={cn(
            "mt-2 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10",
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
          <Star size={20} weight={isFav ? "fill" : "regular"} />
        </button>
      </div>

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
                    <li key={example.text}>
                      <DictionaryExampleText
                        example={example}
                        lang={entry.lang}
                        chineseScript={l.chineseScript}
                        phonetics={l.phonetics}
                      />
                    </li>
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
