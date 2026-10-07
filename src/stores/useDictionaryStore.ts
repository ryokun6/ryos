import { create } from "zustand";
import { persist } from "zustand/middleware";
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
import { createIndexedDBPersistStorage } from "@/utils/indexedDBPersistStorage";

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

export interface DictionaryDeck {
  id: string;
  /** Empty for the built-in default deck, which shows a localized label. */
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Source Anki deck id, kept so re-importing the same deck merges into it. */
  ankiDeckId?: string;
  /** Imported note type CSS keyed by `DictionaryCardContent.styleId`. */
  styles?: Record<string, string>;
}

export interface DictionaryCardField {
  name: string;
  value: string;
}

/** Free-form card faces (Anki imports). Media is referenced by filename. */
export interface DictionaryCardContent {
  /** Rendered question HTML. */
  front: string;
  /** Rendered answer HTML (may repeat the front above `<hr id=answer>`). */
  back: string;
  fields: DictionaryCardField[];
  tags?: string[];
  notetype?: string;
  /** Anki note guid, reused on export so Anki can update instead of duplicating. */
  guid?: string;
  /** Prefix for this card's media keys in the local media store. */
  mediaScope?: string;
  /** Key into a deck's `styles` map. */
  styleId?: string;
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
  /** Missing or unknown deck ids resolve to the default deck. */
  deckId?: string;
  card?: DictionaryCardContent;
  suspended?: boolean;
}

export const DEFAULT_DICTIONARY_DECK_ID = "default";
export const DICTIONARY_DECK_NAME_MAX_LENGTH = 120;
const CARD_HTML_MAX_LENGTH = 200_000;
const CARD_FIELD_MAX_COUNT = 32;
const DECK_STYLE_MAX_LENGTH = 64_000;
const DECK_STYLE_MAX_COUNT = 16;

const STORE_VERSION = 3;
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
  const card = sanitizeDictionaryCardContent(record.card);
  return {
    id,
    lang: entry.lang,
    headword: entry.headword,
    entry: { ...entry, id },
    addedAt: typeof record.addedAt === "number" ? record.addedAt : now,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : now,
    srs: sanitizeSrsCard(record.srs, now),
    ...(typeof record.deckId === "string" && record.deckId
      ? { deckId: record.deckId }
      : {}),
    ...(card ? { card } : {}),
    ...(record.suspended === true ? { suspended: true } : {}),
  };
}

function cleanString(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

export function sanitizeDictionaryCardContent(
  value: unknown
): DictionaryCardContent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<DictionaryCardContent>;
  const front = cleanString(record.front, CARD_HTML_MAX_LENGTH);
  const back = cleanString(record.back, CARD_HTML_MAX_LENGTH);
  if (front === undefined || back === undefined) return undefined;
  const fields = Array.isArray(record.fields)
    ? record.fields
        .flatMap((field) =>
          field &&
          typeof field === "object" &&
          typeof field.name === "string" &&
          typeof field.value === "string"
            ? [
                {
                  name: field.name.slice(0, 200),
                  value: field.value.slice(0, CARD_HTML_MAX_LENGTH),
                },
              ]
            : []
        )
        .slice(0, CARD_FIELD_MAX_COUNT)
    : [];
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 64)
    : [];
  const notetype = cleanString(record.notetype, 200);
  const guid = cleanString(record.guid, 64);
  const mediaScope = cleanString(record.mediaScope, 64);
  const styleId = cleanString(record.styleId, 64);
  return {
    front,
    back,
    fields,
    ...(tags.length ? { tags } : {}),
    ...(notetype ? { notetype } : {}),
    ...(guid ? { guid } : {}),
    ...(mediaScope ? { mediaScope } : {}),
    ...(styleId ? { styleId } : {}),
  };
}

export function createDefaultDictionaryDeck(now: number = Date.now()): DictionaryDeck {
  return { id: DEFAULT_DICTIONARY_DECK_ID, name: "", createdAt: 0, updatedAt: now };
}

export function normalizeDictionaryDeckName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, DICTIONARY_DECK_NAME_MAX_LENGTH);
}

export function sanitizeDictionaryDeck(
  value: unknown,
  id: string,
  now: number = Date.now()
): DictionaryDeck | null {
  if (!id || !value || typeof value !== "object") return null;
  const record = value as Partial<DictionaryDeck>;
  if (typeof record.name !== "string") return null;
  const name = normalizeDictionaryDeckName(record.name);
  if (!name && id !== DEFAULT_DICTIONARY_DECK_ID) return null;
  const styles =
    record.styles && typeof record.styles === "object"
      ? Object.fromEntries(
          Object.entries(record.styles)
            .filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" && entry[0].length <= 64
            )
            .slice(0, DECK_STYLE_MAX_COUNT)
            .map(([key, css]) => [key, css.slice(0, DECK_STYLE_MAX_LENGTH)])
        )
      : {};
  return {
    id,
    name,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : now,
    ...(typeof record.ankiDeckId === "string" && record.ankiDeckId
      ? { ankiDeckId: record.ankiDeckId.slice(0, 32) }
      : {}),
    ...(Object.keys(styles).length ? { styles } : {}),
  };
}

