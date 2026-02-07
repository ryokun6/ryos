export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Concurrency must be a positive integer");
  }

  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let currentIndex = 0;
  let fatalError: unknown = null;

  async function runWorker(): Promise<void> {
    while (true) {
      if (fatalError) return;

      const index = currentIndex;
      currentIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        fatalError = error;
        return;
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => runWorker())
  );

  if (fatalError) {
    throw fatalError;
  }

  return results;
}

export function resolveBoundedConcurrency(
  rawValue: string | undefined,
  fallback: number,
  min: number = 1,
  max: number = 20
): number {
  if (!Number.isInteger(fallback) || fallback < min || fallback > max) {
    throw new Error("Fallback concurrency must be within bounds");
  }

  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue.trim(), 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}
