/**
 * Client-side utilities for chunked streaming API calls
 * Handles processing large requests chunk-by-chunk to avoid edge function timeouts
 */

import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

// =============================================================================
// Types
// =============================================================================

export interface ChunkProgress {
  completedChunks: number;
  totalChunks: number;
  percentage: number;
}

/** Pre-fetched translation info from initial lyrics fetch */
export interface TranslationChunkInfo {
  totalLines: number;
  totalChunks: number;
  chunkSize: number;
  cached: boolean;
  /** Cached translation LRC (only present if cached=true) */
  lrc?: string;
}

/** Pre-fetched furigana info from initial lyrics fetch */
export interface FuriganaChunkInfo {
  totalLines: number;
  totalChunks: number;
  chunkSize: number;
  cached: boolean;
  /** Cached furigana data (only present if cached=true) */
  data?: Array<Array<{ text: string; reading?: string }>>;
}

/** Pre-fetched soramimi info from initial lyrics fetch */
export interface SoramimiChunkInfo {
  totalLines: number;
  totalChunks: number;
  chunkSize: number;
  cached: boolean;
  /** Cached soramimi data (only present if cached=true) */
  data?: Array<Array<{ text: string; reading?: string }>>;
  /** Whether soramimi was skipped (e.g., for Chinese lyrics) */
  skipped?: boolean;
  /** Reason for skipping */
  skipReason?: string;
}

interface TranslateChunkResponse {
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  translations: string[];
  cached: boolean;
}

interface FuriganaChunkResponse {
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  furigana: Array<Array<{ text: string; reading?: string }>>;
  cached: boolean;
}

interface SoramimiChunkResponse {
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  soramimi: Array<Array<{ text: string; reading?: string }>>;
  cached: boolean;
  skipped?: boolean;
  skipReason?: string;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_CONCURRENT_CHUNKS = 3;
const CHUNK_TIMEOUT = 60000; // 60 seconds per chunk

// =============================================================================
// Translation Processing
// =============================================================================

export interface ProcessTranslationOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, translations: string[]) => void;
  /** Pre-fetched chunk info from initial lyrics request (skips extra API call) */
  prefetchedInfo?: TranslationChunkInfo;
}

/**
 * Process translation chunks with streaming progress.
 * Always checks for cached consolidated data unless force=true.
 * If prefetchedInfo has cached data, uses it directly to skip the API call.
 */