/** Default deck first, then by name. Always includes the default deck. */
export function normalizeDictionaryDecks(decks: readonly DictionaryDeck[]): DictionaryDeck[] {
  const byId = new Map<string, DictionaryDeck>();
  for (const deck of decks) byId.set(deck.id, deck);
  const defaultDeck = byId.get(DEFAULT_DICTIONARY_DECK_ID) ?? createDefaultDictionaryDeck();
  byId.delete(DEFAULT_DICTIONARY_DECK_ID);
  return [
    defaultDeck,
    ...Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    ),
  ];
}

export function resolveFavoriteDeckId(
  favorite: Pick<DictionaryFavorite, "deckId">,
  deckIds: ReadonlySet<string>
): string {
  return favorite.deckId && deckIds.has(favorite.deckId)
    ? favorite.deckId
    : DEFAULT_DICTIONARY_DECK_ID;
}

/** Deck ids covered by `deckId`: itself plus "Name::…" subdecks, like Anki. */
export function collectDeckWithSubdecks(
  decks: readonly DictionaryDeck[],
  deckId: string
): Set<string> {
  const ids = new Set([deckId]);
  const deck = decks.find((candidate) => candidate.id === deckId);
  if (deck?.name) {
    const prefix = `${deck.name}::`;
    for (const candidate of decks) {
      if (candidate.name.startsWith(prefix)) ids.add(candidate.id);
    }
  }
  return ids;
}

/** Favorites in `deckId` (and its subdecks), or every favorite when null. */
export function filterFavoritesByDeck(
  favorites: readonly DictionaryFavorite[],
  decks: readonly DictionaryDeck[],
  deckId: string | null
): DictionaryFavorite[] {
  if (deckId === null) return [...favorites];
  const deckIds = new Set(decks.map((deck) => deck.id));
  const included = collectDeckWithSubdecks(decks, deckId);
  return favorites.filter((fav) => included.has(resolveFavoriteDeckId(fav, deckIds)));
}

function createDeckId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `deck-${random}`;
}

export interface DictionaryImportBundle {
  decks: DictionaryDeck[];
  favorites: DictionaryFavorite[];
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
  decks: DictionaryDeck[];
  /** Deck shown in Favorites / studied in Flashcards; null = all decks. */
  selectedDeckId: string | null;

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
  addFavorite: (entry: DictionaryEntry, deckId?: string) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (entry: DictionaryEntry) => void;
  reviewFavorite: (id: string, grade: SrsGrade, now?: number) => void;
  resetFavoriteProgress: (id?: string) => void;
  /** Replace favorites with merged cloud-sync data (no tombstones). */
  replaceFavoritesFromSync: (favorites: DictionaryFavorite[]) => void;
  setSelectedDeckId: (deckId: string | null) => void;
  createDeck: (name: string) => DictionaryDeck | null;
  renameDeck: (deckId: string, name: string) => void;
  /** Deletes the deck and every card in it. The default deck can't be deleted. */
  deleteDeck: (deckId: string) => void;
  moveFavoritesToDeck: (ids: readonly string[], deckId: string) => void;
  /** Upsert imported decks + cards (re-imports overwrite matching ids). */
  importBundle: (bundle: DictionaryImportBundle) => void;
  replaceDecksFromSync: (decks: DictionaryDeck[]) => void;
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
      decks: [createDefaultDictionaryDeck()],
      selectedDeckId: null,

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

