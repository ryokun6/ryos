#!/usr/bin/env bun
import "../../helpers/local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  createDefaultDictionaryDeck,
  DEFAULT_DICTIONARY_DECK_ID,
  filterFavoritesByDeck,
  sanitizeDictionaryCardContent,
  sanitizeDictionaryFavorite,
  snapshotDictionaryEntry,
  useDictionaryStore,
  type DictionaryDeck,
} from "../../../src/stores/useDictionaryStore";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import { DELETION_BUCKET_PREFIXES, SYNC_CODECS } from "../../../src/sync/codecs";
import type { DictionaryEntry } from "../../../src/shared/dictionary";

const t = "01718180000000-0000-test";

const entry: DictionaryEntry = {
  id: "cc-cedict:學習:xue2_xi2",
  lang: "zh",
  headword: "学习",
  traditional: "學習",
  simplified: "学习",
  reading: "xue2 xi2",
  senses: [
    {
      glosses: ["to learn", "to study", "a", "b", "c", "d", "e"],
      notes: ["CL:個|个[ge4]"],
      synonyms: ["读书"],
      examples: [{ text: "一" }, { text: "二" }, { text: "三" }],
    },
    { glosses: ["2"] },
    { glosses: ["3"] },
    { glosses: ["4"] },
    { glosses: ["5"] },
  ],
  kanji: [{ literal: "学", meanings: [], onyomi: [], kunyomi: [] }],
  source: "cc-cedict",
};

describe("favorite snapshots", () => {
  test("keep only what flashcards need", () => {
    const snapshot = snapshotDictionaryEntry(entry);
    expect(snapshot.senses).toHaveLength(4);
    expect(snapshot.senses[0]).toEqual({
      glosses: ["to learn", "to study", "a", "b", "c", "d"],
      examples: [{ text: "一" }, { text: "二" }],
    });
    expect(snapshot.kanji).toBeUndefined();
    expect(snapshot).toMatchObject({ traditional: "學習", reading: "xue2 xi2" });
  });

  test("sanitize rejects malformed synced docs and repairs SRS state", () => {
    expect(sanitizeDictionaryFavorite(null, "x")).toBeNull();
    expect(sanitizeDictionaryFavorite({ entry: { headword: "x", lang: "fr", senses: [] } }, "x")).toBeNull();
    const favorite = sanitizeDictionaryFavorite(
      { entry: { ...entry, id: "other" }, addedAt: 5, srs: { ease: "bad" } },
      entry.id,
      100
    );
    expect(favorite).toMatchObject({
      id: entry.id,
      headword: "学习",
      lang: "zh",
      addedAt: 5,
      updatedAt: 100,
      srs: { ease: 2.5, repetitions: 0, dueAt: 100 },
    });
    expect(favorite?.entry.id).toBe(entry.id);
  });
});

describe("dictionary store", () => {
  test("defaults Chinese script to traditional", () => {
    expect(useDictionaryStore.getState().chineseScript).toBe("traditional");
  });

  beforeEach(() => {
    useDictionaryStore.setState({ favorites: [], history: [] });
    useCloudSyncStore.setState((state) => ({
      deletionMarkers: { ...state.deletionMarkers, dictionaryFavoriteIds: {} },
    }));
  });

  test("history dedupes and keeps the most recent first", () => {
    const { recordHistory } = useDictionaryStore.getState();
    recordHistory("学习", "auto");
    recordHistory("happy", "en");
    recordHistory(" 学习 ", "zh");
    expect(useDictionaryStore.getState().history.map((h) => [h.query, h.lang])).toEqual([
      ["学习", "zh"],
      ["happy", "en"],
    ]);
  });

  test("toggling favorites records sync tombstones", () => {
    const store = useDictionaryStore.getState();
    store.toggleFavorite(entry);
    expect(useDictionaryStore.getState().isFavorite(entry.id)).toBe(true);
    store.toggleFavorite(entry);
    expect(useDictionaryStore.getState().favorites).toEqual([]);
    expect(
      Object.keys(useCloudSyncStore.getState().deletionMarkers.dictionaryFavoriteIds)
    ).toEqual([entry.id]);
    store.addFavorite(entry);
    expect(useCloudSyncStore.getState().deletionMarkers.dictionaryFavoriteIds).toEqual({});
  });

  test("reviews update SRS state and can be reset", () => {
    const store = useDictionaryStore.getState();
    store.addFavorite(entry);
    store.reviewFavorite(entry.id, "good", 1_000);
    expect(useDictionaryStore.getState().favorites[0].srs).toMatchObject({
      repetitions: 1,
      interval: 1,
      lastReviewedAt: 1_000,
    });
    store.resetFavoriteProgress(entry.id);
    const srs = useDictionaryStore.getState().favorites[0].srs;
    expect(srs.repetitions).toBe(0);
    expect(srs.lastReviewedAt).toBeUndefined();
  });
});

