import { ApiRequestError } from "@/api/core";

function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  Object.defineProperty(error, "cause", {
    configurable: true,
    value: cause,
  });
  return error;
}

export function normalizeLyricsFetchError(err: unknown): unknown {
  if (err instanceof ApiRequestError && err.status === 404) {
    return errorWithCause("No lyrics found", err);
  }
  if (err instanceof ApiRequestError) {
    return errorWithCause(`Failed to fetch lyrics (status ${err.status})`, err);
  }
  return err;
}

export function isExpectedLyricsMissError(err: unknown): boolean {
  if (err instanceof ApiRequestError && err.status === 404) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("No lyrics") ||
    msg.includes("404") ||
    msg.includes("not found")
  );
}

export function getLyricsErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Lyrics search timed out.";
  }
  const msg = err instanceof Error ? err.message : "Unknown error";
  const isNoLyricsError =
    msg.includes("500") ||
    msg.includes("404") ||
    msg.includes("No lyrics") ||
    msg.includes("not found");
  return isNoLyricsError ? "No lyrics available" : msg;
}
