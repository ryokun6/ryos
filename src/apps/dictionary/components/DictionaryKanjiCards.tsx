import type { DictionaryEntry, DictionaryKanjiInfo } from "@/shared/dictionary";
import { cn } from "@/lib/utils";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import { DICTIONARY_CHARACTER_CARD_BUTTON_CLASS } from "../utils/styles";
import { ReadingLine } from "./DictionaryReading";

const SECTION_TITLE_CLASS =
  "mt-4 mb-1.5 text-[10px] font-bold uppercase tracking-wide text-black/45 dark:text-white/45";

function KanjiCard({ kanji, l }: { kanji: DictionaryKanjiInfo; l: DictionaryLogic }) {
  const { t } = l;
  return (
    <button
      type="button"
      data-kanji-lookup={kanji.literal}
      className={cn(
        DICTIONARY_CHARACTER_CARD_BUTTON_CLASS,
        "flex w-full gap-2 rounded border border-black/10 p-2 dark:border-white/10"
      )}
      aria-label={t("apps.dictionary.ariaLabels.lookUpCharacter", { character: kanji.literal })}
      onClick={() => l.searchFor(kanji.literal, "ja")}
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
    </button>
  );
}

export function DictionaryKanjiCards({ entry, l }: { entry: DictionaryEntry; l: DictionaryLogic }) {
  if (!entry.kanji?.length) return null;
  return (
    <>
      <h3 className={SECTION_TITLE_CLASS}>
        {l.t("apps.dictionary.labels.kanji", { defaultValue: "Kanji" })}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entry.kanji.map((kanji) => (
          <KanjiCard key={kanji.literal} kanji={kanji} l={l} />
        ))}
      </div>
    </>
  );
}
