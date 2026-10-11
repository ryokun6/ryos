import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { DictionaryKanjiInfo, DictionaryLanguage } from "../../../src/shared/dictionary.js";
import {
  DictionaryIndex,
  type DictionaryIndexParts,
  type PostingList,
} from "./_index.js";

const MAGIC = "RYDX";
const VERSION = 1;
const LANGS: DictionaryLanguage[] = ["en", "zh", "ja", "ko"];

export interface SnapshotBundle {
  parts: DictionaryIndexParts;
  exceptions: Map<string, string[]>;
}

export function indexSnapshotPath(dir: string, lang: DictionaryLanguage): string {
  return path.join(dir, `index-${lang}.rydx`);
}

export function kanjiSnapshotPath(dir: string): string {
  return path.join(dir, "kanji.json.gz");
}

class Writer {
  private buf: Uint8Array;
  private view: DataView;
  private offset = 0;

  constructor(capacity = 1024 * 1024) {
    this.buf = new Uint8Array(capacity);
    this.view = new DataView(this.buf.buffer);
  }

  private grow(extra: number) {
    if (this.offset + extra <= this.buf.length) return;
    let next = this.buf.length;
    while (next < this.offset + extra) next *= 2;
    const grown = new Uint8Array(next);
    grown.set(this.buf.subarray(0, this.offset));
    this.buf = grown;
    this.view = new DataView(grown.buffer);
  }

  u8(value: number) {
    this.grow(1);
    this.buf[this.offset++] = value;
  }

  u32(value: number) {
    this.grow(4);
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
  }

  bytes(value: Uint8Array) {
    this.grow(value.length);
    this.buf.set(value, this.offset);
    this.offset += value.length;
  }

  finish(): Uint8Array {
    return this.buf.subarray(0, this.offset);
  }
}

class Reader {
  private offset = 0;
  private readonly view: DataView;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  u8(): number {
    if (this.offset >= this.buf.length) throw new Error("dictionary snapshot truncated");
    return this.buf[this.offset++];
  }

