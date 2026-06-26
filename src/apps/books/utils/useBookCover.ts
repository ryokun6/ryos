import { useEffect, useState } from "react";
import ePub from "epubjs";
import { readBookBlobContent } from "@/services/vfs/FileContentRepository";
import { STORES, dbOperations } from "@/utils/indexedDB";
import { isLikelyEpubBuffer } from "./booksReader";

export interface BookCoverInfo {
  coverUrl: string | null;
  title: string | null;
  author: string | null;
}

// Cache resolved cover info per (path + modifiedAt) so re-renders and shelf
// scrolling don't re-parse the EPUB. Object URLs are intentionally kept alive
// for the session.
const coverCache = new Map<string, BookCoverInfo>();
const inflight = new Map<string, Promise<BookCoverInfo>>();
const MAX_CONCURRENT_COVER_LOADS = 1;
const THUMBNAIL_CACHE_VERSION = 1;
let activeCoverLoads = 0;
const pendingCoverLoadSlots: Array<() => void> = [];

interface StoredBookThumbnail {
  version: number;
  title: string | null;
  author: string | null;
  coverBlob: Blob | null;
}

async function acquireCoverLoadSlot(): Promise<void> {
  if (activeCoverLoads >= MAX_CONCURRENT_COVER_LOADS) {
    await new Promise<void>((resolve) => {
      pendingCoverLoadSlots.push(resolve);
    });
  }
  activeCoverLoads += 1;
}

function releaseCoverLoadSlot(): void {
  activeCoverLoads = Math.max(0, activeCoverLoads - 1);
  pendingCoverLoadSlots.shift()?.();
}

async function runWithCoverLoadSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireCoverLoadSlot();
  try {
    return await task();
  } finally {
    releaseCoverLoadSlot();
  }
}

function cacheKey(path: string, modifiedAt?: number): string {
  return `${path}::${modifiedAt ?? 0}`;
}

function isBlobLike(value: unknown): value is Blob {
  return (
    value instanceof Blob ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as Blob).arrayBuffer === "function" &&
      typeof (value as Blob).size === "number")
  );
}

function infoFromStoredThumbnail(
  stored: StoredBookThumbnail | undefined
): BookCoverInfo | null {
  if (!stored || stored.version !== THUMBNAIL_CACHE_VERSION) return null;
  return {
    title: stored.title ?? null,
    author: stored.author ?? null,
    coverUrl: isBlobLike(stored.coverBlob)
      ? URL.createObjectURL(stored.coverBlob)
      : null,
  };
}

async function readStoredThumbnail(key: string): Promise<BookCoverInfo | null> {
  try {
    return infoFromStoredThumbnail(
      await dbOperations.get<StoredBookThumbnail>(STORES.BOOK_THUMBNAILS, key)
    );
  } catch {
    return null;
  }
}

async function writeStoredThumbnail(
  key: string,
  info: BookCoverInfo,
  coverBlob: Blob | null
): Promise<void> {
  try {
    await dbOperations.put<StoredBookThumbnail>(
      STORES.BOOK_THUMBNAILS,
      {
        version: THUMBNAIL_CACHE_VERSION,
        title: info.title,
        author: info.author,
        coverBlob,
      },
      key
    );
  } catch {
    // Thumbnail persistence is an optimization; shelf rendering should continue
    // even if the browser denies the cache write.
  }
}

async function loadCover(
  path: string,
  modifiedAt?: number
): Promise<BookCoverInfo> {
  const key = cacheKey(path, modifiedAt);
  const cached = coverCache.get(key);
  if (cached) return cached;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<BookCoverInfo> => {
    const stored = await readStoredThumbnail(key);
    if (stored) {
      coverCache.set(key, stored);
      return stored;
    }

    return runWithCoverLoadSlot(async (): Promise<BookCoverInfo> => {
      const result: BookCoverInfo = {
        coverUrl: null,
        title: null,
        author: null,
      };
      let coverBlob: Blob | null = null;
      try {
        const blob = await readBookBlobContent(path);
        if (blob) {
          const buffer = await blob.arrayBuffer();
          if (!isLikelyEpubBuffer(buffer)) {
            await writeStoredThumbnail(key, result, coverBlob);
            coverCache.set(key, result);
            return result;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const book = ePub(buffer as any);
          try {
            await book.ready;
            try {
              const metadata = await book.loaded.metadata;
              result.title = metadata?.title || null;
              result.author = metadata?.creator || null;
            } catch {
              // ignore metadata failures
            }
            try {
              const url = await book.coverUrl();
              if (url) {
                const response = await fetch(url);
                coverBlob = await response.blob();
                result.coverUrl = URL.createObjectURL(coverBlob);
              }
            } catch {
              // no cover available
            }
          } finally {
            book.destroy();
          }
        }
      } catch (err) {
        console.warn("[Books] Failed to load cover for", path, err);
      }
      await writeStoredThumbnail(key, result, coverBlob);
      coverCache.set(key, result);
      return result;
    });
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export function useBookCover(path: string, modifiedAt?: number) {
  const key = cacheKey(path, modifiedAt);
  const [info, setInfo] = useState<BookCoverInfo | null>(
    coverCache.get(key) ?? null
  );
  const [loading, setLoading] = useState(!!path && !coverCache.has(key));

  useEffect(() => {
    // No active path (e.g. called for "no book") — nothing to load.
    if (!path) {
      setInfo(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cached = coverCache.get(key);
    if (cached) {
      setInfo(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadCover(path, modifiedAt).then((result) => {
      if (cancelled) return;
      setInfo(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key, path, modifiedAt]);

  return { info, loading };
}
