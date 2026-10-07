import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import type { DictionaryInitialData } from "@/apps/base/types";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  DEFAULT_DICTIONARY_DECK_ID,
  DICTIONARY_NEW_CARDS_PER_SESSION,
  filterFavoritesByDeck,
  useDictionaryStore,
  type DictionaryDeck,
  type DictionaryFavorite,
} from "@/stores/useDictionaryStore";
import {
  detectDictionaryLanguage,
  normalizeDictionaryQuery,
  type DictionaryAiExtras,
  type DictionaryEntry,
  type DictionaryLookupResponse,
} from "@/shared/dictionary";
import { helpItems } from "../metadata";
import {
  askDictionaryAi,
  DictionaryApiError,
  lookupDictionaryWord,
} from "../utils/dictionaryApi";
import { buildStudyQueue, type SrsGrade } from "../utils/srs";
import type { AnkiImportProgress } from "../utils/anki/import";
import {
  getDictionaryMediaBytes,
  pruneDictionaryMedia,
  putDictionaryMediaBatch,
} from "../utils/anki/media";
import { useDictionarySpeech } from "./useDictionarySpeech";

const SEARCH_DEBOUNCE_MS = 350;

export type DictionaryLookupStatus = "idle" | "loading" | "ready" | "error";
export type DictionaryAiStatus = "idle" | "loading" | "error";