  u32(): number {
    if (this.offset + 4 > this.buf.length) throw new Error("dictionary snapshot truncated");
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  bytes(length: number): Uint8Array {
    if (this.offset + length > this.buf.length) throw new Error("dictionary snapshot truncated");
    const slice = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

function encodePosting(list: PostingList): number[] {
  return typeof list === "number" ? [list] : list;
}

function decodePosting(values: number[]): PostingList {
  return values.length === 1 ? values[0] : values;
}

export function encodeIndexSnapshot(
  parts: DictionaryIndexParts,
  exceptions: Map<string, string[]> = new Map()
): Uint8Array {
  const encoder = new TextEncoder();
  const strings: Uint8Array[] = [];
  const ids = new Map<string, number>();
  const idOf = (value: string) => {
    const existing = ids.get(value);
    if (existing !== undefined) return existing;
    const id = strings.length;
    ids.set(value, id);
    strings.push(encoder.encode(value));
    return id;
  };

  const rowIds = parts.rows.map((row) => idOf(row));
  const headIds = parts.headwords.map((word) => idOf(word));
  const headKeyIds = parts.headKeys.map((key) => idOf(key));
  const readingIds = parts.readings.map(([key]) => idOf(key));
  const glossIds = parts.glosses.map(([key]) => idOf(key));
  const exceptionForms = Array.from(exceptions.entries());
  for (const [form, lemmas] of exceptionForms) {
    idOf(form);
    for (const lemma of lemmas) idOf(lemma);
  }

  const writer = new Writer();
  writer.bytes(encoder.encode(MAGIC));
  writer.u8(VERSION);
  const langId = LANGS.indexOf(parts.lang);
  if (langId < 0) throw new Error(`No snapshot language id for ${parts.lang}`);
  writer.u8(langId);
  writer.u8(parts.rowEncoding === "cedict" ? 1 : 0);
  writer.u8(parts.suffixKey && parts.suffixOffset ? 1 : 0);
  writer.u32(parts.rows.length);
  writer.u32(strings.length);
  for (const bytes of strings) {
    writer.u32(bytes.length);
    writer.bytes(bytes);
  }
  for (const id of rowIds) writer.u32(id);
  for (let i = 0; i < parts.ranks.length; i++) writer.u8(parts.ranks[i]);
  for (const id of headIds) writer.u32(id);

  const writeMap = (keys: number[], lists: PostingList[]) => {
    writer.u32(keys.length);
    for (let i = 0; i < keys.length; i++) {
      writer.u32(keys[i]);
      const postings = encodePosting(lists[i]);
      writer.u32(postings.length);
      for (const posting of postings) writer.u32(posting);
    }
  };
  writeMap(headKeyIds, parts.headPostings);
  writeMap(
    readingIds,
    parts.readings.map(([, list]) => list)
  );
  writeMap(
    glossIds,
    parts.glosses.map(([, list]) => list)
  );
  if (parts.suffixKey && parts.suffixOffset) {
    writer.u32(parts.suffixKey.length);
    for (let i = 0; i < parts.suffixKey.length; i++) writer.u32(parts.suffixKey[i]);
    for (let i = 0; i < parts.suffixOffset.length; i++) writer.u32(parts.suffixOffset[i]);
  }
  writer.u32(exceptionForms.length);
  for (const [form, lemmas] of exceptionForms) {
    writer.u32(idOf(form));
    writer.u32(lemmas.length);
    for (const lemma of lemmas) writer.u32(idOf(lemma));
  }
  return writer.finish();
}

export function decodeIndexSnapshot(bytes: Uint8Array): SnapshotBundle {
  const reader = new Reader(bytes);
  const magic = new TextDecoder().decode(reader.bytes(4));
  if (magic !== MAGIC) throw new Error("dictionary snapshot magic mismatch");
  const version = reader.u8();
  if (version !== VERSION) throw new Error(`dictionary snapshot version ${version}`);
  const lang = LANGS[reader.u8()];
  if (!lang) throw new Error("dictionary snapshot language missing");
  const rowEncoding = reader.u8() === 1 ? "cedict" : "json";
  const hasSuffixes = reader.u8() === 1;
  const rowCount = reader.u32();
  const stringCount = reader.u32();
  const decoder = new TextDecoder();
  const strings = new Array<string>(stringCount);
  for (let i = 0; i < stringCount; i++) {
    const length = reader.u32();
    strings[i] = decoder.decode(reader.bytes(length));
  }
  const at = (id: number) => {
    const value = strings[id];
    if (value === undefined) throw new Error("dictionary snapshot string missing");
    return value;
  };
  const rows = new Array<string>(rowCount);
  for (let i = 0; i < rowCount; i++) rows[i] = at(reader.u32());
  const ranks = new Uint8Array(rowCount);
  for (let i = 0; i < rowCount; i++) ranks[i] = reader.u8();
  const headwords = new Array<string>(rowCount);
  for (let i = 0; i < rowCount; i++) headwords[i] = at(reader.u32());

  const readMap = (): [string, PostingList][] => {
    const count = reader.u32();
    const entries: [string, PostingList][] = new Array(count);
    for (let i = 0; i < count; i++) {
      const key = at(reader.u32());
      const postingCount = reader.u32();
      const postings = new Array<number>(postingCount);
      for (let p = 0; p < postingCount; p++) postings[p] = reader.u32();
      entries[i] = [key, decodePosting(postings)];
    }
    return entries;
  };
  const headEntries = readMap();
  const readings = readMap();
  const glosses = readMap();
  let suffixKey: Uint32Array | null = null;
  let suffixOffset: Uint32Array | null = null;
  if (hasSuffixes) {
    const suffixCount = reader.u32();
    suffixKey = new Uint32Array(suffixCount);
    suffixOffset = new Uint32Array(suffixCount);
    for (let i = 0; i < suffixCount; i++) suffixKey[i] = reader.u32();
    for (let i = 0; i < suffixCount; i++) suffixOffset[i] = reader.u32();
  }
  const exceptionCount = reader.u32();
  const exceptions = new Map<string, string[]>();
  for (let i = 0; i < exceptionCount; i++) {
    const form = at(reader.u32());
    const lemmaCount = reader.u32();
    const lemmas = new Array<string>(lemmaCount);
    for (let n = 0; n < lemmaCount; n++) lemmas[n] = at(reader.u32());
    exceptions.set(form, lemmas);
  }
  return {
    parts: {
      lang,
      rowEncoding,
      rows,
      ranks,
      headwords,
      headKeys: headEntries.map(([key]) => key),
      headPostings: headEntries.map(([, list]) => list),
      readings,
      glosses,
      suffixKey,
      suffixOffset,
    },
    exceptions,
  };
}

async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, file);
}

export async function writeIndexSnapshot(
  file: string,
  index: DictionaryIndex,
  exceptions?: Map<string, string[]>
): Promise<void> {
  const encoded = encodeIndexSnapshot(index.exportParts(), exceptions);
  await writeAtomic(file, gzipSync(encoded));
}

export async function readIndexSnapshot(file: string): Promise<SnapshotBundle | null> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch {
    return null;
  }
  if (bytes.byteLength === 0) return null;
  try {
    const payload = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
    return decodeIndexSnapshot(payload);
  } catch {
    return null;
  }
}

export async function writeKanjiSnapshot(
  file: string,
  kanji: Map<string, DictionaryKanjiInfo>
): Promise<void> {
  const json = JSON.stringify(Array.from(kanji.values()));
  await writeAtomic(file, gzipSync(Buffer.from(json)));
}

export async function readKanjiSnapshot(file: string): Promise<Map<string, DictionaryKanjiInfo> | null> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch {
    return null;
  }
  if (bytes.byteLength === 0) return null;
  try {
    const payload = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
    const items = JSON.parse(new TextDecoder().decode(payload)) as DictionaryKanjiInfo[];
    if (!Array.isArray(items)) return null;
    const map = new Map<string, DictionaryKanjiInfo>();
    for (const item of items) {
      if (item && typeof item.literal === "string") map.set(item.literal, item);
    }
    return map.size ? map : null;
  } catch {
    return null;
  }
}
