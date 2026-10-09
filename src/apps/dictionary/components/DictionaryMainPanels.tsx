import { Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DictionaryFavorite } from "@/stores/useDictionaryStore";
import { isHanOnlyQuery, normalizeDictionaryQuery } from "@/shared/dictionary";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import { DICTIONARY_SAMPLE_WORDS, dictionarySampleLabel } from "../utils/sampleWords";
import { isNewCard } from "../utils/srs";
import {
  DICTIONARY_CHIP_CLASS,
  DICTIONARY_ERROR_TEXT_CLASS,
  DICTIONARY_NOTE_BOX_CLASS,
} from "../utils/styles";
import { DictionaryEntryView } from "./DictionaryEntryView";

function buttonVariant(l: DictionaryLogic) {
  return l.isSystem7Theme ? "retro" : l.isMacOSTheme ? "aqua" : "default";
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      {children}
    </div>
  );
}

function AiErrorText({ l }: { l: DictionaryLogic }) {
  if (!l.aiError) return null;
  const key =
    l.aiError === "rate_limited"
      ? "apps.dictionary.ai.rateLimited"
      : l.aiError === "not_found"
        ? "apps.dictionary.ai.notFound"
        : "apps.dictionary.ai.error";
  return <p className={cn("text-[11px]", DICTIONARY_ERROR_TEXT_CLASS)}>{l.t(key)}</p>;
}

export function DictionaryLookupPanel({ l }: { l: DictionaryLogic }) {
  const { t, status, result, selectedEntry, query } = l;

  if (selectedEntry && status !== "loading") {
    const normalized = normalizeDictionaryQuery(query);
    const otherLanguage =
      result && isHanOnlyQuery(normalized)
        ? result.lang === "zh"
          ? "ja"
          : result.lang === "ja"
            ? "zh"
            : null
        : null;
    return (
      <>
        {otherLanguage ? (
          <div className="flex items-center gap-1 px-5 pt-2 text-[11px] opacity-70">
            <span>{t("apps.dictionary.status.alsoIn")}</span>
            <button
              type="button"
              className="underline decoration-dotted hover:opacity-80"
              onClick={() => l.searchFor(normalized, otherLanguage)}
            >
              {t(`apps.dictionary.languages.${otherLanguage}`)}
            </button>
          </div>
        ) : null}
        <DictionaryEntryView l={l} entry={selectedEntry} />
      </>
    );
  }

  if (status === "loading") {
    return (
      <CenteredMessage>
        <p className="text-[12px] opacity-60">{t("apps.dictionary.status.searching")}</p>
      </CenteredMessage>
    );
  }

  if (status === "error") {
    return (
      <CenteredMessage>
        <p className="text-[13px] font-semibold">{t("apps.dictionary.status.errorTitle")}</p>
        <p className="max-w-[320px] text-[12px] opacity-60">{t("apps.dictionary.status.errorDescription")}</p>
        <Button variant={buttonVariant(l)} size="sm" onClick={l.submitQuery}>
          {t("apps.dictionary.status.retry")}
        </Button>
      </CenteredMessage>
    );
  }

  if (status === "ready" && result?.notFound) {
    return (
      <CenteredMessage>
        <p className="text-[13px] font-semibold">
          {t("apps.dictionary.status.notFound", { query: query.trim() })}
        </p>
        {result.suggestions.length > 0 ? (
          <div className="flex max-w-[360px] flex-col items-center gap-1.5">
            <span className="text-[11px] opacity-55">{t("apps.dictionary.status.didYouMean")}</span>
            <div className="flex flex-wrap justify-center gap-1">
              {result.suggestions.map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => l.searchFor(word, result.lang)}
                  className={cn(DICTIONARY_CHIP_CLASS, "px-2 py-0.5 text-[12px]")}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Button
          variant={buttonVariant(l)}
          size="sm"
          className="mt-2 gap-1.5"
          disabled={l.aiStatus === "loading"}
          onClick={() => void l.askAi("fallback")}
        >
          <Sparkle size={13} weight="fill" />
          {l.aiStatus === "loading"
            ? t("apps.dictionary.ai.thinking")
            : t("apps.dictionary.ai.askFallback")}
        </Button>
        <AiErrorText l={l} />
      </CenteredMessage>
    );
  }

  return (
    <CenteredMessage>
      <p className="text-[14px] font-semibold">{t("apps.dictionary.welcome.title")}</p>
      <p className="max-w-[340px] text-[12px] opacity-60">{t("apps.dictionary.welcome.description")}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-1.5">
        {DICTIONARY_SAMPLE_WORDS.map((sample) => {
          const word = dictionarySampleLabel(sample, l.chineseScript);
          return (
            <button
              key={sample.lang}
              type="button"
              lang={sample.lang}
              onClick={() => l.searchFor(word, sample.lang)}
              className={cn(DICTIONARY_CHIP_CLASS, "px-2.5 py-0.5 text-[13px]")}
            >
              {word}
            </button>
          );
        })}
      </div>
    </CenteredMessage>
  );
}

function formatDate(timestamp: number, locale: string) {
  try {
    return new Date(timestamp).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return new Date(timestamp).toLocaleDateString();
  }
}

export function DictionaryFavoritesPanel({
  l,
  favorite,
}: {
  l: DictionaryLogic;
  favorite: DictionaryFavorite | null;
}) {
  const { t } = l;
  if (!favorite) {
    return (
      <CenteredMessage>
        <p className="text-[13px] font-semibold">{t("apps.dictionary.empty.noFavorites")}</p>
        <p className="max-w-[300px] text-[12px] opacity-60">
          {t("apps.dictionary.empty.noFavoritesDescription")}
        </p>
      </CenteredMessage>
    );
  }

  const { srs } = favorite;
  const footer = (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]",
        DICTIONARY_NOTE_BOX_CLASS
      )}
    >
      <span className="opacity-70">
        {isNewCard(srs)
          ? t("apps.dictionary.flashcards.statusNew")
          : t("apps.dictionary.flashcards.statusReview", {
              date: formatDate(srs.dueAt, l.locale),
              reps: srs.repetitions,
            })}
      </span>
      <div className="flex-1" />
      <Button
        variant={buttonVariant(l)}
        size="sm"
        className="h-6 text-[11px]"
        onClick={() => l.searchFor(favorite.headword, favorite.lang)}
      >
        {t("apps.dictionary.actions.openFullEntry")}
      </Button>
      {!isNewCard(srs) ? (
        <Button
          variant={buttonVariant(l)}
          size="sm"
          className="h-6 text-[11px]"
          onClick={() => l.resetFavoriteProgress(favorite.id)}
        >
          {t("apps.dictionary.actions.resetProgress")}
        </Button>
      ) : null}
    </div>
  );

  return (
    <DictionaryEntryView
      l={l}
      entry={favorite.entry}
      showRelated={false}
      showAi={false}
      footer={footer}
    />
  );
}
