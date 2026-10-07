#!/usr/bin/env bun
import "../../helpers/local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  sanitizeDictionaryFavorite,
  snapshotDictionaryEntry,
  useDictionaryStore,
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

  test("collects one doc per favorite", () => {
    useDictionaryStore.getState().addFavorite(entry);
    const docs = SYNC_CODECS.dictionary.collect({}) as Map<string, unknown>;
    expect(Array.from(docs.keys())).toEqual([`dictionary/favorite:${entry.id}`]);
    expect(DELETION_BUCKET_PREFIXES.dictionaryFavoriteIds).toBe("dictionary/favorite:");
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
