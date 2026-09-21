/** Bound memory/network usage, and settle active workers before callers close resources. */
export async function forEachTransfer<T>(
  items: readonly T[],
  action: (item: T, index: number) => Promise<void>,
  concurrency = 3
): Promise<void> {
  let next = 0;
  const failures: unknown[] = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        try {
          await action(items[index], index);
        } catch (error) {
          failures.push(error);
        }
      }
    })
  );
  if (failures.length) throw failures[0];
}