export async function processTranslationChunks(
  songId: string,
  language: string,
  options: ProcessTranslationOptions = {}
): Promise<string[]> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // Use prefetched info or fetch it
  let totalLines: number;
  let totalChunks: number;
  let cachedLrc: string | undefined;

  // If prefetched info has cached data, use it directly (skip API call)
  if (prefetchedInfo?.cached && prefetchedInfo.lrc && !force) {
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    cachedLrc = prefetchedInfo.lrc;
  } else {
    // Either no prefetched info OR prefetched info shows not cached
    // Always call get-chunk-info to verify server state (prefetched info might be stale)
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "translate",
        language,
        force,
      }),
      signal,
      timeout: 30000,
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk info (status ${res.status})`);
    }

    const chunkInfo = await res.json();
    totalLines = chunkInfo.totalLines;
    totalChunks = chunkInfo.totalChunks;
    if (chunkInfo.cached && chunkInfo.translation) {
      cachedLrc = chunkInfo.translation;
    }
  }

  // If fully cached, return immediately
  if (cachedLrc) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return parseLrcToTranslations(cachedLrc);
  }

  // Process all chunks in parallel
  const allTranslations: string[] = new Array(totalLines).fill("");
  let completedChunks = 0;

  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

  await processWithConcurrency(
    chunkIndices,
    async (chunkIndex) => {
      if (signal?.aborted) return;

      const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate-chunk",
          language,
          chunkIndex,
          force,
        }),
        signal,
        timeout: CHUNK_TIMEOUT,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffMultiplier: 2,
        },
      });

      if (!res.ok) {
        throw new Error(`Chunk ${chunkIndex} failed (status ${res.status})`);
      }

      const result = (await res.json()) as TranslateChunkResponse;

      if (typeof result.startIndex !== "number" || result.startIndex < 0) {
        throw new Error(`Invalid startIndex ${result.startIndex} in chunk ${chunkIndex}`);
      }

      result.translations.forEach((text, i) => {
        const targetIndex = result.startIndex + i;
        if (targetIndex < allTranslations.length) {
          allTranslations[targetIndex] = text;
        }
      });

      completedChunks++;
      onProgress?.({
        completedChunks,
        totalChunks,
        percentage: Math.round((completedChunks / totalChunks) * 100),
      });
      onChunk?.(result.chunkIndex, result.startIndex, result.translations);
    },
    MAX_CONCURRENT_CHUNKS
  );

  // Validate all chunks completed
  if (completedChunks !== totalChunks) {
    throw new Error(`Translation incomplete: expected ${totalChunks} chunks, got ${completedChunks}`);
  }

  // Save consolidated translation
  if (!signal?.aborted) {
    try {
      await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-translation",
          language,
          translations: allTranslations,
        }),
        signal,
        timeout: 60000,
      });
    } catch (e) {
      console.warn("Failed to save consolidated translation:", e);
    }
  }

  return allTranslations;
}

// =============================================================================
// Furigana Processing
// =============================================================================

export interface ProcessFuriganaOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, furigana: Array<Array<{ text: string; reading?: string }>>) => void;
  /** Pre-fetched chunk info from initial lyrics request (skips extra API call) */
  prefetchedInfo?: FuriganaChunkInfo;
}

/**
 * Process furigana chunks with streaming progress.
 * Always checks for cached consolidated data unless force=true.
 * If prefetchedInfo has cached data, uses it directly to skip the API call.
 */
export async function processFuriganaChunks(
  songId: string,
  options: ProcessFuriganaOptions = {}
): Promise<Array<Array<{ text: string; reading?: string }>>> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // Use prefetched info or fetch it
  let totalLines: number;
  let totalChunks: number;
  let cachedData: Array<Array<{ text: string; reading?: string }>> | undefined;

  // If prefetched info has cached data, use it directly (skip API call)
  if (prefetchedInfo?.cached && prefetchedInfo.data && !force) {
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    cachedData = prefetchedInfo.data;
  } else {
    // Either no prefetched info OR prefetched info shows not cached
    // Always call get-chunk-info to verify server state (prefetched info might be stale)
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "furigana",
        force,
      }),
      signal,
      timeout: 30000,
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk info (status ${res.status})`);
    }

    const chunkInfo = await res.json();
    totalLines = chunkInfo.totalLines;
    totalChunks = chunkInfo.totalChunks;
    if (chunkInfo.cached && chunkInfo.furigana) {
      cachedData = chunkInfo.furigana;
    }
  }

  // If fully cached, return immediately
  if (cachedData) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return cachedData;
  }

  // Process all chunks in parallel
  const allFurigana: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines).fill(null).map(() => []);
  let completedChunks = 0;

  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

  await processWithConcurrency(
    chunkIndices,
    async (chunkIndex) => {
      if (signal?.aborted) return;

      const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "furigana-chunk",
          chunkIndex,
          force,
        }),
        signal,
        timeout: CHUNK_TIMEOUT,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffMultiplier: 2,
        },
      });

      if (!res.ok) {
        throw new Error(`Chunk ${chunkIndex} failed (status ${res.status})`);
      }

      const result = (await res.json()) as FuriganaChunkResponse;

      if (typeof result.startIndex !== "number" || result.startIndex < 0) {
        throw new Error(`Invalid startIndex ${result.startIndex} in chunk ${chunkIndex}`);
      }

      result.furigana.forEach((segments, i) => {
        const targetIndex = result.startIndex + i;
        if (targetIndex < allFurigana.length) {
          allFurigana[targetIndex] = segments;
        }
      });

      completedChunks++;
      onProgress?.({
        completedChunks,
        totalChunks,
        percentage: Math.round((completedChunks / totalChunks) * 100),
      });
      onChunk?.(result.chunkIndex, result.startIndex, result.furigana);
    },
    MAX_CONCURRENT_CHUNKS
  );

  // Validate all chunks completed
  if (completedChunks !== totalChunks) {
    throw new Error(`Furigana incomplete: expected ${totalChunks} chunks, got ${completedChunks}`);
  }

  // Save consolidated furigana
  if (!signal?.aborted) {
    try {
      await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-furigana",
          furigana: allFurigana,
        }),
        signal,
        timeout: 60000,
      });
    } catch (e) {
      console.warn("Failed to save consolidated furigana:", e);
    }
  }

  return allFurigana;
}

// =============================================================================
// Soramimi Processing
// =============================================================================

export interface ProcessSoramimiOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, soramimi: Array<Array<{ text: string; reading?: string }>>) => void;
  /** Pre-fetched chunk info from initial lyrics request (skips extra API call) */
  prefetchedInfo?: SoramimiChunkInfo;
}

/**
 * Process soramimi chunks with streaming progress.
 * Always checks for cached consolidated data unless force=true.
 * If prefetchedInfo has cached data, uses it directly to skip the API call.
 */
