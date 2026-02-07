/**
 * Fetch wrapper with timeout, abort support, and optional retry logic
 */

export interface AbortableFetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    /** Maximum number of retry attempts (default: 3) */
    maxAttempts?: number;
    /** Initial delay in milliseconds (default: 1000) */
    initialDelayMs?: number;
    /** Backoff multiplier (default: 2) */
    backoffMultiplier?: number;
    /** Callback when retry occurs */
    onRetry?: (attempt: number, delayMs: number, error: Error) => void;
  };
}

/**
 * Fetch with timeout and abort support
 * Optionally supports retry with exponential backoff
 */
export async function abortableFetch(
  url: string,
  options: AbortableFetchOptions = {}
): Promise<Response> {
  const {
    timeout = 60000,
    retry,
    signal: externalSignal,
    ...fetchOptions
  } = options;

  const maxAttempts = retry?.maxAttempts ?? 3;
  const initialDelayMs = retry?.initialDelayMs ?? 1000;
  const backoffMultiplier = retry?.backoffMultiplier ?? 2;

  let attempt = 1;

  while (attempt <= maxAttempts) {
    // Create abort controller for this attempt
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    // Combine external signal with our controller
    // Use a named handler so we can remove it later to prevent memory leaks
    let abortHandler: (() => void) | undefined;
    if (externalSignal) {
      // If external signal aborts, abort our controller too
      abortHandler = () => controller.abort();
      externalSignal.addEventListener("abort", abortHandler);
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      // Clean up event listener to prevent memory leaks
      if (abortHandler && externalSignal) {
        externalSignal.removeEventListener("abort", abortHandler);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      // Clean up event listener to prevent memory leaks
      if (abortHandler && externalSignal) {
        externalSignal.removeEventListener("abort", abortHandler);
      }

      // Don't retry on abort errors
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }

      // If this was the last attempt, throw the error
      if (attempt >= maxAttempts) {
        throw err;
      }

      // Calculate delay for next retry
      const delayMs = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      retry?.onRetry?.(attempt, delayMs, err as Error);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Check if aborted during delay
      if (externalSignal?.aborted || controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      attempt++;
    }
  }

  throw new Error("Unreachable: retry loop exhausted");
}
