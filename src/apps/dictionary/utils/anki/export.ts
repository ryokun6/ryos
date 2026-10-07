import { zipSync, type Zippable } from "fflate";
import type { SqlJsStatic } from "sql.js";
import type { DictionaryEntry } from "@/shared/dictionary";
import {
  DEFAULT_DICTIONARY_DECK_ID,
  resolveFavoriteDeckId,
  type DictionaryDeck,
  type DictionaryFavorite,
} from "@/stores/useDictionaryStore";
import { DAY_MS, isNewCard } from "../srs";
import { answerOnlyHtml, extractMediaRefs, stripAnkiHtml } from "./template";

/**
 * Builds a legacy-schema (11) `.apkg`: the format genanki writes and every
 * Anki release since 2.1 imports. One "ryOS Dictionary" note type with
 * Front/Back fields, plus one per imported note type so its CSS survives.
 */

export interface AnkiExportOptions {
  SQL: SqlJsStatic;
  decks: readonly DictionaryDeck[];
  favorites: readonly DictionaryFavorite[];
  /** Display name for the built-in deck (its stored name is empty). */
  defaultDeckName: string;
  loadMedia?: (key: string) => Promise<Uint8Array | null>;
  now?: number;
}

export interface AnkiExportResult {
  data: Uint8Array;
  noteCount: number;
  mediaCount: number;
}

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const DEFAULT_CSS = `.card {
  font-family: -apple-system, "Helvetica Neue", "PingFang SC", "Hiragino Sans", "Apple SD Gothic Neo", sans-serif;
  font-size: 22px;
  text-align: center;
  color: black;
  background-color: white;
}
.reading { font-size: 16px; color: #666; }
.senses { text-align: left; font-size: 18px; }
.example { text-align: left; font-size: 16px; color: #444; margin-top: 8px; }
.nightMode .reading, .nightMode .example { color: #aaa; }
`;

const DEFAULT_CONF = {
  activeDecks: [1],
  curDeck: 1,
  newSpread: 0,
  collapseTime: 1200,
  timeLim: 0,
  estTimes: true,
  dueCounts: true,
  curModel: null,
  nextPos: 1,
  sortType: "noteFld",
  sortBackwards: false,
  addToCur: true,
};

const DEFAULT_DCONF = {
  "1": {
    id: 1,
    name: "Default",
    replayq: true,
    lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    rev: { perDay: 200, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, ease4: 1.3, bury: true, minSpace: 1 },
    timer: 0,
    maxTaken: 60,
    usn: 0,
    new: { perDay: 20, delays: [1, 10], separate: true, ints: [1, 4, 7], initialFactor: 2500, bury: true, order: 1 },
    mod: 0,
    autoplay: true,
    dyn: false,
  },
};

/** cyrb53: small, stable 53-bit string hash for deterministic ids/guids. */
export function hash53(input: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Deterministic Anki-style id (ms-epoch range) so re-exports update in place. */
function stableAnkiId(key: string): number {
  return 1_500_000_000_000 + (hash53(key) % 100_000_000_000);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function entryReading(entry: DictionaryEntry): string | undefined {
  return entry.reading ?? entry.ipa ?? entry.hanja;
}

export function entryToAnkiFields(entry: DictionaryEntry): { front: string; back: string } {
  const headword =
    entry.traditional && entry.simplified && entry.traditional !== entry.simplified
      ? `${entry.simplified}（${entry.traditional}）`
      : entry.headword;
  const front = `<div class="headword" lang="${entry.lang}">${escapeHtml(headword)}</div>`;
  const reading = entryReading(entry);
  const senses = entry.senses
    .map((sense) => {
      const pos = sense.partOfSpeech ? `<i>${escapeHtml(sense.partOfSpeech)}</i> ` : "";
      return `<li>${pos}${escapeHtml(sense.glosses.join("; "))}</li>`;
    })
    .join("");
  const example = entry.senses.flatMap((sense) => sense.examples ?? [])[0];
  const back = [
    reading ? `<div class="reading">${escapeHtml(reading)}</div>` : "",
    senses ? `<ol class="senses">${senses}</ol>` : "",
    example
      ? `<div class="example" lang="${entry.lang}">${escapeHtml(example.text)}${
          example.translation ? `<br>${escapeHtml(example.translation)}` : ""
        }</div>`
      : "",
  ].join("");
  return { front, back };
}

async function sha1Checksum(text: string): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}

/** Every "A::B::C" deck also needs "A" and "A::B" rows. */
function withParentDeckNames(names: Iterable<string>): string[] {
  const all = new Set<string>();
  for (const name of names) {
    const parts = name.split("::");
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("::"));
  }
  return Array.from(all);
}

