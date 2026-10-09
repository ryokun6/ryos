/**
 * Chrome, Safari, and Firefox each phrase a failed dynamic import differently.
 * These are usually a one-shot HMR race, not a broken module.
 */
const TRANSIENT_DYNAMIC_IMPORT =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isTransientDynamicImportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_DYNAMIC_IMPORT.test(message);
}

/** Retry once when a lazy app chunk fails to fetch. Other errors propagate immediately. */
export async function loadLazyModuleWithRetry<T>(
  importFn: () => Promise<T>,
  retryDelayMs = 200
): Promise<T> {
  try {
    return await importFn();
  } catch (error) {
    if (!isTransientDynamicImportError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return importFn();
  }
}