function describeError(error: unknown): string {
  if (error instanceof DictionaryApiError) {
    if (error.status === 429) return "rate_limited";
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function useDictionaryLogic({
  initialData,
}: {
  initialData?: DictionaryInitialData;
}) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("dictionary", helpItems);
  const dialogs = useAppHelpAboutDialogs();
  const themeFlags = useThemeFlags();
  const locale = useLanguageStore((s) => s.current);

  const {
    view,
    queryLanguage,
    chineseScript,
    phonetics,
    isSidebarVisible,
    isHandwritingOpen,
    aiExtrasEnabled,
    history,
    favorites,
    decks,
    storedSelectedDeckId,
  } = useDictionaryStore(
    useShallow((s) => ({
      view: s.view,
      queryLanguage: s.queryLanguage,
      chineseScript: s.chineseScript,
      phonetics: s.phonetics,
      isSidebarVisible: s.isSidebarVisible,
      isHandwritingOpen: s.isHandwritingOpen,
      aiExtrasEnabled: s.aiExtrasEnabled,
      history: s.history,
      favorites: s.favorites,
      decks: s.decks,
      storedSelectedDeckId: s.selectedDeckId,
    }))
  );
  const actions = useDictionaryStore(
    useShallow((s) => ({
      setView: s.setView,
      setQueryLanguage: s.setQueryLanguage,
      setChineseScript: s.setChineseScript,
      setPhonetic: s.setPhonetic,
      setSidebarVisible: s.setSidebarVisible,
      setHandwritingOpen: s.setHandwritingOpen,
      setAiExtrasEnabled: s.setAiExtrasEnabled,
      recordHistory: s.recordHistory,
      clearHistory: s.clearHistory,
      toggleFavorite: s.toggleFavorite,
      removeFavorite: s.removeFavorite,
      reviewFavorite: s.reviewFavorite,
      resetFavoriteProgress: s.resetFavoriteProgress,
      setSelectedDeckId: s.setSelectedDeckId,
      createDeck: s.createDeck,
      renameDeck: s.renameDeck,
      deleteDeck: s.deleteDeck,
      moveFavoritesToDeck: s.moveFavoritesToDeck,
    }))
  );

  const speech = useDictionarySpeech(chineseScript);
  const [query, setQuery] = useState(initialData?.word ?? "");
  const [result, setResult] = useState<DictionaryLookupResponse | null>(null);
  const [status, setStatus] = useState<DictionaryLookupStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const [aiEntry, setAiEntry] = useState<DictionaryEntry | null>(null);
  const [aiExtras, setAiExtras] = useState<DictionaryAiExtras | null>(null);
  const [aiStatus, setAiStatus] = useState<DictionaryAiStatus>("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  const lookupAbortRef = useRef<AbortController | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const lastLookupKeyRef = useRef<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resetAi = useCallback(() => {
    aiAbortRef.current?.abort();
    setAiEntry(null);
    setAiExtras(null);
    setAiStatus("idle");
    setAiError(null);
  }, []);

  const runLookup = useCallback(
    async (
      rawQuery: string,
      options: { lang?: typeof queryLanguage; record?: boolean } = {}
    ) => {
      const normalized = normalizeDictionaryQuery(rawQuery);
      const lang = options.lang ?? useDictionaryStore.getState().queryLanguage;
      const key = `${lang}:${normalized}`;
      if (!normalized) {
        lookupAbortRef.current?.abort();
        lastLookupKeyRef.current = "";
        setResult(null);
        setStatus("idle");
        setError(null);
        resetAi();
        return;
      }
      if (key === lastLookupKeyRef.current && !options.record) return;
      lastLookupKeyRef.current = key;

      lookupAbortRef.current?.abort();
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      setStatus("loading");
      setError(null);
      resetAi();
      try {
        const response = await lookupDictionaryWord(
          normalized,
          lang,
          controller.signal
        );
        if (controller.signal.aborted) return;
        setResult(response);
        setSelectedEntryId(response.entries[0]?.id ?? null);
        setStatus("ready");
        if (options.record !== false && !response.notFound) {
          actions.recordHistory(normalized, lang);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        lastLookupKeyRef.current = "";
        setError(describeError(err));
        setStatus("error");
      }
    },
    [actions, resetAi]
  );

  // Debounced search-as-you-type; Enter submits immediately.
  useEffect(() => {
    if (view !== "lookup") return;
    const timer = window.setTimeout(() => {
      void runLookup(query, { record: false });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, queryLanguage, view, runLookup]);

  useEffect(() => {
    if (initialData?.lang) actions.setQueryLanguage(initialData.lang);
    if (initialData?.word) {
      actions.setView("lookup");
      setQuery(initialData.word);
    }
  }, [initialData?.word, initialData?.lang, actions]);

  useEffect(
    () => () => {
      lookupAbortRef.current?.abort();
      aiAbortRef.current?.abort();
    },
    []
  );

  const submitQuery = useCallback(() => {
    const normalized = normalizeDictionaryQuery(query);
    const lang = useDictionaryStore.getState().queryLanguage;
    if (
      status === "ready" &&
      result &&
      !result.notFound &&
      lastLookupKeyRef.current === `${lang}:${normalized}`
    ) {
      actions.recordHistory(normalized, lang);
      return;
    }
    lastLookupKeyRef.current = "";
    void runLookup(query, { record: true });
  }, [actions, query, result, runLookup, status]);

  const searchFor = useCallback(
    (word: string, lang?: typeof queryLanguage) => {
      if (lang) actions.setQueryLanguage(lang);
      actions.setView("lookup");
      setQuery(word);
      lastLookupKeyRef.current = "";
      void runLookup(word, { lang, record: true });
    },
    [actions, runLookup]
  );

  const entries = useMemo(() => {
    const list = result?.entries ?? [];
    return aiEntry ? [...list, aiEntry] : list;
  }, [result, aiEntry]);

  /** Nothing typed and nothing looked up yet — the only state that lists recents. */
  const isStartState =
    status === "idle" && entries.length === 0 && !normalizeDictionaryQuery(query);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;

  const resultLanguage =
    result?.lang ??
    detectDictionaryLanguage(normalizeDictionaryQuery(query), queryLanguage);

  const askAi = useCallback(
    async (mode: "fallback" | "extras") => {
      const word =
        mode === "extras" && selectedEntry
          ? selectedEntry.headword
          : normalizeDictionaryQuery(query);
      if (!word) return;
      const lang = mode === "extras" && selectedEntry ? selectedEntry.lang : resultLanguage;
      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setAiStatus("loading");
      setAiError(null);
      try {
        const response = await askDictionaryAi(
          word,
          lang,
          mode,
          locale,
          controller.signal
        );
        if (controller.signal.aborted) return;
        if (mode === "fallback") {
          setAiEntry(response.entry ?? null);
          if (response.entry) setSelectedEntryId(response.entry.id);
          else setAiError("not_found");
        } else {
          setAiExtras(response.extras ?? null);
        }
        setAiStatus("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        setAiError(describeError(err));
        setAiStatus("error");
      }
    },
    [locale, query, resultLanguage, selectedEntry]
  );

  useEffect(() => {
    setAiExtras(null);
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (
      aiExtrasEnabled &&
      selectedEntry &&
      selectedEntry.source !== "ai" &&
      !aiExtras &&
      aiStatus === "idle"
    ) {
      void askAi("extras");
    }
    // Only auto-run once per selected entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiExtrasEnabled, selectedEntry?.id]);

  // ---------------------------------------------------------------------------
  // Flashcards
  // ---------------------------------------------------------------------------

  const selectedDeckId =
    storedSelectedDeckId !== null && decks.some((deck) => deck.id === storedSelectedDeckId)
      ? storedSelectedDeckId
      : null;
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const deckFavorites = useMemo(
    () => filterFavoritesByDeck(favorites, decks, selectedDeckId),
    [favorites, decks, selectedDeckId]
  );
  const deckLabel = useCallback(
    (deck: Pick<DictionaryDeck, "id" | "name"> | null) =>
      !deck
        ? t("apps.dictionary.decks.all")
        : deck.id === DEFAULT_DICTIONARY_DECK_ID && !deck.name
          ? t("apps.dictionary.decks.default")
          : deck.name,
    [t]
  );
  const deckStyles = useMemo(() => {
    const map = new Map<string, string>();
    for (const deck of decks) {
      for (const [styleId, css] of Object.entries(deck.styles ?? {})) map.set(styleId, css);
    }
    return map;
  }, [decks]);

  const [studyQueue, setStudyQueue] = useState<string[]>([]);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [sessionReviewed, setSessionReviewed] = useState(0);

  const favoritesById = useMemo(
    () => new Map(favorites.map((fav) => [fav.id, fav])),
    [favorites]
  );

  const startStudySession = useCallback(() => {
    const state = useDictionaryStore.getState();
    const deckId =
      state.selectedDeckId !== null && state.decks.some((deck) => deck.id === state.selectedDeckId)
        ? state.selectedDeckId
        : null;
    const studyable = filterFavoritesByDeck(state.favorites, state.decks, deckId).filter(
      (fav) => !fav.suspended
    );
    const queue = buildStudyQueue(studyable, {
      newLimit: DICTIONARY_NEW_CARDS_PER_SESSION,
    }).map((fav) => fav.id);
    setStudyQueue(queue);
    setIsCardFlipped(false);
    setSessionReviewed(0);
  }, []);

  useEffect(() => {
    if (view === "flashcards") startStudySession();
  }, [view, selectedDeckId, startStudySession]);

  const currentCard: DictionaryFavorite | null =
    studyQueue.length > 0 ? favoritesById.get(studyQueue[0]) ?? null : null;

  useEffect(() => {
    if (studyQueue.length > 0 && !favoritesById.has(studyQueue[0])) {
      setStudyQueue((queue) => queue.filter((id) => favoritesById.has(id)));
    }
  }, [favoritesById, studyQueue]);

  const gradeCard = useCallback(
    (grade: SrsGrade) => {
      if (!currentCard) return;
      actions.reviewFavorite(currentCard.id, grade);
      setSessionReviewed((n) => n + 1);
      setIsCardFlipped(false);
      setStudyQueue((queue) => {
        const [head, ...rest] = queue;
        // Failed cards come back at the end of this session.
        return grade === "again" ? [...rest, head] : rest;
      });
    },
    [actions, currentCard]
  );

  const dueCount = useMemo(
    () =>
      buildStudyQueue(
        deckFavorites.filter((fav) => !fav.suspended),
        { newLimit: DICTIONARY_NEW_CARDS_PER_SESSION }
      ).length,
    [deckFavorites]
  );

  // ---------------------------------------------------------------------------
  // Decks + Anki
  // ---------------------------------------------------------------------------

  const [deckDialog, setDeckDialog] = useState<"new" | "rename" | "delete" | null>(null);
  const [deckNameDraft, setDeckNameDraft] = useState("");
  const [ankiProgress, setAnkiProgress] = useState<AnkiImportProgress | null>(null);
  const [isExportingAnki, setIsExportingAnki] = useState(false);

  const openDeckDialog = useCallback(
    (kind: "new" | "rename" | "delete") => {
      if (kind !== "new" && !selectedDeck) return;
      setDeckNameDraft(kind === "rename" && selectedDeck ? deckLabel(selectedDeck) : "");
      setDeckDialog(kind);
    },
    [deckLabel, selectedDeck]
  );

  const submitDeckDialog = useCallback(() => {
    if (deckDialog === "new") {
      if (!actions.createDeck(deckNameDraft)) return;
    } else if (deckDialog === "rename" && selectedDeck) {
      if (!deckNameDraft.trim()) return;
      actions.renameDeck(selectedDeck.id, deckNameDraft);
    } else if (deckDialog === "delete" && selectedDeck) {
      actions.deleteDeck(selectedDeck.id);
      const scopes = new Set(
        useDictionaryStore
          .getState()
          .favorites.flatMap((fav) => (fav.card?.mediaScope ? [fav.card.mediaScope] : []))
      );
      pruneDictionaryMedia(scopes).catch((error) =>
        console.error("[Dictionary] Media cleanup failed:", error)
      );
    }
    setDeckDialog(null);
  }, [actions, deckDialog, deckNameDraft, selectedDeck]);

  const importAnkiFile = useCallback(
    async (file: File) => {
      if (ankiProgress) return;
      setAnkiProgress({ phase: "reading", done: 0, total: 1 });
      try {
        const { importAnkiPackage, loadSqlJs } = await import("../utils/anki/packages");
        const [SQL, buffer] = await Promise.all([loadSqlJs(), file.arrayBuffer()]);
        const result = await importAnkiPackage(new Uint8Array(buffer), {
          SQL,
          storeMedia: putDictionaryMediaBatch,
          onProgress: setAnkiProgress,
        });
        if (result.favorites.length === 0) {
          toast.error(t("apps.dictionary.decks.importEmpty"));
          return;
        }
        useDictionaryStore.getState().importBundle(result);
        actions.setSelectedDeckId(result.decks.length === 1 ? result.decks[0].id : null);
        toast.success(
          t("apps.dictionary.decks.importDone", { count: result.favorites.length }),
          {
            description: [
              t("apps.dictionary.decks.importDecks", { count: result.decks.length }),
              result.mediaStored
                ? t("apps.dictionary.decks.importMedia", { count: result.mediaStored })
                : null,
              result.missingMedia.length
                ? t("apps.dictionary.decks.importMissingMedia", {
                    count: result.missingMedia.length,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }
        );
      } catch (error) {
        console.error("[Dictionary] Anki import failed:", error);
        toast.error(t("apps.dictionary.decks.importError"), {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setAnkiProgress(null);
      }
    },
    [actions, ankiProgress, t]
  );

  const exportAnki = useCallback(async () => {
    if (isExportingAnki) return;
    const state = useDictionaryStore.getState();
    const cards = filterFavoritesByDeck(state.favorites, state.decks, selectedDeckId);
    if (cards.length === 0) {
      toast.error(t("apps.dictionary.decks.exportEmpty"));
      return;
    }
    setIsExportingAnki(true);
    try {
      const { exportAnkiPackage, loadSqlJs } = await import("../utils/anki/packages");
      const result = await exportAnkiPackage({
        SQL: await loadSqlJs(),
        decks: state.decks,
        favorites: cards,
        defaultDeckName: t("apps.dictionary.decks.default"),
        loadMedia: getDictionaryMediaBytes,
      });
      const baseName =
        (selectedDeck ? deckLabel(selectedDeck).split("::").pop() : null) ??
        t("apps.dictionary.title");
      const url = URL.createObjectURL(
        new Blob([result.data as BlobPart], { type: "application/octet-stream" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Dictionary"}.apkg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(t("apps.dictionary.decks.exportDone", { count: result.noteCount }));
    } catch (error) {
      console.error("[Dictionary] Anki export failed:", error);
      toast.error(t("apps.dictionary.decks.exportError"));
    } finally {
      setIsExportingAnki(false);
    }
  }, [deckLabel, isExportingAnki, selectedDeck, selectedDeckId, t]);

  const isFavorite = useCallback(
    (id: string) => favoritesById.has(id),
    [favoritesById]
  );

  const appendToQuery = useCallback((text: string) => {
    setQuery((current) => `${current}${text}`);
    searchInputRef.current?.focus();
  }, []);

  return {
    t,
    locale,
    ...themeFlags,
    ...dialogs,
    translatedHelpItems,
    // store
    view,
    queryLanguage,
    chineseScript,
    phonetics,
    isSidebarVisible,
    isHandwritingOpen,
    aiExtrasEnabled,
    history,
    favorites,
    ...actions,
    // decks
    decks,
    selectedDeckId,
    selectedDeck,
    deckFavorites,
    deckLabel,
    deckStyles,
    deckDialog,
    setDeckDialog,
    deckNameDraft,
    setDeckNameDraft,
    openDeckDialog,
    submitDeckDialog,
    importAnkiFile,
    ankiProgress,
    exportAnki,
    isExportingAnki,
    // lookup
    query,
    setQuery,
    searchInputRef,
    submitQuery,
    searchFor,
    appendToQuery,
    result,
    status,
    error,
    entries,
    isStartState,
    selectedEntry,
    setSelectedEntryId,
    resultLanguage,
    isFavorite,
    // ai
    askAi,
    aiStatus,
    aiError,
    aiExtras,
    aiEntry,
    // flashcards
    currentCard,
    studyQueueLength: studyQueue.length,
    isCardFlipped,
    setIsCardFlipped,
    gradeCard,
    sessionReviewed,
    startStudySession,
    dueCount,
    // speech
    speech,
  };
}

export type DictionaryLogic = ReturnType<typeof useDictionaryLogic>;