describe("dictionary sync codec", () => {
  beforeEach(() => {
    useDictionaryStore.setState({ favorites: [] });
  });

  test("collects one doc per deck and per favorite", () => {
    useDictionaryStore.setState({ decks: [createDefaultDictionaryDeck(1)] });
    useDictionaryStore.getState().addFavorite(entry);
    const docs = SYNC_CODECS.dictionary.collect({}) as Map<string, unknown>;
    expect(Array.from(docs.keys())).toEqual([
      "dictionary/deck:default",
      `dictionary/favorite:${entry.id}`,
    ]);
    expect(DELETION_BUCKET_PREFIXES.dictionaryFavoriteIds).toBe("dictionary/favorite:");
    expect(DELETION_BUCKET_PREFIXES.dictionaryDeckIds).toBe("dictionary/deck:");
  });

  test("applies remote deck upserts and deletes", async () => {
    useDictionaryStore.setState({
      decks: [createDefaultDictionaryDeck(1), { id: "gone", name: "Gone", createdAt: 1, updatedAt: 1 }],
      selectedDeckId: "gone",
    });
    await SYNC_CODECS.dictionary.apply(
      [
        { k: "dictionary/deck:gone", del: true, t },
        { k: "dictionary/deck:hsk", v: { name: "  HSK  ", createdAt: 2 }, t },
        { k: "dictionary/deck:bad", v: "nope", t },
      ],
      {}
    );
    const { decks, selectedDeckId } = useDictionaryStore.getState();
    expect(decks.map((deck) => [deck.id, deck.name])).toEqual([
      ["default", ""],
      ["hsk", "HSK"],
    ]);
    expect(selectedDeckId).toBeNull();
  });

  test("applies remote upserts and deletes", async () => {
    useDictionaryStore.getState().addFavorite(entry);
    const remote = {
      ...sanitizeDictionaryFavorite({ entry: { ...entry, id: "ko", lang: "ko", headword: "사랑" } }, "ko")!,
      addedAt: Date.now() + 10,
    };
    await SYNC_CODECS.dictionary.apply(
      [
        { k: "dictionary/favorite:ko", v: remote, t },
        { k: `dictionary/favorite:${entry.id}`, del: true, t },
        { k: "other/key", v: {}, t },
      ],
      {}
    );
    expect(useDictionaryStore.getState().favorites.map((fav) => fav.headword)).toEqual(["사랑"]);
  });
});