      addFavorite: (entry, deckId) => {
        if (get().isFavorite(entry.id)) return;
        const now = Date.now();
        const { decks, selectedDeckId } = get();
        const target = deckId ?? selectedDeckId ?? DEFAULT_DICTIONARY_DECK_ID;
        const resolvedDeckId = decks.some((deck) => deck.id === target)
          ? target
          : DEFAULT_DICTIONARY_DECK_ID;
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
              deckId: resolvedDeckId,
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

      setSelectedDeckId: (selectedDeckId) => set({ selectedDeckId }),

      createDeck: (rawName) => {
        const name = normalizeDictionaryDeckName(rawName);
        if (!name) return null;
        const now = Date.now();
        const deck: DictionaryDeck = { id: createDeckId(), name, createdAt: now, updatedAt: now };
        useCloudSyncStore.getState().clearDeletedKeys("dictionaryDeckIds", [deck.id]);
        set((state) => ({
          decks: normalizeDictionaryDecks([...state.decks, deck]),
          selectedDeckId: deck.id,
        }));
        return deck;
      },

      renameDeck: (deckId, rawName) => {
        const name = normalizeDictionaryDeckName(rawName);
        if (!name && deckId !== DEFAULT_DICTIONARY_DECK_ID) return;
        const now = Date.now();
        set((state) => ({
          decks: normalizeDictionaryDecks(
            state.decks.map((deck) =>
              deck.id === deckId ? { ...deck, name, updatedAt: now } : deck
            )
          ),
        }));
      },

      deleteDeck: (deckId) => {
        if (deckId === DEFAULT_DICTIONARY_DECK_ID) return;
        const { decks, favorites } = get();
        if (!decks.some((deck) => deck.id === deckId)) return;
        const deckIds = new Set(decks.map((deck) => deck.id));
        const removedIds = favorites
          .filter((fav) => resolveFavoriteDeckId(fav, deckIds) === deckId)
          .map((fav) => fav.id);
        const removed = new Set(removedIds);
        const cloudSync = useCloudSyncStore.getState();
        cloudSync.markDeletedKeys("dictionaryDeckIds", [deckId]);
        if (removedIds.length) cloudSync.markDeletedKeys("dictionaryFavoriteIds", removedIds);
        set((state) => ({
          decks: state.decks.filter((deck) => deck.id !== deckId),
          favorites: state.favorites.filter((fav) => !removed.has(fav.id)),
          selectedDeckId: state.selectedDeckId === deckId ? null : state.selectedDeckId,
        }));
      },

      moveFavoritesToDeck: (ids, deckId) => {
        if (!get().decks.some((deck) => deck.id === deckId)) return;
        const moving = new Set(ids);
        const now = Date.now();
        set((state) => ({
          favorites: state.favorites.map((fav) =>
            moving.has(fav.id) && fav.deckId !== deckId
              ? { ...fav, deckId, updatedAt: now }
              : fav
          ),
        }));
      },

      importBundle: ({ decks, favorites }) => {
        if (!decks.length && !favorites.length) return;
        const cloudSync = useCloudSyncStore.getState();
        cloudSync.clearDeletedKeys(
          "dictionaryDeckIds",
          decks.map((deck) => deck.id)
        );
        cloudSync.clearDeletedKeys(
          "dictionaryFavoriteIds",
          favorites.map((fav) => fav.id)
        );
        set((state) => {
          const deckById = new Map(state.decks.map((deck) => [deck.id, deck]));
          for (const deck of decks) deckById.set(deck.id, deck);
          const incoming = new Map(favorites.map((fav) => [fav.id, fav]));
          const kept = state.favorites.filter((fav) => !incoming.has(fav.id));
          return {
            decks: normalizeDictionaryDecks(Array.from(deckById.values())),
            favorites: [...incoming.values(), ...kept],
          };
        });
      },

      replaceDecksFromSync: (decks) =>
        set((state) => {
          const next = normalizeDictionaryDecks(decks);
          const stillExists =
            state.selectedDeckId === null ||
            next.some((deck) => deck.id === state.selectedDeckId);
          return {
            decks: next,
            ...(stillExists ? {} : { selectedDeckId: null }),
          };
        }),
    }),
    {
      name: STORAGE_KEYS.dictionary,
      version: STORE_VERSION,
      // Imported Anki collections can outgrow localStorage; the adapter moves
      // the existing localStorage snapshot over on first read.
      storage: createIndexedDBPersistStorage(),
      partialize: (state) => ({
        view: state.view,
        queryLanguage: state.queryLanguage,
        chineseScript: state.chineseScript,
        phonetics: state.phonetics,
        isSidebarVisible: state.isSidebarVisible,
        aiExtrasEnabled: state.aiExtrasEnabled,
        history: state.history,
        favorites: state.favorites,
        decks: state.decks,
        selectedDeckId: state.selectedDeckId,
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<DictionaryStoreState>;
        let next = state;
        if (version < 2) {
          next = { ...next, chineseScript: "traditional" as const };
        }
        if (version < 3) {
          next = {
            ...next,
            decks: [createDefaultDictionaryDeck()],
            selectedDeckId: null,
            favorites: (next.favorites ?? []).map((fav) => ({
              ...fav,
              deckId: DEFAULT_DICTIONARY_DECK_ID,
            })),
          };
        }
        return next;
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
          decks: Array.isArray(p.decks)
            ? normalizeDictionaryDecks(
                p.decks.flatMap((deck) => {
                  const clean = sanitizeDictionaryDeck(deck, deck?.id);
                  return clean ? [clean] : [];
                })
              )
            : current.decks,
          selectedDeckId:
            typeof p.selectedDeckId === "string" ? p.selectedDeckId : null,
        };
      },
    }
  )
);
