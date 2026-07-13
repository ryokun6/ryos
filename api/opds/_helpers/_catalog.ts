import { gunzipSync } from "node:zlib";
import type { Redis } from "../../_utils/redis.js";
import {
  downloadStoredObject,
  isStoredObjectWithinPath,
} from "../../_utils/storage.js";
import { readSyncDocsByPrefix } from "../../sync/v2/_core.js";
import {
  getSyncBlobRef,
  type SyncBlobRef,
} from "../../../src/shared/sync2/types.js";

const FILES_PREFIX = "files/item:";
const BOOKS_PREFIX = "books/item:";
const BOOKSHELF_ORDER_KEY = "bookshelf/order";
const VFS_BOOKS_PREFIX = "/Books/";
const MAX_SYNC_BLOB_BYTES = 50 * 1024 * 1024;
const MAX_SERIALIZED_BOOK_BYTES = 80 * 1024 * 1024;
const MAX_EPUB_BYTES = 50 * 1024 * 1024;
const BOOK_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export const OPDS_FEED_CONTENT_TYPE =
  "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8";

export interface OpdsBook {
  id: string;
  title: string;
  fileName: string;
  path: string;
  modifiedAt: number;
  size: number | null;
  blob: SyncBlobRef;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTopLevelEpubPath(path: string): boolean {
  if (!path.startsWith(VFS_BOOKS_PREFIX)) return false;
  const relativePath = path.slice(VFS_BOOKS_PREFIX.length);
  return (
    relativePath.length > ".epub".length &&
    !relativePath.includes("/") &&
    relativePath.toLowerCase().endsWith(".epub")
  );
}

function finiteTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function finiteSize(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function buildOpdsBooksFromDocuments(
  fileDocuments: Record<string, unknown>,
  blobDocuments: Record<string, unknown>,
  bookshelfDocuments: Record<string, unknown>,
): OpdsBook[] {
  const orderDocument = bookshelfDocuments[BOOKSHELF_ORDER_KEY];
  const order = isRecord(orderDocument) ? orderDocument : {};
  const pinnedTop = stringList(order.pinnedTop);
  const pinnedBottom = stringList(order.pinnedBottom);
  const topRank = new Map(pinnedTop.map((path, index) => [path, index]));
  const bottomRank = new Map(
    pinnedBottom.map((path, index) => [path, index]),
  );
  const seenIds = new Set<string>();
  const books: OpdsBook[] = [];

  for (const [key, value] of Object.entries(fileDocuments)) {
    if (!key.startsWith(FILES_PREFIX) || !isRecord(value)) continue;

    const path = key.slice(FILES_PREFIX.length);
    if (
      !isTopLevelEpubPath(path) ||
      value.status !== "active" ||
      value.isDirectory === true ||
      typeof value.uuid !== "string" ||
      !BOOK_ID_REGEX.test(value.uuid) ||
      seenIds.has(value.uuid)
    ) {
      continue;
    }

    const blob = getSyncBlobRef(blobDocuments[`${BOOKS_PREFIX}${value.uuid}`]);
    if (!blob) continue;

    const fallbackName = path.slice(VFS_BOOKS_PREFIX.length);
    const fileName =
      typeof value.name === "string" &&
      value.name.toLowerCase().endsWith(".epub")
        ? value.name
        : fallbackName;
    const modifiedAt =
      finiteTimestamp(value.modifiedAt) || finiteTimestamp(value.createdAt);

    seenIds.add(value.uuid);
    books.push({
      id: value.uuid,
      title: fileName.replace(/\.epub$/i, ""),
      fileName,
      path,
      modifiedAt,
      size: finiteSize(value.size),
      blob,
    });
  }

  const group = (path: string): 0 | 1 | 2 =>
    topRank.has(path) ? 0 : bottomRank.has(path) ? 2 : 1;

  return books.sort((left, right) => {
    const leftGroup = group(left.path);
    const rightGroup = group(right.path);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    if (leftGroup === 0) {
      return (topRank.get(left.path) ?? 0) - (topRank.get(right.path) ?? 0);
    }
    if (leftGroup === 2) {
      return (
        (bottomRank.get(left.path) ?? 0) -
        (bottomRank.get(right.path) ?? 0)
      );
    }
    return (
      right.modifiedAt - left.modifiedAt ||
      left.title.localeCompare(right.title)
    );
  });
}

export async function listOpdsBooks(
  redis: Redis,
  username: string,
): Promise<OpdsBook[]> {
  const [fileDocuments, blobDocuments, bookshelfDocuments] = await Promise.all([
    readSyncDocsByPrefix(redis, username, `${FILES_PREFIX}${VFS_BOOKS_PREFIX}`),
    readSyncDocsByPrefix(redis, username, BOOKS_PREFIX),
    readSyncDocsByPrefix(redis, username, BOOKSHELF_ORDER_KEY),
  ]);
  return buildOpdsBooksFromDocuments(
    fileDocuments,
    blobDocuments,
    bookshelfDocuments,
  );
}

function xmlEscape(value: string): string {
  const validXml = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");
  return validXml
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isoTimestamp(timestamp: number): string {
  return new Date(timestamp > 0 ? timestamp : 0).toISOString();
}

export function renderOpdsFeed(
  username: string,
  books: readonly OpdsBook[],
): string {
  const feedUpdated = books.reduce(
    (latest, book) => Math.max(latest, book.modifiedAt),
    0,
  );
  const entries = books
    .map((book) => {
      const href = `books/${encodeURIComponent(book.id)}.epub`;
      return [
        "  <entry>",
        `    <id>urn:ryos:book:${xmlEscape(book.id)}</id>`,
        `    <title>${xmlEscape(book.title)}</title>`,
        `    <updated>${isoTimestamp(book.modifiedAt || feedUpdated)}</updated>`,
        `    <link rel="http://opds-spec.org/acquisition" href="${xmlEscape(href)}" type="application/epub+zip"/>`,
        "  </entry>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">',
    `  <id>urn:ryos:opds:${xmlEscape(username)}</id>`,
    `  <title>${xmlEscape(username)}&apos;s Books</title>`,
    `  <updated>${isoTimestamp(feedUpdated)}</updated>`,
    `  <author><name>${xmlEscape(username)}</name></author>`,
    `  <link rel="self" href="/api/opds" type="${OPDS_FEED_CONTENT_TYPE.split("; charset=")[0]}"/>`,
    entries,
    "</feed>",
    "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function normalizeOpdsBookId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.toLowerCase().endsWith(".epub")
    ? value.slice(0, -".epub".length)
    : value;
  return BOOK_ID_REGEX.test(id) ? id : null;
}

function decodeBase64Epub(value: string): Uint8Array {
  const maximumBase64Length = Math.ceil((MAX_EPUB_BYTES * 4) / 3) + 4;
  if (
    value.length === 0 ||
    value.length > maximumBase64Length ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error("Invalid EPUB payload encoding.");
  }

  const bytes = Buffer.from(value, "base64");
  if (
    bytes.byteLength < 4 ||
    bytes.byteLength > MAX_EPUB_BYTES ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw new Error("Invalid EPUB payload.");
  }
  return bytes;
}

export function extractEpubFromSyncBlob(
  compressed: Uint8Array,
  expectedBookId: string,
): Uint8Array {
  if (
    compressed.byteLength === 0 ||
    compressed.byteLength > MAX_SYNC_BLOB_BYTES
  ) {
    throw new Error("Invalid sync blob size.");
  }

  const json = gunzipSync(compressed, {
    maxOutputLength: MAX_SERIALIZED_BOOK_BYTES,
  }).toString("utf8");
  const parsed: unknown = JSON.parse(json);
  if (
    !isRecord(parsed) ||
    parsed.key !== expectedBookId ||
    !isRecord(parsed.value) ||
    typeof parsed.value.content !== "string"
  ) {
    throw new Error("Invalid serialized book.");
  }

  if (parsed.value._isBlob_content === true) {
    const match =
      /^data:(?:application\/epub\+zip|application\/octet-stream);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
        parsed.value.content,
      );
    if (!match) {
      throw new Error("Invalid serialized EPUB blob.");
    }
    return decodeBase64Epub(match[1]);
  }

  if (parsed.value._isArrayBuffer_content === true) {
    return decodeBase64Epub(parsed.value.content);
  }

  throw new Error("Serialized book content has no binary marker.");
}

export async function downloadOpdsBook(
  username: string,
  book: OpdsBook,
): Promise<Uint8Array> {
  if (
    book.blob.size <= 0 ||
    book.blob.size > MAX_SYNC_BLOB_BYTES ||
    !isStoredObjectWithinPath(
      book.blob.url,
      `sync/${username}/blobs/`,
    )
  ) {
    throw new Error("Invalid book storage reference.");
  }

  const compressed = await downloadStoredObject(book.blob.url);
  return extractEpubFromSyncBlob(compressed, book.id);
}
