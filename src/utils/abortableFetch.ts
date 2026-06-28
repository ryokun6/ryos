/**
 * Fetch wrapper with timeout, abort support, and optional retry logic
 */

export interface AbortableFetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether non-2xx responses should throw errors (default: true) */
  throwOnHttpError?: boolean;
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
    throwOnHttpError = true,
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
    // Deterministic flag so the catch block can distinguish a timeout-triggered
    // abort from an intentional external-signal cancellation. We do NOT rely on
    // `fetch` forwarding `controller.abort(reason)` to the rejection because
    // that is not guaranteed across runtimes (e.g. Bun/Vite).
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
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
        credentials: "include",
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      // Clean up event listener to prevent memory leaks
      if (abortHandler && externalSignal) {
        externalSignal.removeEventListener("abort", abortHandler);
      }

      if (throwOnHttpError && !response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      // Clean up event listener to prevent memory leaks
      if (abortHandler && externalSignal) {
        externalSignal.removeEventListener("abort", abortHandler);
      }

      // Timeout path: surface an explicit TimeoutError. Checked before the
      // AbortError branch because the timeout fires via `controller.abort()`,
      // which makes `fetch` reject with an AbortError.
      if (timedOut) {
        const timeoutError = new Error(
          `Request timed out after ${timeout}ms`
        );
        timeoutError.name = "TimeoutError";
        if (attempt >= maxAttempts) {
          throw timeoutError;
        }

        const delayMs =
          initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        retry?.onRetry?.(attempt, delayMs, timeoutError);

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (externalSignal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        attempt++;
        continue;
      }

      // Don't retry on intentional cancellations. An external-signal / unmount
      // abort stays an AbortError so callers keep treating it as a silent,
      // expected cancellation rather than a real failure.
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
