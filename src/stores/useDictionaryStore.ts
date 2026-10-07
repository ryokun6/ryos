import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  DictionaryEntry,
  DictionaryLanguage,
  DictionaryQueryLanguage,
  DictionarySense,
} from "@/shared/dictionary";
import { isDictionaryLanguage } from "@/shared/dictionary";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  createSrsCard,
  reviewSrsCard,
  sanitizeSrsCard,
  type SrsCardState,
  type SrsGrade,
} from "@/apps/dictionary/utils/srs";
import { STORAGE_KEYS } from "@/utils/storageKeys";

export type DictionaryView = "lookup" | "favorites" | "flashcards";
export type DictionaryChineseScript = "simplified" | "traditional";

export interface DictionaryPhoneticSettings {
  pinyin: boolean;
  zhuyin: boolean;
  furigana: boolean;
  romaji: boolean;
  koreanRomanization: boolean;
}

export interface DictionaryHistoryItem {
  query: string;
  lang: DictionaryQueryLanguage;
  at: number;
}

export interface DictionaryFavorite {
  /** Same as the entry id (`${source}:${key}`). */
  id: string;
  lang: DictionaryLanguage;
  headword: string;
  /** Trimmed entry snapshot so flashcards work offline. */
  entry: DictionaryEntry;
  addedAt: number;
  updatedAt: number;
  srs: SrsCardState;
}

const STORE_VERSION = 2;
const HISTORY_LIMIT = 50;
const SNAPSHOT_SENSES = 4;
const SNAPSHOT_GLOSSES = 6;
const SNAPSHOT_EXAMPLES = 2;

export const DEFAULT_DICTIONARY_PHONETICS: DictionaryPhoneticSettings = {
  pinyin: true,
  zhuyin: false,
  furigana: true,
  romaji: false,
  koreanRomanization: true,
};

export const DICTIONARY_NEW_CARDS_PER_SESSION = 20;

/** Drop bulky/derived fields so favorites stay small in localStorage + sync. */
export function snapshotDictionaryEntry(entry: DictionaryEntry): DictionaryEntry {
  const senses: DictionarySense[] = entry.senses
    .slice(0, SNAPSHOT_SENSES)
    .map((sense) => ({
      ...(sense.partOfSpeech ? { partOfSpeech: sense.partOfSpeech } : {}),
      glosses: sense.glosses.slice(0, SNAPSHOT_GLOSSES),
      ...(sense.examples?.length
        ? { examples: sense.examples.slice(0, SNAPSHOT_EXAMPLES) }
        : {}),
    }));
  return {
    id: entry.id,
    lang: entry.lang,
    headword: entry.headword,
    ...(entry.traditional ? { traditional: entry.traditional } : {}),
    ...(entry.simplified ? { simplified: entry.simplified } : {}),
    ...(entry.reading ? { reading: entry.reading } : {}),
    ...(entry.hanja ? { hanja: entry.hanja } : {}),
    ...(entry.ipa ? { ipa: entry.ipa } : {}),
    senses,
    source: entry.source,
  };
}

export function sanitizeDictionaryFavorite(
  value: unknown,
  id: string,
  now: number = Date.now()
): DictionaryFavorite | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DictionaryFavorite>;
  const entry = record.entry as DictionaryEntry | undefined;
  if (
    !entry ||
    typeof entry !== "object" ||
    typeof entry.headword !== "string" ||
    !isDictionaryLanguage(entry.lang) ||
    !Array.isArray(entry.senses)
  ) {
    return null;
  }
  return {
    id,
    lang: entry.lang,
    headword: entry.headword,
    entry: { ...entry, id },
    addedAt: typeof record.addedAt === "number" ? record.addedAt : now,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : now,
    srs: sanitizeSrsCard(record.srs, now),
  };
}

interface DictionaryStoreState {
  view: DictionaryView;
  queryLanguage: DictionaryQueryLanguage;
  chineseScript: DictionaryChineseScript;
  phonetics: DictionaryPhoneticSettings;
  isSidebarVisible: boolean;
  isHandwritingOpen: boolean;
  aiExtrasEnabled: boolean;
  history: DictionaryHistoryItem[];
  favorites: DictionaryFavorite[];

