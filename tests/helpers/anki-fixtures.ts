import { zipSync, type Zippable } from "fflate";
import type { SqlJsStatic } from "sql.js";

/** Small, synthetic Anki packages for import tests (no real decks committed). */

export const FIXTURE_CRT = 1_700_000_000;
export const SOUND_BYTES = new Uint8Array([0xff, 0xf3, 0xe8, 0x44, 0x01, 0x02, 0x03]);
export const IMAGE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

const utf8 = new TextEncoder();

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
  return out;
}

type ProtoField = [field: number, value: number | string | Uint8Array];

export function encodeProto(fields: ProtoField[]): Uint8Array {
  const out: number[] = [];
  for (const [field, value] of fields) {
    if (typeof value === "number") {
      out.push(...varint(field * 8), ...varint(value));
    } else {
      const bytes = typeof value === "string" ? utf8.encode(value) : value;
      out.push(...varint(field * 8 + 2), ...varint(bytes.length), ...bytes);
    }
  }
  return new Uint8Array(out);
}

/** Valid zstd frame using raw (uncompressed) blocks — enough to exercise decoding. */
export function zstdRawFrame(data: Uint8Array): Uint8Array {
  const BLOCK = 128 * 1024;
  const parts: number[] = [0x28, 0xb5, 0x2f, 0xfd];
  // Single segment, 4-byte frame content size.
  parts.push(0xa0, ...[0, 8, 16, 24].map((shift) => (data.length >>> shift) & 0xff));
  let offset = 0;
  do {
    const size = Math.min(BLOCK, data.length - offset);
    const last = offset + size >= data.length ? 1 : 0;
    const header = (size << 3) | last;
    parts.push(header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff);
    for (let i = 0; i < size; i++) parts.push(data[offset + i]);
    offset += size;
  } while (offset < data.length);
  return new Uint8Array(parts);
}

const NOTES = `
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
`;

interface CardRow {
  id: number;
  nid: number;
  did: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  odue?: number;
  odid?: number;
}

function insertNotesAndCards(
  db: import("sql.js").Database,
  notes: { id: number; guid: string; mid: number; tags: string; fields: string[] }[],
  cards: CardRow[],
  revlog: [id: number, cid: number][] = []
) {
  for (const note of notes) {
    db.run("INSERT INTO notes VALUES (?,?,?,0,0,?,?,?,0,0,'')", [
      note.id,
      note.guid,
      note.mid,
      note.tags,
      note.fields.join("\x1f"),
      note.fields[0],
    ]);
  }
  for (const c of cards) {
    db.run("INSERT INTO cards VALUES (?,?,?,?,0,0,?,?,?,?,?,?,?,0,?,?,0,'')", [
      c.id,
      c.nid,
      c.did,
      c.ord,
      c.type,
      c.queue,
      c.due,
      c.ivl,
      c.factor,
      c.reps,
      c.lapses,
      c.odue ?? 0,
      c.odid ?? 0,
    ]);
  }
  for (const [id, cid] of revlog) {
    db.run("INSERT INTO revlog VALUES (?,?,0,3,1,0,2500,1000,1)", [id, cid]);
  }
}

/**
 * Legacy `.apkg` (collection.anki2, schema 11, JSON media map, plain members):
 * one Basic note (review card with sound + image) and one Cloze note with two
 * cards (one new, one suspended learning card) in a "Lang::Vocab" subdeck.
 */