export async function exportAnkiPackage(options: AnkiExportOptions): Promise<AnkiExportResult> {
  const now = options.now ?? Date.now();
  const nowSecs = Math.floor(now / 1000);
  const deckIds = new Set(options.decks.map((deck) => deck.id));
  const deckById = new Map(options.decks.map((deck) => [deck.id, deck]));
  const styles = new Map<string, string>();
  for (const deck of options.decks) {
    for (const [styleId, css] of Object.entries(deck.styles ?? {})) styles.set(styleId, css);
  }

  const deckName = (deck: DictionaryDeck) =>
    deck.id === DEFAULT_DICTIONARY_DECK_ID && !deck.name ? options.defaultDeckName : deck.name;
  const ankiDeckIdFor = (deck: DictionaryDeck) =>
    deck.ankiDeckId && /^\d+$/.test(deck.ankiDeckId) && deck.ankiDeckId !== "1"
      ? Number(deck.ankiDeckId)
      : stableAnkiId(`deck:${deckName(deck)}`);

  // Earliest due date becomes day 0 so review due numbers are never negative.
  let earliest = now;
  for (const fav of options.favorites) {
    if (!isNewCard(fav.srs)) earliest = Math.min(earliest, fav.srs.dueAt);
  }
  const crt = Math.floor(earliest / DAY_MS) * (DAY_MS / 1000);

  const models: Record<string, unknown> = {};
  const modelIdFor = (styleId: string | undefined, notetypeName: string | undefined) => {
    const key = styleId && styles.has(styleId) ? styleId : "ryos";
    const id = stableAnkiId(`model:${key}`);
    if (!models[id]) {
      models[id] = {
        id,
        name: key === "ryos" ? "ryOS Dictionary" : `${notetypeName || "Imported"} (ryOS)`,
        type: 0,
        mod: nowSecs,
        usn: -1,
        sortf: 0,
        did: 1,
        tmpls: [
          {
            name: "Card 1",
            ord: 0,
            qfmt: "{{Front}}",
            afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
            did: null,
            bqfmt: "",
            bafmt: "",
          },
        ],
        flds: ["Front", "Back"].map((name, ord) => ({
          name,
          ord,
          sticky: false,
          rtl: false,
          font: "Arial",
          size: 20,
          media: [],
        })),
        css: key === "ryos" ? DEFAULT_CSS : styles.get(key),
        latexPre:
          "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        latexPost: "\\end{document}",
        latexsvg: false,
        req: [[0, "any", [0]]],
        tags: [],
        vers: [],
      };
    }
    return id;
  };

  const SQL = options.SQL;
  const db = new SQL.Database();
  const mediaKeys = new Map<string, string>();
  let noteCount = 0;
  try {
    db.run(SCHEMA);
    const usedDeckNames = new Map<string, number>();
    const insertNote = db.prepare(
      "INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')"
    );
    const insertCard = db.prepare(
      "INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '')"
    );
    let nextId = now;
    let newPosition = 1;
    const ordered = [...options.favorites].sort((a, b) => a.addedAt - b.addedAt);
    for (const fav of ordered) {
      const deck = deckById.get(resolveFavoriteDeckId(fav, deckIds));
      if (!deck) continue;
      const name = deckName(deck);
      const did = name === "Default" ? 1 : ankiDeckIdFor(deck);
      usedDeckNames.set(name, did);

      const { front, back } = fav.card
        ? { front: fav.card.front, back: answerOnlyHtml(fav.card.back) }
        : entryToAnkiFields(fav.entry);
      if (fav.card?.mediaScope) {
        for (const ref of extractMediaRefs(front + back)) {
          if (!mediaKeys.has(ref)) mediaKeys.set(ref, `${fav.card.mediaScope}/${ref}`);
        }
      }
      const mid = modelIdFor(fav.card?.styleId, fav.card?.notetype);
      const sortField = stripAnkiHtml(front);
      const noteId = nextId++;
      insertNote.run([
        noteId,
        `ryos${hash53(fav.id).toString(36)}`,
        mid,
        nowSecs,
        fav.card?.tags?.length ? ` ${fav.card.tags.join(" ")} ` : "",
        `${front}\u001f${back}`,
        sortField,
        await sha1Checksum(sortField),
      ]);

      const { srs } = fav;
      let type = 0;
      let queue = 0;
      let due = newPosition++;
      let ivl = 0;
      let factor = 0;
      if (!isNewCard(srs)) {
        type = 2;
        queue = 2;
        due = Math.max(0, Math.round((srs.dueAt / 1000 - crt) / 86400));
        ivl = Math.max(1, Math.round(srs.interval));
        factor = Math.round(srs.ease * 1000);
      }
      if (fav.suspended) queue = -1;
      insertCard.run([
        nextId++,
        noteId,
        did,
        nowSecs,
        type,
        queue,
        due,
        ivl,
        factor,
        isNewCard(srs) ? 0 : Math.max(1, srs.repetitions),
        srs.lapses,
      ]);
      noteCount++;
    }
    insertNote.free();
    insertCard.free();

    const decks: Record<string, unknown> = {
      "1": deckJson(1, "Default", nowSecs),
    };
    const idByName = new Map(usedDeckNames);
    for (const name of withParentDeckNames(usedDeckNames.keys())) {
      if (name === "Default") continue;
      const id = idByName.get(name) ?? stableAnkiId(`deck:${name}`);
      decks[String(id)] = deckJson(id, name, nowSecs);
    }

    db.run("INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')", [
      crt,
      now,
      now,
      JSON.stringify(DEFAULT_CONF),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify(DEFAULT_DCONF),
    ]);
    const collection = db.export();

    const files: Zippable = {
      "collection.anki2": [collection, { level: 6 }],
    };
    const mediaMap: Record<string, string> = {};
    let index = 0;
    if (options.loadMedia) {
      for (const [filename, key] of mediaKeys) {
        const bytes = await options.loadMedia(key);
        if (!bytes) continue;
        mediaMap[String(index)] = filename;
        files[String(index)] = [bytes, { level: 0 }];
        index++;
      }
    }
    files.media = [new TextEncoder().encode(JSON.stringify(mediaMap)), { level: 6 }];
    return { data: zipSync(files), noteCount, mediaCount: index };
  } finally {
    db.close();
  }
}

function deckJson(id: number, name: string, mod: number) {
  return {
    id,
    name,
    desc: "",
    mod,
    usn: -1,
    collapsed: false,
    browserCollapsed: false,
    newToday: [0, 0],
    revToday: [0, 0],
    lrnToday: [0, 0],
    timeToday: [0, 0],
    dyn: 0,
    conf: 1,
    extendNew: 10,
    extendRev: 50,
  };
}