export async function processSoramimiChunks(
  songId: string,
  options: ProcessSoramimiOptions = {}
): Promise<Array<Array<{ text: string; reading?: string }>>> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // Use prefetched info or fetch it
  let totalLines: number;
  let totalChunks: number;
  let cachedData: Array<Array<{ text: string; reading?: string }>> | undefined;

  // If prefetched info has cached data, use it directly (skip API call)
  if (prefetchedInfo?.cached && prefetchedInfo.data && !force) {
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    cachedData = prefetchedInfo.data;
  } else if (prefetchedInfo?.skipped) {
    // Handle skipped case from prefetch (e.g., Chinese lyrics)
    onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
    return []; // Return empty array for skipped content
  } else {
    // Either no prefetched info OR prefetched info shows not cached
    // Always call get-chunk-info to verify server state (prefetched info might be stale)
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "soramimi",
        force,
      }),
      signal,
      timeout: 30000, // Quick metadata fetch (30s should be plenty)
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk info (status ${res.status})`);
    }

    const chunkInfo = await res.json();
    
    // Handle skipped case (e.g., Chinese lyrics)
    if (chunkInfo.skipped) {
      onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
      return []; // Return empty array for skipped content
    }
    
    totalLines = chunkInfo.totalLines;
    totalChunks = chunkInfo.totalChunks;
    if (chunkInfo.cached && chunkInfo.soramimi) {
      cachedData = chunkInfo.soramimi;
    }
  }

  // If fully cached, return immediately
  if (cachedData) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return cachedData;
  }

  // Process all chunks in parallel
  const allSoramimi: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines).fill(null).map(() => []);
  const completedChunkSet = new Set<number>();
  let completedChunks = 0;

  // Process ALL chunks (0 through totalChunks-1) in parallel
  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

  await processWithConcurrency(
    chunkIndices,
    async (chunkIndex) => {
      if (signal?.aborted) return;

      const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "soramimi-chunk",
          chunkIndex,
          force,
        }),
        signal,
        timeout: CHUNK_TIMEOUT,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffMultiplier: 2,
        },
      });

      if (!res.ok) {
        throw new Error(`Chunk ${chunkIndex} failed (status ${res.status})`);
      }

      const result = (await res.json()) as SoramimiChunkResponse;

      // Handle skipped chunk (e.g., Chinese lyrics detected mid-stream)
      if (result.skipped) {
        // Mark as complete but don't add data
        completedChunkSet.add(chunkIndex);
        completedChunks++;
        onProgress?.({
          completedChunks,
          totalChunks,
          percentage: Math.round((completedChunks / totalChunks) * 100),
        });
        return;
      }

      if (typeof result.startIndex !== "number" || result.startIndex < 0) {
        throw new Error(`Invalid startIndex ${result.startIndex} in chunk ${chunkIndex}`);
      }

      result.soramimi.forEach((segments, i) => {
        const targetIndex = result.startIndex + i;
        if (targetIndex < allSoramimi.length) {
          allSoramimi[targetIndex] = segments;
        }
      });

      completedChunkSet.add(chunkIndex);
      completedChunks++;
      onProgress?.({
        completedChunks,
        totalChunks,
        percentage: Math.round((completedChunks / totalChunks) * 100),
      });
      onChunk?.(result.chunkIndex, result.startIndex, result.soramimi);
    },
    MAX_CONCURRENT_CHUNKS
  );

  // Validate all chunks completed
  if (completedChunkSet.size !== totalChunks) {
    const missing = chunkIndices.filter((i) => !completedChunkSet.has(i));
    throw new Error(`Soramimi incomplete: missing chunks ${missing.join(", ")}`);
  }

  // Save consolidated soramimi
  if (!signal?.aborted) {
    try {
      await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-soramimi",
          soramimi: allSoramimi,
        }),
        signal,
        timeout: 60000,
      });
    } catch (e) {
      console.warn("Failed to save consolidated soramimi:", e);
    }
  }

  return allSoramimi;
}

// =============================================================================
// Utilities
// =============================================================================

async function processWithConcurrency<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  maxConcurrent: number
): Promise<void> {
  const queue = [...items];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < maxConcurrent && queue.length > 0) {
      const item = queue.shift()!;
      const promise = processor(item)
        .then(() => {
          const index = active.indexOf(promise);
          if (index > -1) active.splice(index, 1);
        })
        .catch((err) => {
          const index = active.indexOf(promise);
          if (index > -1) active.splice(index, 1);
          throw err;
        });
      active.push(promise);
    }

    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}

/** Parse LRC format back to array of translation strings */
export function parseLrcToTranslations(lrc: string): string[] {
  const lines: string[] = [];
  const lineRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

  for (const line of lrc.split("\n")) {
    const match = line.trim().match(lineRegex);
    if (match) {
      lines.push(match[4].trim());
    }
  }

  return lines;
}