  setView: (view: DictionaryView) => void;
  setQueryLanguage: (lang: DictionaryQueryLanguage) => void;
  setChineseScript: (script: DictionaryChineseScript) => void;
  setPhonetic: (key: keyof DictionaryPhoneticSettings, enabled: boolean) => void;
  setSidebarVisible: (visible: boolean) => void;
  setHandwritingOpen: (open: boolean) => void;
  setAiExtrasEnabled: (enabled: boolean) => void;
  recordHistory: (query: string, lang: DictionaryQueryLanguage) => void;
  clearHistory: () => void;
  isFavorite: (id: string) => boolean;
  addFavorite: (entry: DictionaryEntry) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (entry: DictionaryEntry) => void;
  reviewFavorite: (id: string, grade: SrsGrade, now?: number) => void;
  resetFavoriteProgress: (id?: string) => void;
  /** Replace favorites with merged cloud-sync data (no tombstones). */
  replaceFavoritesFromSync: (favorites: DictionaryFavorite[]) => void;
}

export const useDictionaryStore = create<DictionaryStoreState>()(
  persist(
    (set, get) => ({
      view: "lookup",
      queryLanguage: "auto",
      chineseScript: "traditional",
      phonetics: DEFAULT_DICTIONARY_PHONETICS,
      isSidebarVisible: true,
      isHandwritingOpen: false,
      aiExtrasEnabled: false,
      history: [],
      favorites: [],

      setView: (view) => set({ view }),
      setQueryLanguage: (queryLanguage) => set({ queryLanguage }),
      setChineseScript: (chineseScript) => set({ chineseScript }),
      setPhonetic: (key, enabled) =>
        set((state) => ({ phonetics: { ...state.phonetics, [key]: enabled } })),
      setSidebarVisible: (isSidebarVisible) => set({ isSidebarVisible }),
      setHandwritingOpen: (isHandwritingOpen) => set({ isHandwritingOpen }),
      setAiExtrasEnabled: (aiExtrasEnabled) => set({ aiExtrasEnabled }),

      recordHistory: (query, lang) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set((state) => ({
          history: [
            { query: trimmed, lang, at: Date.now() },
            ...state.history.filter((item) => item.query !== trimmed),
          ].slice(0, HISTORY_LIMIT),
        }));
      },
      clearHistory: () => set({ history: [] }),

      isFavorite: (id) => get().favorites.some((fav) => fav.id === id),

      addFavorite: (entry) => {
        if (get().isFavorite(entry.id)) return;
        const now = Date.now();
        useCloudSyncStore
          .getState()
          .clearDeletedKeys("dictionaryFavoriteIds", [entry.id]);
        set((state) => ({
          favorites: [
            {
              id: entry.id,
              lang: entry.lang,
              headword: entry.headword,
              entry: snapshotDictionaryEntry(entry),
              addedAt: now,
              updatedAt: now,
              srs: createSrsCard(now),
            },
            ...state.favorites,
          ],
        }));
      },

      removeFavorite: (id) => {
        if (!get().isFavorite(id)) return;
        useCloudSyncStore
          .getState()
          .markDeletedKeys("dictionaryFavoriteIds", [id]);
        set((state) => ({
          favorites: state.favorites.filter((fav) => fav.id !== id),
        }));
      },

      toggleFavorite: (entry) => {
        if (get().isFavorite(entry.id)) get().removeFavorite(entry.id);
        else get().addFavorite(entry);
      },

      reviewFavorite: (id, grade, now = Date.now()) =>
        set((state) => ({
          favorites: state.favorites.map((fav) =>
            fav.id === id
              ? { ...fav, srs: reviewSrsCard(fav.srs, grade, now), updatedAt: now }
              : fav
          ),
        })),

      resetFavoriteProgress: (id) => {
        const now = Date.now();
        set((state) => ({
          favorites: state.favorites.map((fav) =>
            id === undefined || fav.id === id
              ? { ...fav, srs: createSrsCard(now), updatedAt: now }
              : fav
          ),
        }));
      },

      replaceFavoritesFromSync: (favorites) => set({ favorites }),
    }),
    {
      name: STORAGE_KEYS.dictionary,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        view: state.view,
        queryLanguage: state.queryLanguage,
        chineseScript: state.chineseScript,
        phonetics: state.phonetics,
        isSidebarVisible: state.isSidebarVisible,
        aiExtrasEnabled: state.aiExtrasEnabled,
        history: state.history,
        favorites: state.favorites,
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<DictionaryStoreState>;
        if (version < 2) {
          return { ...state, chineseScript: "traditional" as const };
        }
        return state;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DictionaryStoreState>;
        return {
          ...current,
          ...p,
          phonetics: { ...DEFAULT_DICTIONARY_PHONETICS, ...(p.phonetics ?? {}) },
          favorites: Array.isArray(p.favorites)
            ? p.favorites.flatMap((fav) => {
                const clean = sanitizeDictionaryFavorite(fav, fav?.id);
                return clean && typeof fav?.id === "string" ? [clean] : [];
              })
            : current.favorites,
        };
      },
    }
  )
);