export function buildLegacyApkg(SQL: SqlJsStatic): Uint8Array {
  const db = new SQL.Database();
  db.run(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);${NOTES}`);
  const models = {
    "100": {
      id: 100,
      name: "Basic",
      type: 0,
      css: ".card { color: black; }",
      flds: [
        { name: "Audio", ord: 2 },
        { name: "Back", ord: 1 },
        { name: "Front", ord: 0 },
      ],
      tmpls: [
        {
          name: "Card 1",
          ord: 0,
          qfmt: "{{Front}}{{#Audio}}{{Audio}}{{/Audio}}",
          afmt: "{{FrontSide}}<hr id=answer>{{Back}}",
        },
      ],
    },
    "200": {
      id: 200,
      name: "Cloze",
      type: 1,
      css: ".cloze { color: blue; }",
      flds: [{ name: "Text", ord: 0 }],
      tmpls: [{ name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}" }],
    },
  };
  const decks = {
    "1": { id: 1, name: "Default" },
    "10": { id: 10, name: "Lang" },
    "11": { id: 11, name: "Lang::Vocab" },
  };
  db.run("INSERT INTO col VALUES (1,?,0,0,11,0,0,0,'{}',?,?,'{}','{}')", [
    FIXTURE_CRT,
    JSON.stringify(models),
    JSON.stringify(decks),
  ]);
  insertNotesAndCards(
    db,
    [
      {
        id: 1_600_000_000_000,
        guid: "basicGuid",
        mid: 100,
        tags: " vocab  jp ",
        fields: ["猫", "cat<br>feline", '[sound:neko.mp3] <img src="neko.png">'],
      },
      {
        id: 1_600_000_000_001,
        guid: "clozeGuid",
        mid: 200,
        tags: "",
        fields: ["{{c1::Paris}} is in {{c2::France::country}}"],
      },
    ],
    [
      { id: 1, nid: 1_600_000_000_000, did: 10, ord: 0, type: 2, queue: 2, due: 30, ivl: 12, factor: 2300, reps: 5, lapses: 1 },
      { id: 2, nid: 1_600_000_000_001, did: 11, ord: 0, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0 },
      { id: 3, nid: 1_600_000_000_001, did: 11, ord: 1, type: 1, queue: -1, due: FIXTURE_CRT + 600, ivl: 0, factor: 2500, reps: 1, lapses: 0 },
    ],
    [[(FIXTURE_CRT + 20 * 86_400) * 1000, 1]]
  );
  const sqlite = db.export();
  db.close();
  const files: Zippable = {
    "collection.anki2": sqlite,
    media: utf8.encode(JSON.stringify({ "0": "neko.mp3", "1": "neko.png", "2": "unused.jpg" })),
    "0": SOUND_BYTES,
    "1": IMAGE_BYTES,
    "2": new Uint8Array([1]),
  };
  return zipSync(files);
}

/**
 * colpkg v3 like current Anki writes: zstd anki21b with schema-18 tables, a
 * stub collection.anki2, a zstd protobuf media map, and zstd media members.
 * The second deck is filtered: its card's home deck is `odid`.
 */
export function buildModernColpkg(SQL: SqlJsStatic): Uint8Array {
  const db = new SQL.Database();
  db.run(`
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notetypes (id integer primary key, name text not null, mtime_secs integer not null, usn integer not null, config blob not null);
CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null, config blob not null, primary key (ntid, ord));
CREATE TABLE templates (ntid integer not null, ord integer not null, name text not null, mtime_secs integer not null, usn integer not null, config blob not null, primary key (ntid, ord));
CREATE TABLE decks (id integer primary key not null, name text not null, mtime_secs integer not null, usn integer not null, common blob not null, kind blob not null);
${NOTES}`);
  db.run("INSERT INTO col VALUES (1,?,0,0,18,0,0,0,'','','','','')", [FIXTURE_CRT]);
  db.run("INSERT INTO notetypes VALUES (?,?,0,0,?)", [
    300,
    "Pronunciation",
    encodeProto([
      [1, 0],
      [3, ".card { font-size: 30px; }"],
    ]),
  ]);
  db.run("INSERT INTO fields VALUES (300,0,'Word',x''), (300,1,'Sound',x''), (300,2,'Meaning',x'')");
  db.run("INSERT INTO templates VALUES (300,0,'Listen',0,0,?)", [
    encodeProto([
      [1, "{{Sound}}"],
      [2, "{{FrontSide}}<hr id=answer>{{Word}}: {{Meaning}}"],
    ]),
  ]);
  db.run(
    "INSERT INTO decks VALUES (20,?,0,0,x'',x''), (21,'Filtered',0,0,x'',x'')",
    ["Pron\x1fA &amp; B"]
  );
  insertNotesAndCards(
    db,
    [
      { id: 1_650_000_000_000, guid: "pronGuid", mid: 300, tags: "", fields: ["été", "[sound:ete.mp3]", "summer"] },
    ],
    [
      { id: 7, nid: 1_650_000_000_000, did: 21, ord: 0, type: 2, queue: 2, due: 99, ivl: 3, factor: 2600, reps: 2, lapses: 0, odue: 40, odid: 20 },
    ]
  );
  const sqlite = db.export();
  db.close();

  const stub = new SQL.Database();
  stub.run("CREATE TABLE col (id integer primary key, crt integer, ver integer); INSERT INTO col VALUES (1, 0, 11);");
  const stubBytes = stub.export();
  stub.close();

  const mediaMap = encodeProto([
    [1, encodeProto([[1, "ete.mp3"], [2, SOUND_BYTES.length], [3, new Uint8Array(20)]])],
  ]);
  return zipSync({
    "collection.anki2": stubBytes,
    "collection.anki21b": zstdRawFrame(sqlite),
    media: zstdRawFrame(mediaMap),
    "0": zstdRawFrame(SOUND_BYTES),
    meta: encodeProto([[1, 3]]),
  });
}
