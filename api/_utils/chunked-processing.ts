/**
 * Chunked processing utilities for parallel processing with concurrency control
 */

export const DEFAULT_CHUNK_SIZE = 15;
export const MAX_PARALLEL_CHUNKS = 3;

export interface ChunkMetadata<T> {
  chunk: T[];
  startIndex: number;
  chunkIndex: number;
}

/**
 * Split an array into chunks with metadata
 */
export function createChunks<T>(items: T[], chunkSize = DEFAULT_CHUNK_SIZE): ChunkMetadata<T>[] {
  const chunks: ChunkMetadata<T>[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push({
      chunk: items.slice(i, i + chunkSize),
      startIndex: i,
      chunkIndex: chunks.length,
    });
  }
  return chunks;
}

/**
 * Process chunks with limited concurrency
 */
export async function processChunksWithConcurrency<T, R>(
  chunks: ChunkMetadata<T>[],
  processor: (chunkData: ChunkMetadata<T>) => Promise<R>,
  maxParallel = MAX_PARALLEL_CHUNKS
): Promise<R[]> {
  const results: R[] = new Array(chunks.length);
  let activePromises: Promise<void>[] = [];
  let queueIndex = 0;

  while (queueIndex < chunks.length) {
    while (activePromises.length < maxParallel && queueIndex < chunks.length) {
      const chunkData = chunks[queueIndex];
      const currentIndex = queueIndex;
      queueIndex++;

      const promise = processor(chunkData).then((result) => {
        results[currentIndex] = result;
        activePromises = activePromises.filter((p) => p !== promise);
      });
      activePromises.push(promise);
    }

    if (activePromises.length >= maxParallel) {
      await Promise.race(activePromises);
    }
  }

  await Promise.all(activePromises);
  return results;
}
