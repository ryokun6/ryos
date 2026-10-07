import type { SqlJsStatic } from "sql.js";
import { detectDictionaryLanguage, type DictionaryEntry } from "@/shared/dictionary";
import type {
  DictionaryDeck,
  DictionaryFavorite,
} from "@/stores/useDictionaryStore";
import { createSrsCard, DAY_MS, SRS_DEFAULT_EASE, SRS_MIN_EASE, type SrsCardState } from "../srs";
import { readAnkiCollection, type AnkiCard, type AnkiCollectionData } from "./collection";
import { maybeZstd, parseAnkiMediaMap } from "./protobuf";
import {
  answerOnlyHtml,
  extractMediaRefs,
  renderAnkiCard,
  stripAnkiHtml,
} from "./template";
import { openZip } from "./zip";

/** Decks + cards from an `.apkg` / `.colpkg`, with media streamed out in batches. */

export interface AnkiMediaRecord {
  /** `${mediaScope}/${filename}` */
  key: string;
  filename: string;
  data: Uint8Array;
}

export type AnkiImportPhase = "reading" | "cards" | "media";

export interface AnkiImportProgress {
  phase: AnkiImportPhase;
  done: number;
  total: number;
}

export interface AnkiImportOptions {
  SQL: SqlJsStatic;
  now?: number;
  /** Persist one batch of referenced media files. Skipped when omitted. */
  storeMedia?: (records: AnkiMediaRecord[]) => Promise<void>;
  onProgress?: (progress: AnkiImportProgress) => void;
  mediaBatchSize?: number;
}

export interface AnkiImportResult {
  decks: DictionaryDeck[];
  favorites: DictionaryFavorite[];
  mediaScope: string;
  mediaStored: number;
  /** Referenced by cards but missing from the package. */
  missingMedia: string[];
  /** Cards whose note or note type couldn't be resolved. */
  skippedCards: number;
  schema: number;
}

export class AnkiImportError extends Error {}

const COLLECTION_MEMBERS = ["collection.anki21b", "collection.anki21", "collection.anki2"];
const HEADWORD_MAX = 120;
const GLOSS_MAX = 300;
const GLOSS_LINES = 6;

export function ankiDeckToDictionaryDeckId(ankiDeckId: string): string {
  return `anki-${ankiDeckId}`;
}

export function ankiFavoriteId(guid: string, ord: number): string {
  return `anki:${guid}:${ord}`;
}

/**
 * Anki → SM-2. Review cards keep ease, interval, lapses, and due date; the
 * repetition count is floored at 2 so the next pass grows the interval by the
 * ease factor (SM-2's steady-state branch). Learning/relearning cards become
 * "reviewed, interval 0" so they stay out of the new-card budget.
 */
export function mapAnkiScheduling(
  card: Pick<AnkiCard, "type" | "queue" | "due" | "ivl" | "factor" | "reps" | "lapses">,
  crt: number,
  now: number,
  lastReviewAt?: number
): { srs: SrsCardState; suspended: boolean } {
  const suspended = card.queue === -1;
  if (card.type === 0) return { srs: createSrsCard(now), suspended };

  const ease =
    card.factor > 0 ? Math.max(SRS_MIN_EASE, card.factor / 1000) : SRS_DEFAULT_EASE;
  // Intraday learning stores epoch seconds; everything else is a day number.
  const dueAt =
    card.due > 1_000_000_000 ? card.due * 1000 : crt * 1000 + card.due * DAY_MS;
  const reviewed = lastReviewAt ?? Math.min(now, dueAt - Math.max(1, card.ivl) * DAY_MS);
  if (card.type === 2) {
    return {
      srs: {
        ease,
        interval: Math.max(1, card.ivl),
        repetitions: Math.max(2, card.reps),
        lapses: card.lapses,
        dueAt,
        lastReviewedAt: reviewed,
      },
      suspended,
    };
  }
  return {
    srs: {
      ease,
      interval: 0,
      repetitions: 0,
      lapses: card.lapses,
      dueAt,
      lastReviewedAt: reviewed,
    },
    suspended,
  };
}

function synthesizeEntry(
  favoriteId: string,
  question: string,
  answer: string,
  fallback: string
): DictionaryEntry {
  const front = stripAnkiHtml(question);
  const headword =
    (front.split("\n").find((line) => line.trim()) ?? stripAnkiHtml(fallback) ?? "")
      .trim()
      .slice(0, HEADWORD_MAX) || "—";
  const glosses = stripAnkiHtml(answerOnlyHtml(answer))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, GLOSS_LINES)
    .map((line) => line.slice(0, GLOSS_MAX));
  return {
    id: favoriteId,
    lang: detectDictionaryLanguage(headword),
    headword,
    senses: glosses.length ? [{ glosses }] : [],
    source: "anki",
  };
}

function templateFor(collection: AnkiCollectionData, card: AnkiCard) {
  const notetype = collection.notes.get(card.nid)
    ? collection.notetypes.get(collection.notes.get(card.nid)!.mid)
    : undefined;
  if (!notetype) return null;
  const template = notetype.isCloze
    ? notetype.templates[0]
    : notetype.templates.find((t) => t.ord === card.ord) ?? notetype.templates[card.ord];
  return template ? { notetype, template } : null;
}

