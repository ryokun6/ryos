import { Cards } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DictionaryPhoneticSettings } from "@/stores/useDictionaryStore";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import {
  SRS_GRADES,
  formatSrsInterval,
  previewSrsIntervals,
  type SrsGrade,
} from "../utils/srs";
import { DictionaryExampleText, DictionaryHeadword } from "./DictionaryReading";

const NO_PHONETICS: DictionaryPhoneticSettings = {
  pinyin: false,
  zhuyin: false,
  furigana: false,
  romaji: false,
  koreanRomanization: false,
};

const GRADE_STYLES: Record<SrsGrade, string> = {
  again: "text-red-700",
  hard: "text-amber-700",
  good: "text-green-700",
  easy: "text-blue-700",
};

export function DictionaryFlashcardsView({ l }: { l: DictionaryLogic }) {
  const { t, currentCard, isCardFlipped, setIsCardFlipped } = l;
  const buttonVariant = l.isSystem7Theme ? "retro" : l.isMacOSTheme ? "aqua" : "default";

  if (l.favorites.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Cards size={40} className="opacity-30" />
        <p className="text-[13px] font-semibold">{t("apps.dictionary.flashcards.emptyTitle")}</p>
        <p className="max-w-[280px] text-[12px] opacity-60">
          {t("apps.dictionary.flashcards.emptyDescription")}
        </p>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Cards size={40} className="opacity-30" />
        <p className="text-[13px] font-semibold">{t("apps.dictionary.flashcards.doneTitle")}</p>
        <p className="max-w-[300px] text-[12px] opacity-60">
          {l.sessionReviewed > 0
            ? t("apps.dictionary.flashcards.doneDescription", { count: l.sessionReviewed })
            : t("apps.dictionary.flashcards.nothingDue")}
        </p>
        <Button variant={buttonVariant} size="sm" onClick={l.startStudySession}>
          {t("apps.dictionary.flashcards.checkAgain")}
        </Button>
      </div>
    );
  }

  const entry = currentCard.entry;
  const intervals = previewSrsIntervals(currentCard.srs);
  const example = entry.senses.flatMap((sense) => sense.examples ?? [])[0];
  const faceClass =
    "dictionary-flashcard-face flex h-full flex-col items-center justify-center rounded-lg border border-black/15 bg-white px-6 py-5 text-center text-black shadow-[0_2px_8px_rgba(0,0,0,0.12)]";

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto p-4">
      <div className="mb-2 text-[11px] opacity-55">
        {t("apps.dictionary.flashcards.progress", {
          remaining: l.studyQueueLength,
          reviewed: l.sessionReviewed,
        })}
      </div>
      <button
        type="button"
        onClick={() => setIsCardFlipped(!isCardFlipped)}
        aria-label={
          isCardFlipped
            ? t("apps.dictionary.flashcards.showFront")
            : t("apps.dictionary.flashcards.showAnswer")
        }
        className="dictionary-flashcard flex w-full max-w-[460px] flex-1"
      >
        <div
          key={entry.id}
          className={cn("dictionary-flashcard-inner", isCardFlipped && "is-flipped")}
        >
          <div className={faceClass}>
            <DictionaryHeadword
              entry={entry}
              chineseScript={l.chineseScript}
              phonetics={NO_PHONETICS}
              size="card"
            />
            <p className="mt-4 text-[11px] opacity-45">{t("apps.dictionary.flashcards.tapToFlip")}</p>
          </div>
          <div className={cn(faceClass, "dictionary-flashcard-back")}>
            <DictionaryHeadword
              entry={entry}
              chineseScript={l.chineseScript}
              phonetics={l.phonetics}
              size="card"
            />
            <div className="mt-3 w-full space-y-1.5 text-left">
              {entry.senses.slice(0, 3).map((sense, index) => (
                <div key={index} className="text-[13px]">
                  <span className="mr-1 font-semibold opacity-40">{index + 1}.</span>
                  {sense.partOfSpeech ? (
                    <span className="mr-1 text-[11px] italic opacity-55">{sense.partOfSpeech}</span>
                  ) : null}
                  {sense.glosses.slice(0, 4).join("; ")}
                </div>
              ))}
              {example ? (
                <div className="border-l-2 border-black/10 pl-2.5 pt-1">
                  <DictionaryExampleText
                    example={example}
                    lang={entry.lang}
                    chineseScript={l.chineseScript}
                    phonetics={l.phonetics}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </button>
      <div className="mt-3 flex w-full max-w-[460px] justify-center gap-2">
        {isCardFlipped ? (
          SRS_GRADES.map((grade) => (
            <Button
              key={grade}
              variant={buttonVariant}
              size="sm"
              className="h-auto min-w-[78px] flex-col gap-0 py-1"
              onClick={() => l.gradeCard(grade)}
            >
              <span className={cn("text-[12px] font-semibold", !l.isMacOSTheme && GRADE_STYLES[grade])}>
                {t(`apps.dictionary.flashcards.grades.${grade}`)}
              </span>
              <span className="text-[10px] opacity-60">{formatSrsInterval(intervals[grade])}</span>
            </Button>
          ))
        ) : (
          <Button variant={buttonVariant} size="sm" onClick={() => setIsCardFlipped(true)}>
            {t("apps.dictionary.flashcards.showAnswer")}
          </Button>
        )}
      </div>
    </div>
  );
}
