#!/usr/bin/env bun
import "../../helpers/local-storage-stub";
import { beforeAll, describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import {
  buildLegacyApkg,
  buildModernColpkg,
  encodeProto,
  FIXTURE_CRT,
  IMAGE_BYTES,
  SOUND_BYTES,
  zstdRawFrame,
} from "../../helpers/anki-fixtures";
import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";
import {
  answerOnlyHtml,
  clozeNumbers,
  extractMediaRefs,
  renderAnkiCard,
  renderAnkiTemplate,
  stripAnkiHtml,
} from "../../../src/apps/dictionary/utils/anki/template";
import {
  decodeProto,
  maybeZstd,
  parseAnkiMediaMap,
  protoString,
} from "../../../src/apps/dictionary/utils/anki/protobuf";
import { AnkiZipError, openZip } from "../../../src/apps/dictionary/utils/anki/zip";
import { formatAnkiDeckName } from "../../../src/apps/dictionary/utils/anki/collection";
import {
  AnkiImportError,
  importAnkiPackage,
  mapAnkiScheduling,
  type AnkiImportProgress,
} from "../../../src/apps/dictionary/utils/anki/import";
import { exportAnkiPackage } from "../../../src/apps/dictionary/utils/anki/export";
import {
  cardSideSounds,
  isRelativeMediaSrc,
  replaceSoundTags,
  sanitizeCardCss,
} from "../../../src/apps/dictionary/utils/anki/cardHtml";
import {
  getDictionaryMediaBytes,
  pruneDictionaryMedia,
  putDictionaryMediaBatch,
} from "../../../src/apps/dictionary/utils/anki/media";
import { DAY_MS, createSrsCard } from "../../../src/apps/dictionary/utils/srs";
import {
  createDefaultDictionaryDeck,
  sanitizeDictionaryFavorite,
} from "../../../src/stores/useDictionaryStore";

let SQL: SqlJsStatic;
const NOW = (FIXTURE_CRT + 25 * 86_400) * 1000;

beforeAll(async () => {
  SQL = await initSqlJs();
});

describe("Anki template rendering", () => {
  const ctx = (fields: Record<string, string>, ord = 0) => ({
    fields,
    ord,
    tags: ["jp", "n5"],
    deckName: "Lang::Vocab",
    notetypeName: "Basic",
    cardName: "Card 1",
  });

  test("fields, sections, FrontSide, and special fields", () => {
    const { question, answer } = renderAnkiCard(
      "{{Front}}{{#Extra}}<i>{{Extra}}</i>{{/Extra}}{{^Extra}}none{{/Extra}}{{! comment }}",
      "{{FrontSide}}<hr id=answer>{{Back}} {{Tags}} {{Deck}} {{Subdeck}} {{Type}} {{Card}} {{Missing}}",
      ctx({ Front: "犬", Back: "dog", Extra: "" })
    );
    expect(question).toBe("犬none");
    expect(answer).toBe("犬none<hr id=answer>dog jp n5 Lang::Vocab Vocab Basic Card 1 ");
    expect(answerOnlyHtml(answer)).toBe("dog jp n5 Lang::Vocab Vocab Basic Card 1 ");
    expect(renderAnkiTemplate("{{#Img}}y{{/Img}}", ctx({ Img: '<img src="a.png">' }), "question")).toBe("y");
    // Mismatched closer unwinds to the matching opener.
    expect(renderAnkiTemplate("{{#A}}{{#B}}x{{/A}}z", ctx({ A: "1", B: "1" }), "question")).toBe("xz");
  });

  test("cloze, hint, type, text, and furigana filters", () => {
    const text = "{{c1::Paris}} is in {{c2::France::country}}";
    expect(clozeNumbers(text)).toEqual([1, 2]);
    expect(renderAnkiTemplate("{{cloze:Text}}", ctx({ Text: text }, 1), "question")).toBe(
      'Paris is in <span class="cloze">[country]</span>'
    );
    expect(renderAnkiTemplate("{{cloze:Text}}", ctx({ Text: text }, 0), "answer")).toBe(
      '<span class="cloze">Paris</span> is in France'
    );
    expect(renderAnkiTemplate("{{hint:H}}", ctx({ H: "x" }), "question")).toContain("<summary>H</summary>x");
    expect(renderAnkiTemplate("{{type:W}}", ctx({ W: "x" }), "question")).toBe("");
    expect(renderAnkiTemplate("{{text:W}}", ctx({ W: "<b>a&amp;b</b>" }), "question")).toBe("a&b");
    const reading = ctx({ R: "日本[にほん] 語[ご]" });
    expect(renderAnkiTemplate("{{furigana:R}}", reading, "question")).toBe(
      "<ruby><rb>日本</rb><rt>にほん</rt></ruby><ruby><rb>語</rb><rt>ご</rt></ruby>"
    );
    expect(renderAnkiTemplate("{{kana:R}}", reading, "question")).toBe("にほんご");
    expect(renderAnkiTemplate("{{kanji:R}}", reading, "question")).toBe("日本語");
  });

  test("HTML stripping and media references", () => {
    expect(stripAnkiHtml("<div>a&nbsp;b</div><br>c [sound:x.mp3]<style>p{}</style>")).toBe("a b\nc");
    expect(stripAnkiHtml("x<scr<script>ipt>alert(1)</script>y")).not.toContain("<");
    expect(stripAnkiHtml("<<b>i>mg src=x onerror=1> a &lt; b <script")).toBe("i>mg src=x onerror=1> a < b script");
    expect(
      extractMediaRefs('[sound:a.mp3] <img src="b.png"> <img src=\'https://x/c.png\'> <img src=d&amp;e.jpg>')
    ).toEqual(["a.mp3", "b.png", "d&e.jpg"]);
  });
});

describe("Anki containers", () => {
  test("zstd frames decode, including multi-block payloads", () => {
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    expect(maybeZstd(zstdRawFrame(big))).toEqual(big);
    const plain = new Uint8Array([1, 2, 3]);
    expect(maybeZstd(plain)).toBe(plain);
  });

  test("media maps: legacy JSON and zstd protobuf", () => {
    expect(parseAnkiMediaMap(new TextEncoder().encode('{"0":"a.mp3","1":"b.png"}'))).toEqual(
      new Map([
        ["0", "a.mp3"],
        ["1", "b.png"],
      ])
    );
    const proto = encodeProto([
      [1, encodeProto([[1, "x.mp3"], [2, 10]])],
      [1, encodeProto([[1, "y.ogg"]])],
    ]);
    expect(parseAnkiMediaMap(zstdRawFrame(proto))).toEqual(
      new Map([
        ["0", "x.mp3"],
        ["1", "y.ogg"],
      ])
    );
    expect(parseAnkiMediaMap(null).size).toBe(0);
    expect(protoString(decodeProto(encodeProto([[3, "css"]])), 3)).toBe("css");
  });

  test("zip reader handles stored and deflated members", () => {
    const zip = openZip(
      zipSync({
        stored: [new Uint8Array([9, 8, 7]), { level: 0 }],
        deflated: [new TextEncoder().encode("hello ".repeat(100)), { level: 9 }],
      })
    );
    expect(zip.has("stored")).toBe(true);
    expect(zip.read("stored")).toEqual(new Uint8Array([9, 8, 7]));
    expect(new TextDecoder().decode(zip.read("deflated")!)).toBe("hello ".repeat(100));
    expect(zip.read("missing")).toBeNull();
    expect(() => openZip(new Uint8Array([1, 2, 3, 4]))).toThrow(AnkiZipError);
  });

  test("deck names join hierarchy and decode entities", () => {
    expect(formatAnkiDeckName("A\x1fB &amp; C")).toBe("A::B & C");
    expect(formatAnkiDeckName(" A :: B ")).toBe("A::B");
  });
});

describe("Anki scheduling → SM-2", () => {
  const base = { type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0 };

  test("new cards stay new; suspended flag carries over", () => {
    expect(mapAnkiScheduling(base, FIXTURE_CRT, NOW)).toEqual({
      srs: createSrsCard(NOW),
      suspended: false,
    });
    expect(mapAnkiScheduling({ ...base, queue: -1 }, FIXTURE_CRT, NOW).suspended).toBe(true);
  });

  test("review cards keep ease, interval, lapses, and due day", () => {
    const { srs } = mapAnkiScheduling(
      { ...base, type: 2, queue: 2, due: 30, ivl: 12, factor: 1100, reps: 1, lapses: 2 },
      FIXTURE_CRT,
      NOW,
      123
    );
    expect(srs).toEqual({
      ease: 1.3,
      interval: 12,
      repetitions: 2,
      lapses: 2,
      dueAt: FIXTURE_CRT * 1000 + 30 * DAY_MS,
      lastReviewedAt: 123,
    });
  });

  test("learning cards use epoch-second due dates and interval 0", () => {
    const { srs } = mapAnkiScheduling(
      { ...base, type: 1, queue: 1, due: FIXTURE_CRT + 600, factor: 2500, reps: 1 },
      FIXTURE_CRT,
      NOW
    );
    expect(srs).toMatchObject({ interval: 0, repetitions: 0, ease: 2.5, dueAt: (FIXTURE_CRT + 600) * 1000 });
  });
});

describe("Anki import", () => {
  test("legacy .apkg: decks, fields, cloze cards, scheduling, styles, media", async () => {
    const stored = new Map<string, Uint8Array>();
    const phases = new Set<AnkiImportProgress["phase"]>();
    const result = await importAnkiPackage(buildLegacyApkg(SQL), {
      SQL,
      now: NOW,
      storeMedia: async (batch) => {
        for (const record of batch) stored.set(record.key, record.data);
      },
      onProgress: (progress) => phases.add(progress.phase),
      mediaBatchSize: 1,
    });
    expect(result.schema).toBe(11);
    expect(result.skippedCards).toBe(0);
    expect([...phases]).toEqual(["reading", "cards", "media"]);
    expect(result.decks.map((deck) => [deck.id, deck.name, deck.ankiDeckId])).toEqual([
      ["anki-10", "Lang", "10"],
      ["anki-11", "Lang::Vocab", "11"],
    ]);
    expect(result.decks[0].styles).toEqual({ "100": ".card { color: black; }" });

    const [basic, cloze1, cloze2] = result.favorites;
    expect(basic.id).toBe("anki:basicGuid:0");
    expect(basic.headword).toBe("猫");
    expect(basic.lang).toBe("zh");
    expect(basic.entry.senses[0].glosses).toEqual(["cat", "feline"]);
    expect(basic.card?.fields.map((f) => f.name)).toEqual(["Front", "Back", "Audio"]);
    expect(basic.card?.tags).toEqual(["vocab", "jp"]);
    expect(basic.card?.front).toContain("[sound:neko.mp3]");
    expect(basic.card?.mediaScope).toBe(`anki-${FIXTURE_CRT}`);
    expect(basic.srs).toMatchObject({
      interval: 12,
      ease: 2.3,
      lapses: 1,
      repetitions: 5,
      dueAt: FIXTURE_CRT * 1000 + 30 * DAY_MS,
      lastReviewedAt: (FIXTURE_CRT + 20 * 86_400) * 1000,
    });

    expect(cloze1.id).toBe("anki:clozeGuid:0");
    expect(cloze1.headword).toBe("[...] is in France");
    expect(cloze1.srs).toEqual(createSrsCard(NOW));
    expect(cloze2.card?.front).toContain("[country]");
    expect(cloze2.suspended).toBe(true);
    expect(cloze2.deckId).toBe("anki-11");

    expect(result.missingMedia).toEqual([]);
    expect(result.mediaStored).toBe(2);
    expect(stored.get(`anki-${FIXTURE_CRT}/neko.mp3`)).toEqual(SOUND_BYTES);
    expect(stored.get(`anki-${FIXTURE_CRT}/neko.png`)).toEqual(IMAGE_BYTES);
    expect([...stored.keys()].some((key) => key.endsWith("unused.jpg"))).toBe(false);
  });

  test("anki21b .colpkg: zstd collection, protobuf configs, filtered decks, zstd media", async () => {
    const stored = new Map<string, Uint8Array>();
    const result = await importAnkiPackage(buildModernColpkg(SQL), {
      SQL,
      now: NOW,
      storeMedia: async (batch) => {
        for (const record of batch) stored.set(record.filename, record.data);
      },
    });
    expect(result.schema).toBe(18);
    expect(result.decks.map((deck) => [deck.id, deck.name])).toEqual([["anki-20", "Pron::A & B"]]);
    expect(result.decks[0].styles).toEqual({ "300": ".card { font-size: 30px; }" });
    const [card] = result.favorites;
    expect(card.headword).toBe("été");
    expect(card.entry.senses[0].glosses).toEqual(["été: summer"]);
    expect(card.card?.notetype).toBe("Pronunciation");
    expect(card.srs.dueAt).toBe(FIXTURE_CRT * 1000 + 40 * DAY_MS);
    expect(stored.get("ete.mp3")).toEqual(SOUND_BYTES);
  });

  test("reports missing media and rejects packages without a collection", async () => {
    const legacy = openZip(buildLegacyApkg(SQL));
    const withoutMedia = zipSync({ "collection.anki2": legacy.read("collection.anki2")! });
    const result = await importAnkiPackage(withoutMedia, { SQL, now: NOW });
    expect(result.missingMedia.sort()).toEqual(["neko.mp3", "neko.png"]);
    expect(result.mediaStored).toBe(0);
    await expect(importAnkiPackage(zipSync({ x: new Uint8Array([1]) }), { SQL })).rejects.toThrow(
      AnkiImportError
    );
  });
});

describe("Anki export", () => {
  test("round-trips decks, scheduling, suspension, and media through .apkg", async () => {
    const imported = await importAnkiPackage(buildLegacyApkg(SQL), {
      SQL,
      now: NOW,
      storeMedia: async () => {},
    });
    const word = {
      ...sanitizeDictionaryFavorite(
        {
          entry: {
            id: "w",
            lang: "en",
            headword: "apple",
            ipa: "/ˈæp.əl/",
            senses: [{ partOfSpeech: "noun", glosses: ["a fruit"], examples: [{ text: "An <apple>" }] }],
            source: "free-dictionary",
          },
          addedAt: 1,
        },
        "w",
        NOW
      )!,
      deckId: "default",
    };
    const media = new Map([[`anki-${FIXTURE_CRT}/neko.mp3`, SOUND_BYTES]]);
    const exported = await exportAnkiPackage({
      SQL,
      decks: [createDefaultDictionaryDeck(1), ...imported.decks],
      favorites: [word, ...imported.favorites],
      defaultDeckName: "Dictionary",
      loadMedia: async (key) => media.get(key) ?? null,
      now: NOW,
    });
    expect(exported.noteCount).toBe(4);
    expect(exported.mediaCount).toBe(1);

    const stored = new Map<string, Uint8Array>();
    const again = await importAnkiPackage(exported.data, {
      SQL,
      now: NOW,
      storeMedia: async (batch) => {
        for (const record of batch) stored.set(record.filename, record.data);
      },
    });
    expect(again.decks.map((deck) => deck.name)).toEqual(["Dictionary", "Lang", "Lang::Vocab"]);
    expect(again.decks.find((deck) => deck.name === "Lang")?.ankiDeckId).toBe("10");
    const byHeadword = new Map(again.favorites.map((fav) => [fav.headword, fav]));
    expect(byHeadword.get("apple")?.card?.back).toContain("a fruit");
    expect(byHeadword.get("apple")?.card?.back).toContain("An &lt;apple&gt;");
    const cat = byHeadword.get("猫")!;
    expect(cat.srs).toMatchObject({ interval: 12, ease: 2.3, lapses: 1 });
    expect(Math.round(cat.srs.dueAt / DAY_MS)).toBe(Math.round((FIXTURE_CRT * 1000 + 30 * DAY_MS) / DAY_MS));
    expect(again.favorites.filter((fav) => fav.suspended)).toHaveLength(1);
    expect(again.missingMedia).toEqual(["neko.png"]);
    expect(stored.get("neko.mp3")).toEqual(SOUND_BYTES);
    // Imported note types keep their CSS on export.
    expect(Object.values(again.decks.find((d) => d.name === "Lang")?.styles ?? {})).toEqual([
      ".card { color: black; }",
    ]);
  });
});

describe("card HTML helpers", () => {
  test("sound tags, CSS sanitizing, side sounds, relative media", () => {
    expect(replaceSoundTags('[sound:a"b.mp3]', "Play")).toBe(
      '<button type="button" class="ryos-sound" data-sound="a&quot;b.mp3" aria-label="Play" title="Play"></button>'
    );
    expect(
      sanitizeCardCss('@import url("https://x/y.css"); .a { background: url(//evil/p.png); width: expression(1) }')
    ).toBe(" .a { background: none; width: (1) }");
    const back = "[sound:q.mp3]<hr id=answer>[sound:a.mp3]";
    expect(cardSideSounds("[sound:q.mp3]", "front")).toEqual(["q.mp3"]);
    expect(cardSideSounds(back, "back")).toEqual(["a.mp3"]);
    expect(cardSideSounds("[sound:q.mp3]<hr id=answer>text", "back")).toEqual(["q.mp3"]);
    expect(isRelativeMediaSrc("img.png")).toBe(true);
    expect(isRelativeMediaSrc("data:image/png;base64,x")).toBe(false);
    expect(isRelativeMediaSrc("//cdn/x.png")).toBe(false);
  });
});

describe("dictionary media store", () => {
  test("stores, reads, and prunes media by scope", async () => {
    resetFakeIndexedDB();
    await putDictionaryMediaBatch([
      { key: "anki-1/a.mp3", filename: "a.mp3", data: SOUND_BYTES },
      { key: "anki-2/b.png", filename: "b.png", data: IMAGE_BYTES.subarray(1) },
    ]);
    expect(await getDictionaryMediaBytes("anki-1/a.mp3")).toEqual(SOUND_BYTES);
    expect(await getDictionaryMediaBytes("anki-2/b.png")).toEqual(IMAGE_BYTES.subarray(1));
    expect(await pruneDictionaryMedia(new Set(["anki-1"]))).toBe(1);
    expect(await getDictionaryMediaBytes("anki-2/b.png")).toBeNull();
    expect(await getDictionaryMediaBytes("anki-1/a.mp3")).toEqual(SOUND_BYTES);
  });
});