describe("dictionary decks", () => {
  const deck = (id: string, name: string): DictionaryDeck => ({
    id,
    name,
    createdAt: 1,
    updatedAt: 1,
  });

  beforeEach(() => {
    useDictionaryStore.setState({
      favorites: [],
      decks: [createDefaultDictionaryDeck(1)],
      selectedDeckId: null,
    });
    useCloudSyncStore.setState((state) => ({
      deletionMarkers: {
        ...state.deletionMarkers,
        dictionaryFavoriteIds: {},
        dictionaryDeckIds: {},
      },
    }));
  });

  test("v2 persisted favorites migrate into the default deck", () => {
    const migrate = useDictionaryStore.persist.getOptions().migrate!;
    const migrated = migrate(
      { favorites: [{ id: "a", entry }], chineseScript: "simplified" },
      2
    ) as { favorites: { deckId?: string }[]; decks: DictionaryDeck[]; selectedDeckId: unknown };
    expect(migrated.favorites[0].deckId).toBe(DEFAULT_DICTIONARY_DECK_ID);
    expect(migrated.decks.map((d) => d.id)).toEqual([DEFAULT_DICTIONARY_DECK_ID]);
    expect(migrated.selectedDeckId).toBeNull();
  });

  test("create, rename, and pick decks; new favorites land in the selected deck", () => {
    const store = useDictionaryStore.getState();
    expect(store.createDeck("   ")).toBeNull();
    const created = store.createDeck("  Japanese   N5 ")!;
    expect(created.name).toBe("Japanese N5");
    expect(useDictionaryStore.getState().selectedDeckId).toBe(created.id);
    store.addFavorite(entry);
    expect(useDictionaryStore.getState().favorites[0].deckId).toBe(created.id);
    store.renameDeck(created.id, "N5");
    expect(useDictionaryStore.getState().decks.map((d) => d.name)).toEqual(["", "N5"]);
    store.addFavorite({ ...entry, id: "x" }, DEFAULT_DICTIONARY_DECK_ID);
    expect(useDictionaryStore.getState().favorites.find((f) => f.id === "x")?.deckId).toBe(
      DEFAULT_DICTIONARY_DECK_ID
    );
  });

  test("deleting a deck removes only its own cards and records tombstones", () => {
    useDictionaryStore.setState({
      decks: [createDefaultDictionaryDeck(1), deck("p", "Lang"), deck("c", "Lang::Kanji")],
      selectedDeckId: "p",
    });
    const store = useDictionaryStore.getState();
    store.addFavorite({ ...entry, id: "in-parent" }, "p");
    store.addFavorite({ ...entry, id: "in-child" }, "c");
    store.deleteDeck(DEFAULT_DICTIONARY_DECK_ID);
    expect(useDictionaryStore.getState().decks).toHaveLength(3);
    store.deleteDeck("p");
    const state = useDictionaryStore.getState();
    expect(state.decks.map((d) => d.id)).toEqual(["default", "c"]);
    expect(state.favorites.map((f) => f.id)).toEqual(["in-child"]);
    expect(state.selectedDeckId).toBeNull();
    const markers = useCloudSyncStore.getState().deletionMarkers;
    expect(Object.keys(markers.dictionaryDeckIds)).toEqual(["p"]);
    expect(Object.keys(markers.dictionaryFavoriteIds)).toEqual(["in-parent"]);
  });

  test("deck filters include subdecks and fall back to default for orphaned cards", () => {
    const decks = [createDefaultDictionaryDeck(1), deck("p", "Lang"), deck("c", "Lang::Kanji"), deck("o", "Language")];
    const favorites = [
      { id: "1", deckId: "p" },
      { id: "2", deckId: "c" },
      { id: "3", deckId: "o" },
      { id: "4", deckId: "missing" },
      { id: "5" },
    ].map((f) => ({ ...sanitizeDictionaryFavorite({ entry }, f.id)!, ...f }));
    const ids = (deckId: string | null) =>
      filterFavoritesByDeck(favorites, decks, deckId).map((f) => f.id);
    expect(ids("p")).toEqual(["1", "2"]);
    expect(ids("c")).toEqual(["2"]);
    expect(ids("default")).toEqual(["4", "5"]);
    expect(ids(null)).toHaveLength(5);
  });

  test("moving cards and importing bundles", () => {
    useDictionaryStore.setState({ decks: [createDefaultDictionaryDeck(1), deck("d", "D")] });
    const store = useDictionaryStore.getState();
    store.addFavorite(entry);
    store.moveFavoritesToDeck([entry.id], "nope");
    expect(useDictionaryStore.getState().favorites[0].deckId).toBe(DEFAULT_DICTIONARY_DECK_ID);
    store.moveFavoritesToDeck([entry.id], "d");
    expect(useDictionaryStore.getState().favorites[0].deckId).toBe("d");

    useCloudSyncStore.getState().markDeletedKeys("dictionaryFavoriteIds", ["anki:g:0"]);
    const imported = { ...sanitizeDictionaryFavorite({ entry }, "anki:g:0")!, deckId: "anki-9" };
    store.importBundle({ decks: [deck("anki-9", "Imported")], favorites: [imported] });
    const state = useDictionaryStore.getState();
    expect(state.decks.map((d) => d.id)).toEqual(["default", "d", "anki-9"]);
    expect(state.favorites.map((f) => f.id)).toEqual(["anki:g:0", entry.id]);
    expect(useCloudSyncStore.getState().deletionMarkers.dictionaryFavoriteIds).toEqual({});
  });

  test("card content is sanitized and bounded", () => {
    expect(sanitizeDictionaryCardContent({ front: 1 })).toBeUndefined();
    const card = sanitizeDictionaryCardContent({
      front: "<b>Q</b>",
      back: "A",
      fields: [{ name: "Front", value: "Q" }, { name: 3 }, ...Array(40).fill({ name: "x", value: "" })],
      tags: ["a", 2, "b"],
    });
    expect(card?.front).toBe("<b>Q</b>");
    expect(card?.fields.length).toBeLessThanOrEqual(32);
    expect(card?.fields[0]).toEqual({ name: "Front", value: "Q" });
    expect(card?.tags).toEqual(["a", "b"]);
  });
});
