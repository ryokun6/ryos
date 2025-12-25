/**
 * Client-side utilities for chunked streaming API calls
 * Handles processing large requests chunk-by-chunk to avoid edge function timeouts
 */

import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

export interface ChunkInfo {
  totalLines: number;
  totalChunks: number;
  chunkSize: number;
  cached: boolean;
}

export interface ChunkProgress {
  completedChunks: number;
  totalChunks: number;
  percentage: number;
}

export interface ChunkResult<T> {
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  data: T;
  cached: boolean;
}

interface ChunkInfoResponse extends ChunkInfo {
  translation?: string;
  furigana?: unknown[][];
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

const MAX_CONCURRENT_CHUNKS = 2; // Limit concurrent requests to avoid overwhelming the server
const CHUNK_TIMEOUT = 60000; // 60 seconds per chunk
const SAVE_TIMEOUT = 15000; // 15 seconds for saving consolidated result

/**
 * Get chunk info for an operation (translation or furigana)
 * Returns cached result immediately if available
 */
export async function getChunkInfo(
  songId: string,
  operation: "translate" | "furigana",
  language?: string,
  signal?: AbortSignal
): Promise<ChunkInfoResponse> {
  const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get-chunk-info",
      operation,
      ...(language ? { language } : {}),
    }),
    signal,
    timeout: 15000,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to get chunk info (status ${res.status})`);
  }

  return res.json();
}

/**
 * Save consolidated translation to song document
 * Called after all chunks have been processed so future requests get instant cached results
 */
async function saveConsolidatedTranslation(
  songId: string,
  language: string,
  translations: string[],
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-translation",
        language,
        translations,
      }),
      signal,
      timeout: SAVE_TIMEOUT,
    });

    if (!res.ok) {
      console.warn(`Failed to save consolidated translation (status ${res.status})`);
    }
  } catch (err) {
    // Don't throw - this is a best-effort operation
    console.warn("Failed to save consolidated translation:", err);
  }
}

/**
 * Save consolidated furigana to song document
 * Called after all chunks have been processed so future requests get instant cached results
 */
async function saveConsolidatedFurigana(
  songId: string,
  furigana: Array<Array<{ text: string; reading?: string }>>,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-furigana",
        furigana,
      }),
      signal,
      timeout: SAVE_TIMEOUT,
    });

    if (!res.ok) {
      console.warn(`Failed to save consolidated furigana (status ${res.status})`);
    }
  } catch (err) {
    // Don't throw - this is a best-effort operation
    console.warn("Failed to save consolidated furigana:", err);
  }
}

/**
 * Process translation chunks with streaming progress
 */
export async function processTranslationChunks(
  songId: string,
  language: string,
  options: {
    force?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: ChunkProgress) => void;
    onChunk?: (chunkIndex: number, startIndex: number, translations: string[]) => void;
  } = {}
): Promise<string[]> {
  const { force, signal, onProgress, onChunk } = options;

  // First get chunk info (and check for cached result)
  const chunkInfo = await getChunkInfo(songId, "translate", language, signal);

  // If fully cached, return immediately
  if (chunkInfo.cached && chunkInfo.translation) {
    onProgress?.({ completedChunks: chunkInfo.totalChunks, totalChunks: chunkInfo.totalChunks, percentage: 100 });
    // Parse the cached LRC back to translations array
    return parseLrcToTranslations(chunkInfo.translation);
  }

  const { totalChunks } = chunkInfo;
  const allTranslations: string[] = new Array(chunkInfo.totalLines).fill("");
  let completedChunks = 0;

  // Process chunks with limited concurrency
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
      });

      if (!res.ok) {
        throw new Error(`Chunk ${chunkIndex} failed (status ${res.status})`);
      }

      const result = await res.json() as TranslateChunkResponse;
      
      // Validate startIndex is a valid non-negative number
      if (typeof result.startIndex !== 'number' || result.startIndex < 0 || !Number.isFinite(result.startIndex)) {
        console.warn(`Invalid startIndex ${result.startIndex} in chunk ${chunkIndex}, skipping`);
        return;
      }
      
      // Store translations in correct positions with bounds checking
      result.translations.forEach((text, i) => {
        const targetIndex = result.startIndex + i;
        if (targetIndex < allTranslations.length) {
          allTranslations[targetIndex] = text;
        } else {
          console.warn(`Translation bounds exceeded: index ${targetIndex} >= array length ${allTranslations.length} (chunk ${chunkIndex})`);
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

  // Save consolidated result so future requests get instant cached results
  // This runs in the background - we don't await it to avoid blocking the UI
  saveConsolidatedTranslation(songId, language, allTranslations, signal);

  return allTranslations;
}

/**
 * Process furigana chunks with streaming progress
 */
export async function processFuriganaChunks(
  songId: string,
  options: {
    force?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: ChunkProgress) => void;
    onChunk?: (chunkIndex: number, startIndex: number, furigana: Array<Array<{ text: string; reading?: string }>>) => void;
  } = {}
): Promise<Array<Array<{ text: string; reading?: string }>>> {
  const { force, signal, onProgress, onChunk } = options;

  // First get chunk info (and check for cached result)
  const chunkInfo = await getChunkInfo(songId, "furigana", undefined, signal);

  // If fully cached, return immediately
  if (chunkInfo.cached && chunkInfo.furigana) {
    onProgress?.({ completedChunks: chunkInfo.totalChunks, totalChunks: chunkInfo.totalChunks, percentage: 100 });
    return chunkInfo.furigana as Array<Array<{ text: string; reading?: string }>>;
  }

  const { totalChunks, totalLines } = chunkInfo;
  const allFurigana: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines);
  let completedChunks = 0;

  // Process chunks with limited concurrency
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
      });

      if (!res.ok) {
        throw new Error(`Chunk ${chunkIndex} failed (status ${res.status})`);
      }

      const result = await res.json() as FuriganaChunkResponse;
      
      // Validate startIndex is a valid non-negative number
      if (typeof result.startIndex !== 'number' || result.startIndex < 0 || !Number.isFinite(result.startIndex)) {
        console.warn(`Invalid startIndex ${result.startIndex} in chunk ${chunkIndex}, skipping`);
        return;
      }
      
      // Store furigana in correct positions with bounds checking
      result.furigana.forEach((segments, i) => {
        const targetIndex = result.startIndex + i;
        if (targetIndex < allFurigana.length) {
          allFurigana[targetIndex] = segments;
        } else {
          console.warn(`Furigana bounds exceeded: index ${targetIndex} >= array length ${allFurigana.length} (chunk ${chunkIndex})`);
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

  // Save consolidated result so future requests get instant cached results
  // This runs in the background - we don't await it to avoid blocking the UI
  saveConsolidatedFurigana(songId, allFurigana, signal);

  return allFurigana;
}

/**
 * Process items with limited concurrency
 */
async function processWithConcurrency<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  maxConcurrent: number
): Promise<void> {
  const queue = [...items];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    // Start new tasks up to maxConcurrent
    while (active.length < maxConcurrent && queue.length > 0) {
      const item = queue.shift()!;
      const promise = processor(item).then(() => {
        const index = active.indexOf(promise);
        if (index > -1) active.splice(index, 1);
      }).catch((err) => {
        const index = active.indexOf(promise);
        if (index > -1) active.splice(index, 1);
        throw err;
      });
      active.push(promise);
    }

    // Wait for at least one to complete
    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}

/**
 * Parse LRC format back to array of translation strings
 */
function parseLrcToTranslations(lrc: string): string[] {
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
