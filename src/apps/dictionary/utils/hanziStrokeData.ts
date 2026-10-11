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

/** hanzi-writer `charDataLoader`. Failures call `onError` instead of throwing. */
export function hanziCharDataLoader(
  char: string,
  onLoad: (data: HanziStrokeCharData) => void,
  onError?: (error?: unknown) => void
): void {
  loadHanziStrokeData(char).then(onLoad, (error: unknown) => onError?.(error));
}