export function convertAnkiCollection(
  collection: AnkiCollectionData,
  options: { now: number; mediaScope: string; onProgress?: AnkiImportOptions["onProgress"] }
): Omit<AnkiImportResult, "mediaStored" | "missingMedia"> & { mediaRefs: Set<string> } {
  const { now, mediaScope } = options;
  const favorites: DictionaryFavorite[] = [];
  const deckStyles = new Map<string, Record<string, string>>();
  const mediaRefs = new Set<string>();
  let skippedCards = 0;

  collection.cards.forEach((card, index) => {
    if (index % 500 === 0) {
      options.onProgress?.({ phase: "cards", done: index, total: collection.cards.length });
    }
    const note = collection.notes.get(card.nid);
    const resolved = templateFor(collection, card);
    if (!note || !resolved) {
      skippedCards++;
      return;
    }
    const { notetype, template } = resolved;
    const ankiDeckId = card.odid || card.did;
    const deckName = collection.decks.get(ankiDeckId)?.name ?? "";
    const fieldMap: Record<string, string> = {};
    notetype.fields.forEach((name, i) => {
      fieldMap[name] = note.fields[i] ?? "";
    });
    const { question, answer } = renderAnkiCard(template.qfmt, template.afmt, {
      fields: fieldMap,
      ord: card.ord,
      tags: note.tags,
      deckName,
      notetypeName: notetype.name,
      cardName: template.name,
    });
    for (const ref of extractMediaRefs(question + answer)) mediaRefs.add(ref);

    const favoriteId = ankiFavoriteId(note.guid || note.id, card.ord);
    const { srs, suspended } = mapAnkiScheduling(
      card.odid ? { ...card, due: card.odue } : card,
      collection.crt,
      now,
      collection.lastReviewAt.get(card.id)
    );
    const deckId = ankiDeckToDictionaryDeckId(ankiDeckId);
    if (notetype.css) {
      const styles = deckStyles.get(deckId) ?? {};
      styles[notetype.id] = notetype.css;
      deckStyles.set(deckId, styles);
    }
    const addedAt = Number(note.id) || now;
    favorites.push({
      id: favoriteId,
      lang: "en",
      headword: "",
      entry: synthesizeEntry(favoriteId, question, answer, note.fields[0] ?? ""),
      addedAt,
      updatedAt: now,
      srs,
      deckId,
      card: {
        front: question,
        back: answer,
        fields: notetype.fields.map((name, i) => ({ name, value: note.fields[i] ?? "" })),
        ...(note.tags.length ? { tags: note.tags } : {}),
        notetype: notetype.name,
        guid: note.guid,
        mediaScope,
        styleId: notetype.id,
      },
      ...(suspended ? { suspended: true } : {}),
    });
  });
  for (const favorite of favorites) {
    favorite.lang = favorite.entry.lang;
    favorite.headword = favorite.entry.headword;
  }

  const decks: DictionaryDeck[] = [];
  const usedDeckIds = new Set(favorites.map((fav) => fav.deckId!));
  for (const deckId of usedDeckIds) {
    const ankiDeckId = deckId.slice("anki-".length);
    const name = collection.decks.get(ankiDeckId)?.name || `Anki ${ankiDeckId}`;
    const styles = deckStyles.get(deckId);
    decks.push({
      id: deckId,
      name,
      createdAt: now,
      updatedAt: now,
      ankiDeckId,
      ...(styles ? { styles } : {}),
    });
  }
  decks.sort((a, b) => a.name.localeCompare(b.name));

  return {
    decks,
    favorites,
    mediaScope,
    skippedCards,
    schema: collection.schema,
    mediaRefs,
  };
}

export async function importAnkiPackage(
  data: Uint8Array,
  options: AnkiImportOptions
): Promise<AnkiImportResult> {
  const now = options.now ?? Date.now();
  options.onProgress?.({ phase: "reading", done: 0, total: 1 });
  const zip = openZip(data);
  const member = COLLECTION_MEMBERS.find((name) => zip.has(name));
  if (!member) throw new AnkiImportError("No Anki collection found in this file");
  const sqlite = maybeZstd(zip.read(member)!);

  const db = new options.SQL.Database(sqlite);
  let collection: AnkiCollectionData;
  try {
    collection = readAnkiCollection(db);
  } finally {
    db.close();
  }

  const mediaScope = `anki-${collection.crt || "x"}`;
  const converted = convertAnkiCollection(collection, {
    now,
    mediaScope,
    onProgress: options.onProgress,
  });
  options.onProgress?.({
    phase: "cards",
    done: collection.cards.length,
    total: collection.cards.length,
  });

  const memberByName = new Map<string, string>();
  for (const [memberName, filename] of parseAnkiMediaMap(zip.read("media"))) {
    memberByName.set(filename, memberName);
  }
  const wanted = Array.from(converted.mediaRefs);
  const missingMedia = wanted.filter((name) => !memberByName.has(name));
  const available = wanted.filter((name) => memberByName.has(name));

  let mediaStored = 0;
  if (options.storeMedia && available.length) {
    const batchSize = options.mediaBatchSize ?? 100;
    for (let start = 0; start < available.length; start += batchSize) {
      const batch: AnkiMediaRecord[] = [];
      for (const filename of available.slice(start, start + batchSize)) {
        const raw = zip.read(memberByName.get(filename)!);
        if (!raw) continue;
        batch.push({ key: `${mediaScope}/${filename}`, filename, data: maybeZstd(raw) });
      }
      await options.storeMedia(batch);
      mediaStored += batch.length;
      options.onProgress?.({ phase: "media", done: mediaStored, total: available.length });
    }
  }

  return {
    decks: converted.decks,
    favorites: converted.favorites,
    mediaScope,
    skippedCards: converted.skippedCards,
    schema: converted.schema,
    mediaStored,
    missingMedia,
  };
}
