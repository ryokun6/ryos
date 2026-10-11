import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { DictionaryInitialData } from "@/apps/base/types";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  DICTIONARY_NEW_CARDS_PER_SESSION,
  useDictionaryStore,
  type DictionaryFavorite,
} from "@/stores/useDictionaryStore";
import {
  detectDictionaryLanguage,
  normalizeDictionaryQuery,
  type DictionaryAiExtras,
  type DictionaryEntry,
  type DictionaryLanguage,
  type DictionaryLookupResponse,
} from "@/shared/dictionary";
import { mergeDictionaryLookup } from "@/shared/dictionaryMerge";
import {
  dictionaryAiNotesHaveContent,
  parseDictionaryAiNotes,
} from "../utils/dictionaryAiStream";
import { helpItems } from "../metadata";
import {
  askDictionaryAi,
  DictionaryApiError,
  lookupDictionaryWord,
  streamDictionaryAiExtras,
} from "../utils/dictionaryApi";
import { readDictionaryClientCache } from "../utils/dictionaryLookupCache";
import { buildStudyQueue, type SrsGrade } from "../utils/srs";
import { useDictionarySpeech } from "./useDictionarySpeech";

const SEARCH_DEBOUNCE_MS = 350;

export type DictionaryLookupStatus = "idle" | "loading" | "ready" | "error";
export type DictionaryAiStatus = "idle" | "loading" | "streaming" | "error";

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
    }))
  );

  const speech = useDictionarySpeech(chineseScript);
  const [query, setQuery] = useState(initialData?.word ?? "");
  const [result, setResult] = useState<DictionaryLookupResponse | null>(null);
  const resultRef = useRef<DictionaryLookupResponse | null>(null);
  resultRef.current = result;
  const [status, setStatus] = useState<DictionaryLookupStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const [aiEntry, setAiEntry] = useState<DictionaryEntry | null>(null);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [aiNotesLang, setAiNotesLang] = useState<DictionaryLanguage>("en");
  const [aiStatus, setAiStatus] = useState<DictionaryAiStatus>("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  const lookupAbortRef = useRef<AbortController | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiRequestRef = useRef(0);
  const lastLookupKeyRef = useRef<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resetAi = useCallback(() => {
    aiRequestRef.current += 1;
    aiAbortRef.current?.abort();
    setAiEntry(null);
    setAiNotes(null);
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
      const localeHint = locale.toLowerCase().startsWith("ja") ? "ja" : "";
      const key = `${lang}:${localeHint}:${normalized}`;
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
      const cached = readDictionaryClientCache(normalized, lang, locale);
      if (cached) {
        lookupAbortRef.current = null;
        resultRef.current = cached;
        setResult(cached);
        setSelectedEntryId(cached.entries[0]?.id ?? null);
        setStatus("ready");
        setError(null);
        resetAi();
        if (options.record !== false && !cached.notFound) {
          actions.recordHistory(normalized, lang);
        }
        return;
      }
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      setStatus("loading");
      setError(null);
      resetAi();
      try {
        const response = await lookupDictionaryWord(normalized, lang, controller.signal, {
          locale,
          onEnrichment: (enriched) => {
            if (controller.signal.aborted || lastLookupKeyRef.current !== key) return;
            const next = mergeDictionaryLookup(resultRef.current, enriched);
            resultRef.current = next;
            setResult(next);
            setSelectedEntryId((current) =>
              next.entries.some((entry) => entry.id === current)
                ? current
                : (next.entries[0]?.id ?? null)
            );
          },
        });
        if (controller.signal.aborted) return;
        const { enrichmentPending: _enrichmentPending, ...visible } = response;
        resultRef.current = visible;
        setResult(visible);
        setSelectedEntryId(visible.entries[0]?.id ?? null);
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
    [actions, locale, resetAi]
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
      const requestId = ++aiRequestRef.current;
      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setAiStatus("loading");
      setAiError(null);
      if (mode === "extras") {
        setAiNotes(null);
        setAiNotesLang(lang);
      }
      try {
        if (mode === "extras") {
          let sawText = false;
          let pendingNotes = "";
          let frame = 0;
          const publish = (notes: string) => {
            if (controller.signal.aborted || aiRequestRef.current !== requestId) return;
            pendingNotes = notes;
            if (!notes.trim()) return;
            sawText = true;
            if (frame) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              if (controller.signal.aborted || aiRequestRef.current !== requestId) return;
              setAiNotes(pendingNotes);
              setAiStatus("streaming");
            });
          };
          await streamDictionaryAiExtras(word, lang, locale, publish, controller.signal);
          if (frame) cancelAnimationFrame(frame);
          if (controller.signal.aborted || aiRequestRef.current !== requestId) return;
          if (sawText) setAiNotes(pendingNotes);
          else setAiError("ai_unavailable");
          setAiStatus(sawText ? "idle" : "error");
          return;
        }
        const response = await askDictionaryAi(word, lang, mode, locale, controller.signal);
        if (controller.signal.aborted) return;
        setAiEntry(response.entry ?? null);
        if (response.entry) setSelectedEntryId(response.entry.id);
        else setAiError("not_found");
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
    aiRequestRef.current += 1;
    aiAbortRef.current?.abort();
    setAiNotes(null);
    setAiStatus("idle");
    setAiError(null);
    return () => {
      aiRequestRef.current += 1;
      aiAbortRef.current?.abort();
    };
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (aiExtrasEnabled && selectedEntry && selectedEntry.source !== "ai") {
      void askAi("extras");
    }
    // Restart when the entry or the toggle changes. askAi aborts the previous stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiExtrasEnabled, selectedEntry?.id]);

  // ---------------------------------------------------------------------------
  // Flashcards
  // ---------------------------------------------------------------------------

  const [studyQueue, setStudyQueue] = useState<string[]>([]);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [sessionReviewed, setSessionReviewed] = useState(0);

  const favoritesById = useMemo(
    () => new Map(favorites.map((fav) => [fav.id, fav])),
    [favorites]
  );

  const startStudySession = useCallback(() => {
    const queue = buildStudyQueue(useDictionaryStore.getState().favorites, {
      newLimit: DICTIONARY_NEW_CARDS_PER_SESSION,
    }).map((fav) => fav.id);
    setStudyQueue(queue);
    setIsCardFlipped(false);
    setSessionReviewed(0);
  }, []);

  useEffect(() => {
    if (view === "flashcards") startStudySession();
  }, [view, startStudySession]);

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
      buildStudyQueue(favorites, { newLimit: DICTIONARY_NEW_CARDS_PER_SESSION })
        .length,
    [favorites]
  );

  const isFavorite = useCallback(
    (id: string) => favoritesById.has(id),
    [favoritesById]
  );

  const appendToQuery = useCallback((text: string) => {
    setQuery((current) => `${current}${text}`);
    searchInputRef.current?.focus();
  }, []);

  const aiExtras = useMemo<DictionaryAiExtras | null>(() => {
    if (!aiNotes) return null;
    const parsed = parseDictionaryAiNotes(aiNotes, aiNotesLang, {
      complete: aiStatus !== "streaming",
    });
    return dictionaryAiNotesHaveContent(parsed) ? parsed : null;
  }, [aiNotes, aiNotesLang, aiStatus]);

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
