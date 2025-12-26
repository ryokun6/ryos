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
}

// =============================================================================
// Constants
// =============================================================================

const MAX_CONCURRENT_CHUNKS = 2;
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
 * If prefetchedInfo is provided, skips the initial get-chunk-info call.
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

  // Track initial chunk from get-chunk-info response (avoids re-fetching chunk 0)
  let initialChunkData: { chunkIndex: number; startIndex: number; translations: string[] } | undefined;

  if (prefetchedInfo) {
    // Use pre-fetched info from initial lyrics request
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    if (prefetchedInfo.cached && prefetchedInfo.lrc) {
      cachedLrc = prefetchedInfo.lrc;
    }
  } else {
    // Fetch chunk info (makes extra API call but includes chunk 0 inline)
    // Use longer timeout since AI generates chunk 0 inline
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
      timeout: CHUNK_TIMEOUT, // Use same timeout as chunk processing (60s)
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
    // Capture initialChunk if present (chunk 0 processed inline)
    if (chunkInfo.initialChunk?.translations) {
      initialChunkData = chunkInfo.initialChunk;
    }
  }

  // If fully cached, return immediately
  if (cachedLrc) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return parseLrcToTranslations(cachedLrc);
  }

  // Process chunks
  const allTranslations: string[] = new Array(totalLines).fill("");
  const completedChunkSet = new Set<number>();
  let completedChunks = 0;

  // If we have initial chunk data, use it immediately
  if (initialChunkData) {
    initialChunkData.translations.forEach((text, i) => {
      const targetIndex = initialChunkData!.startIndex + i;
      if (targetIndex < allTranslations.length) {
        allTranslations[targetIndex] = text;
      }
    });
    completedChunkSet.add(initialChunkData.chunkIndex);
    completedChunks++;
    onProgress?.({
      completedChunks,
      totalChunks,
      percentage: Math.round((completedChunks / totalChunks) * 100),
    });
    onChunk?.(initialChunkData.chunkIndex, initialChunkData.startIndex, initialChunkData.translations);
  }

  // Only process chunks that haven't been completed yet
  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i).filter(i => !completedChunkSet.has(i));

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

      completedChunkSet.add(chunkIndex);
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
  if (completedChunkSet.size !== totalChunks) {
    const missing = chunkIndices.filter((i) => !completedChunkSet.has(i));
    throw new Error(`Translation incomplete: missing chunks ${missing.join(", ")}`);
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
        timeout: 30000,
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
 * If prefetchedInfo is provided, skips the initial get-chunk-info call.
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

  // Track initial chunk from get-chunk-info response (avoids re-fetching chunk 0)
  let initialChunkData: { chunkIndex: number; startIndex: number; furigana: Array<Array<{ text: string; reading?: string }>> } | undefined;

  if (prefetchedInfo) {
    // Use pre-fetched info from initial lyrics request
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    if (prefetchedInfo.cached && prefetchedInfo.data) {
      cachedData = prefetchedInfo.data;
    }
  } else {
    // Fetch chunk info (makes extra API call but includes chunk 0 inline)
    // Use longer timeout since AI generates chunk 0 inline
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "furigana",
        force,
      }),
      signal,
      timeout: CHUNK_TIMEOUT, // Use same timeout as chunk processing (60s)
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
    // Capture initialChunk if present (chunk 0 processed inline)
    if (chunkInfo.initialChunk?.furigana) {
      initialChunkData = chunkInfo.initialChunk;
    }
  }

  // If fully cached, return immediately
  if (cachedData) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return cachedData;
  }

  // Process chunks
  const allFurigana: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines).fill(null).map(() => []);
  const completedChunkSet = new Set<number>();
  let completedChunks = 0;

  // If we have initial chunk data, use it immediately
  if (initialChunkData) {
    initialChunkData.furigana.forEach((segments, i) => {
      const targetIndex = initialChunkData!.startIndex + i;
      if (targetIndex < allFurigana.length) {
        allFurigana[targetIndex] = segments;
      }
    });
    completedChunkSet.add(initialChunkData.chunkIndex);
    completedChunks++;
    onProgress?.({
      completedChunks,
      totalChunks,
      percentage: Math.round((completedChunks / totalChunks) * 100),
    });
    onChunk?.(initialChunkData.chunkIndex, initialChunkData.startIndex, initialChunkData.furigana);
  }

  // Only process chunks that haven't been completed yet
  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i).filter(i => !completedChunkSet.has(i));

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

      completedChunkSet.add(chunkIndex);
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
  if (completedChunkSet.size !== totalChunks) {
    const missing = chunkIndices.filter((i) => !completedChunkSet.has(i));
    throw new Error(`Furigana incomplete: missing chunks ${missing.join(", ")}`);
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
        timeout: 30000,
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
 * If prefetchedInfo is provided, skips the initial get-chunk-info call.
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

  // Track initial chunk from get-chunk-info response (avoids re-fetching chunk 0)
  let initialChunkData: { chunkIndex: number; startIndex: number; soramimi: Array<Array<{ text: string; reading?: string }>> } | undefined;

  if (prefetchedInfo) {
    // Use pre-fetched info from initial lyrics request
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    if (prefetchedInfo.cached && prefetchedInfo.data) {
      cachedData = prefetchedInfo.data;
    }
  } else {
    // Fetch chunk info (makes extra API call but includes chunk 0 inline)
    // Use longer timeout since AI generates chunk 0 inline
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "soramimi",
        force,
      }),
      signal,
      timeout: CHUNK_TIMEOUT, // Use same timeout as chunk processing (60s)
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk info (status ${res.status})`);
    }

    const chunkInfo = await res.json();
    totalLines = chunkInfo.totalLines;
    totalChunks = chunkInfo.totalChunks;
    if (chunkInfo.cached && chunkInfo.soramimi) {
      cachedData = chunkInfo.soramimi;
    }
    // Capture initialChunk if present (chunk 0 processed inline)
    if (chunkInfo.initialChunk?.soramimi) {
      initialChunkData = chunkInfo.initialChunk;
    }
  }

  // If fully cached, return immediately
  if (cachedData) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return cachedData;
  }

  // Process chunks
  const allSoramimi: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines).fill(null).map(() => []);
  const completedChunkSet = new Set<number>();
  let completedChunks = 0;

  // If we have initial chunk data, use it immediately
  if (initialChunkData) {
    initialChunkData.soramimi.forEach((segments, i) => {
      const targetIndex = initialChunkData!.startIndex + i;
      if (targetIndex < allSoramimi.length) {
        allSoramimi[targetIndex] = segments;
      }
    });
    completedChunkSet.add(initialChunkData.chunkIndex);
    completedChunks++;
    onProgress?.({
      completedChunks,
      totalChunks,
      percentage: Math.round((completedChunks / totalChunks) * 100),
    });
    onChunk?.(initialChunkData.chunkIndex, initialChunkData.startIndex, initialChunkData.soramimi);
  }

  // Only process chunks that haven't been completed yet
  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i).filter(i => !completedChunkSet.has(i));

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
        timeout: 30000,
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
