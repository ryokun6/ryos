import { useEffect, useState } from "react";
import ePub from "epubjs";
import { readBookBlobContent } from "@/services/vfs/FileContentRepository";

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

function cacheKey(path: string, modifiedAt?: number): string {
  return `${path}::${modifiedAt ?? 0}`;
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
    const result: BookCoverInfo = {
      coverUrl: null,
      title: null,
      author: null,
    };
    try {
      const blob = await readBookBlobContent(path);
      if (!blob) return result;
      const buffer = await blob.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const book = ePub(buffer as any);
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
          const coverBlob = await response.blob();
          result.coverUrl = URL.createObjectURL(coverBlob);
        }
      } catch {
        // no cover available
      }
      book.destroy();
    } catch (err) {
      console.warn("[Books] Failed to load cover for", path, err);
    }
    coverCache.set(key, result);
    inflight.delete(key);
    return result;
  })();

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
