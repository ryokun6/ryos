/**
 * Per-character stroke JSON from hanzi-writer-data, fetched on demand.
 * A missing character rejects so the card can fall back to a static glyph.
 */
const STROKE_DATA_URL = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/";

export type HanziStrokeCharData = Record<string, unknown>;

const cache = new Map<string, Promise<HanziStrokeCharData>>();

export function loadHanziStrokeData(char: string): Promise<HanziStrokeCharData> {
  const cached = cache.get(char);
  if (cached) return cached;
  const pending = fetch(`${STROKE_DATA_URL}${encodeURIComponent(char)}.json`).then(async (response) => {
    if (!response.ok) throw new Error(`missing stroke data for ${char}`);
    return (await response.json()) as HanziStrokeCharData;
  });
  const tracked = pending.catch((error: unknown) => {
    cache.delete(char);
    throw error;
  });
  cache.set(char, tracked);
  return tracked;
}

export type HanziCharDataLoader = (
  char: string,
  onLoad: (data: HanziStrokeCharData) => void,
  onError?: (error?: unknown) => void,
  signal?: AbortSignal
) => void;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/**
 * hanzi-writer `charDataLoader`. Failures call `onError` instead of throwing.
 * An aborted signal drops the result so a disposed card cannot apply it.
 */
export const hanziCharDataLoader: HanziCharDataLoader = (
  char,
  onLoad,
  onError,
  signal
) => {
  if (signal?.aborted) {
    onError?.(abortError());
    return;
  }
  let dropped = false;
  const drop = () => {
    dropped = true;
  };
  signal?.addEventListener("abort", drop, { once: true });
  loadHanziStrokeData(char).then(
    (data) => {
      signal?.removeEventListener("abort", drop);
      if (dropped || signal?.aborted) {
        onError?.(abortError());
        return;
      }
      onLoad(data);
    },
    (error: unknown) => {
      signal?.removeEventListener("abort", drop);
      if (dropped || signal?.aborted) {
        onError?.(abortError());
        return;
      }
      onError?.(error);
    }
  );
};
