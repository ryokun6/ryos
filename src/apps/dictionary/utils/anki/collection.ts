import type { Database, SqlValue } from "sql.js";
import { decodeProto, protoNumber, protoString } from "./protobuf";
import { decodeHtmlEntities } from "./template";

/** Collection data normalized across legacy (schema 11) and current (18) Anki. */

export interface AnkiTemplate {
  ord: number;
  name: string;
  qfmt: string;
  afmt: string;
}

export interface AnkiNotetype {
  id: string;
  name: string;
  isCloze: boolean;
  css: string;
  fields: string[];
  templates: AnkiTemplate[];
}

export interface AnkiDeckInfo {
  id: string;
  /** Hierarchy joined with "::", entities decoded. */
  name: string;
}

export interface AnkiNote {
  id: string;
  guid: string;
  mid: string;
  tags: string[];
  fields: string[];
}

export interface AnkiCard {
  id: string;
  nid: string;
  did: string;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  odue: number;
  odid: string;
}

export interface AnkiCollectionData {
  schema: number;
  /** Collection creation, epoch seconds (day 0 for review due dates). */
  crt: number;
  decks: Map<string, AnkiDeckInfo>;
  notetypes: Map<string, AnkiNotetype>;
  notes: Map<string, AnkiNote>;
  cards: AnkiCard[];
  /** Latest revlog timestamp (ms) per card id. */
  lastReviewAt: Map<string, number>;
}

function rows(db: Database, sql: string): SqlValue[][] {
  return db.exec(sql)[0]?.values ?? [];
}

function hasTable(db: Database, name: string): boolean {
  return (
    rows(db, `SELECT 1 FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0
  );
}

const id = (value: SqlValue) => String(value ?? "");
const num = (value: SqlValue) => (typeof value === "number" ? value : Number(value) || 0);
const str = (value: SqlValue) =>
  typeof value === "string"
    ? value
    : value instanceof Uint8Array
      ? new TextDecoder().decode(value)
      : value == null
        ? ""
        : String(value);
const blob = (value: SqlValue) =>
  value instanceof Uint8Array ? value : new TextEncoder().encode(str(value));

export function formatAnkiDeckName(raw: string): string {
  return decodeHtmlEntities(raw)
    .replaceAll("\u001f", "::")
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("::");
}

function parseTags(raw: string): string[] {
  return raw.split(/\s+/).filter(Boolean);
}

function readLegacyModels(db: Database) {
  const [row] = rows(db, "SELECT models, decks FROM col LIMIT 1");
  const notetypes = new Map<string, AnkiNotetype>();
  const decks = new Map<string, AnkiDeckInfo>();
  if (!row) return { notetypes, decks };
  const models = JSON.parse(str(row[0]) || "{}") as Record<string, {
    id: number | string;
    name?: string;
    type?: number;
    css?: string;
    flds?: { name: string; ord: number }[];
    tmpls?: { name: string; ord: number; qfmt: string; afmt: string }[];
  }>;
  for (const model of Object.values(models)) {
    const modelId = id(model.id);
    notetypes.set(modelId, {
      id: modelId,
      name: model.name ?? "",
      isCloze: model.type === 1,
      css: model.css ?? "",
      fields: [...(model.flds ?? [])].sort((a, b) => a.ord - b.ord).map((f) => f.name),
      templates: [...(model.tmpls ?? [])]
        .sort((a, b) => a.ord - b.ord)
        .map((t) => ({ ord: t.ord, name: t.name, qfmt: t.qfmt ?? "", afmt: t.afmt ?? "" })),
    });
  }
  const deckJson = JSON.parse(str(row[1]) || "{}") as Record<string, { id: number | string; name?: string }>;
  for (const deck of Object.values(deckJson)) {
    const deckId = id(deck.id);
    decks.set(deckId, { id: deckId, name: formatAnkiDeckName(deck.name ?? "") });
  }
  return { notetypes, decks };
}

function readModernModels(db: Database) {
  const notetypes = new Map<string, AnkiNotetype>();
  for (const [ntid, name, config] of rows(db, "SELECT id, name, config FROM notetypes")) {
    const proto = decodeProto(blob(config));
    notetypes.set(id(ntid), {
      id: id(ntid),
      name: str(name),
      isCloze: protoNumber(proto, 1) === 1,
      css: protoString(proto, 3),
      fields: [],
      templates: [],
    });
  }
  for (const [ntid, , name] of rows(db, "SELECT ntid, ord, name FROM fields ORDER BY ntid, ord")) {
    notetypes.get(id(ntid))?.fields.push(str(name));
  }
  for (const [ntid, ord, name, config] of rows(
    db,
    "SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord"
  )) {
    const proto = decodeProto(blob(config));
    notetypes.get(id(ntid))?.templates.push({
      ord: num(ord),
      name: str(name),
      qfmt: protoString(proto, 1),
      afmt: protoString(proto, 2),
    });
  }
  const decks = new Map<string, AnkiDeckInfo>();
  for (const [deckId, name] of rows(db, "SELECT id, name FROM decks")) {
    decks.set(id(deckId), { id: id(deckId), name: formatAnkiDeckName(str(name)) });
  }
  return { notetypes, decks };
}

export function readAnkiCollection(db: Database): AnkiCollectionData {
  const [colRow] = rows(db, "SELECT crt, ver FROM col LIMIT 1");
  const crt = num(colRow?.[0]);
  const schema = num(colRow?.[1]);
  const { notetypes, decks } = hasTable(db, "notetypes")
    ? readModernModels(db)
    : readLegacyModels(db);

  const notes = new Map<string, AnkiNote>();
  for (const [noteId, guid, mid, tags, flds] of rows(
    db,
    "SELECT id, guid, mid, tags, flds FROM notes"
  )) {
    notes.set(id(noteId), {
      id: id(noteId),
      guid: str(guid),
      mid: id(mid),
      tags: parseTags(str(tags)),
      fields: str(flds).split("\u001f"),
    });
  }

  const cards: AnkiCard[] = rows(
    db,
    "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, odue, odid FROM cards ORDER BY nid, ord"
  ).map((row) => ({
    id: id(row[0]),
    nid: id(row[1]),
    did: id(row[2]),
    ord: num(row[3]),
    type: num(row[4]),
    queue: num(row[5]),
    due: num(row[6]),
    ivl: num(row[7]),
    factor: num(row[8]),
    reps: num(row[9]),
    lapses: num(row[10]),
    odue: num(row[11]),
    odid: num(row[12]) ? id(row[12]) : "",
  }));

  const lastReviewAt = new Map<string, number>();
  if (hasTable(db, "revlog")) {
    for (const [cid, last] of rows(db, "SELECT cid, max(id) FROM revlog GROUP BY cid")) {
      lastReviewAt.set(id(cid), num(last));
    }
  }

  return { schema, crt, decks, notetypes, notes, cards, lastReviewAt };
}
