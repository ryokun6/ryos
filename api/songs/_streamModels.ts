/**
 * OpenAI models for lyrics annotation SSE streams (furigana / soramimi / translate).
 * Override via env for experiments — soramimi defaults to gpt-5.4 after gpt-5.5 stall reports.
 */
export const FURIGANA_STREAM_MODEL =
  process.env.FURIGANA_STREAM_MODEL?.trim() || "gpt-5.4";

export const SORAMIMI_STREAM_MODEL =
  process.env.SORAMIMI_STREAM_MODEL?.trim() || "gpt-5.4";

export const TRANSLATE_STREAM_MODEL =
  process.env.TRANSLATE_STREAM_MODEL?.trim() || "gpt-5.5";

/** Abort if streamText yields no chunks for this long (prevents hung SSE). */
export const STREAM_TEXT_CHUNK_TIMEOUT_MS = 90_000;

/**
 * Wrap an async iterable with a per-chunk timeout so hung model streams fail fast.
 */
export async function* withStreamChunkTimeout<T>(
  source: AsyncIterable<T>,
  timeoutMs: number = STREAM_TEXT_CHUNK_TIMEOUT_MS,
  label = "Model stream"
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = await Promise.race([
      iterator.next(),
      new Promise<IteratorResult<T>>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out waiting for data`)),
          timeoutMs
        );
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    if (next.done) {
      return;
    }
    yield next.value;
  }
}
