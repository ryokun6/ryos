import { useEffect } from "react";
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
import { DictionarySpeakButton } from "./DictionarySpeakButton";
import { headwordSpeechText } from "../utils/speech";
import { cardSideSounds, soundSpeakKey } from "../utils/anki/cardHtml";
import { dictionaryMediaKey } from "../utils/anki/media";
import { DictionaryCardHtml } from "./DictionaryCardHtml";

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
  const { t, currentCard, isCardFlipped, setIsCardFlipped, speech } = l;
  const buttonVariant = l.isSystem7Theme ? "retro" : l.isMacOSTheme ? "aqua" : "default";

  const ankiCard = currentCard?.card;
  const sideSounds = ankiCard
    ? cardSideSounds(isCardFlipped ? ankiCard.back : ankiCard.front, isCardFlipped ? "back" : "front")
    : [];
  const autoplaySound = ankiCard?.mediaScope ? sideSounds[0] : undefined;
  const { speak } = speech;
  useEffect(() => {
    if (!currentCard || !autoplaySound || !currentCard.card?.mediaScope) return;
    speak({
      key: soundSpeakKey(currentCard.id, autoplaySound),
      text: "",
      lang: currentCard.lang,
      mediaKey: dictionaryMediaKey(currentCard.card.mediaScope, autoplaySound),
    });
    // Play once per card side, not on every favorites update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCard?.id, isCardFlipped, autoplaySound]);

  if (l.deckFavorites.length === 0) {
    const noCardsAnywhere = l.favorites.length === 0;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Cards size={40} className="opacity-30" />
        <p className="text-[13px] font-semibold">
          {noCardsAnywhere
            ? t("apps.dictionary.flashcards.emptyTitle")
            : t("apps.dictionary.decks.emptyDeckTitle")}
        </p>
        <p className="max-w-[280px] text-[12px] opacity-60">
          {noCardsAnywhere
            ? t("apps.dictionary.flashcards.emptyDescription")
            : t("apps.dictionary.decks.emptyDeckDescription")}
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
  // Not `bg-white`: the Aqua dark layer flattens it into the window background.
  const faceClass = cn(
    "dictionary-flashcard-face flex h-full flex-col items-center justify-center rounded-lg border px-6 py-5 text-center",
    "border-black/15 bg-os-input-bg text-os-text-primary shadow-[0_2px_8px_rgba(0,0,0,0.12)]",
    "dark:border-white/15 dark:bg-white/[0.07] dark:shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
  );

  const soundKeyPrefix = soundSpeakKey(currentCard.id, "");
  const playingSound = speech.speakingKey?.startsWith(soundKeyPrefix)
    ? speech.speakingKey.slice(soundKeyPrefix.length)
    : null;
  const renderCardFace = (side: "front" | "back") =>
    ankiCard ? (
      <DictionaryCardHtml
        html={side === "front" ? ankiCard.front : ankiCard.back}
        css={ankiCard.styleId ? l.deckStyles.get(ankiCard.styleId) : undefined}
        mediaScope={ankiCard.mediaScope}
        isDark={l.isDarkMode}
        playLabel={t("apps.dictionary.decks.playAudio")}
        playingSound={playingSound}
        onPlaySound={(filename) =>
          speech.speak({
            key: soundSpeakKey(currentCard.id, filename),
            text: "",
            lang: entry.lang,
            mediaKey: ankiCard.mediaScope
              ? dictionaryMediaKey(ankiCard.mediaScope, filename)
              : undefined,
          })
        }
        className="max-h-full overflow-y-auto"
      />
    ) : null;

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto p-4">
      <div className="mb-2 text-[11px] opacity-55">
        {t("apps.dictionary.flashcards.progress", {
          remaining: l.studyQueueLength,
          reviewed: l.sessionReviewed,
        })}
      </div>
      <div className="relative flex w-full max-w-[460px] flex-1">
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
              {ankiCard ? (
                renderCardFace("front")
              ) : (
                <>
                  <DictionaryHeadword
                    entry={entry}
                    chineseScript={l.chineseScript}
                    phonetics={NO_PHONETICS}
                    size="card"
                  />
                  <p className="mt-4 text-[11px] opacity-45">
                    {t("apps.dictionary.flashcards.tapToFlip")}
                  </p>
                </>
              )}
            </div>
            <div className={cn(faceClass, "dictionary-flashcard-back")}>
              {ankiCard ? (
                renderCardFace("back")
              ) : (
                <>
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
                          <span className="mr-1 text-[11px] italic opacity-55">
                            {sense.partOfSpeech}
                          </span>
                        ) : null}
                        {sense.glosses.slice(0, 4).join("; ")}
                      </div>
                    ))}
                    {example ? (
                      <div className="border-l-2 border-black/10 pl-2.5 pt-1 dark:border-white/15">
                        <DictionaryExampleText
                          example={example}
                          lang={entry.lang}
                          chineseScript={l.chineseScript}
                          phonetics={l.phonetics}
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </button>
        <DictionarySpeakButton
          speech={l.speech}
          request={
            autoplaySound && ankiCard?.mediaScope
              ? {
                  key: soundSpeakKey(currentCard.id, autoplaySound),
                  text: entry.headword,
                  lang: entry.lang,
                  mediaKey: dictionaryMediaKey(ankiCard.mediaScope, autoplaySound),
                }
              : {
                  key: `${entry.id}:flashcard`,
                  text: headwordSpeechText(entry, l.chineseScript),
                  lang: entry.lang,
                  audioUrl: entry.audioUrl,
                }
          }
          label={t("apps.dictionary.actions.listen")}
          stopLabel={t("apps.dictionary.actions.stopSpeaking")}
          size={18}
          className="absolute right-2 top-2 z-10"
        />
      </div>
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
