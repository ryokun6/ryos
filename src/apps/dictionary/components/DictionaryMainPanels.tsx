import { BookOpenText, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveFavoriteDeckId,
  type DictionaryFavorite,
} from "@/stores/useDictionaryStore";
import {
  isHanOnlyQuery,
  normalizeDictionaryQuery,
  type DictionaryQueryLanguage,
} from "@/shared/dictionary";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import { isNewCard } from "../utils/srs";
import {
  DICTIONARY_CHIP_CLASS,
  DICTIONARY_ERROR_TEXT_CLASS,
  DICTIONARY_NOTE_BOX_CLASS,
} from "../utils/styles";
import { DictionaryEntryView } from "./DictionaryEntryView";
import { DictionaryCardHtml } from "./DictionaryCardHtml";
import { soundSpeakKey } from "../utils/anki/cardHtml";
import { dictionaryMediaKey } from "../utils/anki/media";

const SAMPLE_WORDS: { word: string; lang: DictionaryQueryLanguage }[] = [
  { word: "serendipity", lang: "en" },
  { word: "学习", lang: "zh" },
  { word: "勉強", lang: "ja" },
  { word: "사랑", lang: "ko" },
];

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
      <BookOpenText size={44} className="opacity-25" />
      <p className="text-[14px] font-semibold">{t("apps.dictionary.welcome.title")}</p>
      <p className="max-w-[340px] text-[12px] opacity-60">{t("apps.dictionary.welcome.description")}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-1.5">
        {SAMPLE_WORDS.map(({ word, lang }) => (
          <button
            key={word}
            type="button"
            lang={lang}
            onClick={() => l.searchFor(word, lang)}
            className={cn(DICTIONARY_CHIP_CLASS, "px-2.5 py-0.5 text-[13px]")}
          >
            {word}
          </button>
        ))}
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
  const deckIds = new Set(l.decks.map((deck) => deck.id));
  const currentDeckId = resolveFavoriteDeckId(favorite, deckIds);
  const currentDeck = l.decks.find((deck) => deck.id === currentDeckId) ?? null;
  const deckSelect = (
    <Select
      value={currentDeckId}
      onValueChange={(deckId) => l.moveFavoritesToDeck([favorite.id], deckId)}
    >
      <SelectTrigger
        className={cn(
          "h-6 w-[150px] min-w-0 text-[11px]",
          (l.isMacOSTheme || l.isSystem7Theme) && "font-geneva-12"
        )}
        aria-label={t("apps.dictionary.decks.moveTo")}
        title={t("apps.dictionary.decks.moveTo")}
      >
        <SelectValue>
          <span className="truncate">{l.deckLabel(currentDeck).split("::").pop()}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px] max-w-[min(420px,90vw)]">
        {l.decks.map((deck) => (
          <SelectItem key={deck.id} value={deck.id} className="text-[12px]">
            {l.deckLabel(deck).replaceAll("::", " › ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const footer = (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]",
        DICTIONARY_NOTE_BOX_CLASS
      )}
    >
      {deckSelect}
      <span className="opacity-70">
        {favorite.suspended ? `${t("apps.dictionary.decks.suspended")} · ` : ""}
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

  const card = favorite.card;
  if (card) {
    const playingSound = l.speech.speakingKey?.startsWith(`${favorite.id}:sound:`)
      ? l.speech.speakingKey.slice(`${favorite.id}:sound:`.length)
      : null;
    const face = (html: string) => (
      <DictionaryCardHtml
        html={html}
        css={card.styleId ? l.deckStyles.get(card.styleId) : undefined}
        mediaScope={card.mediaScope}
        isDark={l.isDarkMode}
        playLabel={t("apps.dictionary.decks.playAudio")}
        playingSound={playingSound}
        onPlaySound={(filename) =>
          l.speech.speak({
            key: soundSpeakKey(favorite.id, filename),
            text: "",
            lang: favorite.lang,
            mediaKey: card.mediaScope ? dictionaryMediaKey(card.mediaScope, filename) : undefined,
          })
        }
      />
    );
    return (
      <div className="px-5 py-4">
        <div className={cn("rounded-lg p-4", DICTIONARY_NOTE_BOX_CLASS)}>{face(card.back)}</div>
        {card.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.tags.map((tag) => (
              <span key={tag} className={cn(DICTIONARY_CHIP_CLASS, "px-2 py-0.5 text-[10px]")}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {footer}
      </div>
    );
  }

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
