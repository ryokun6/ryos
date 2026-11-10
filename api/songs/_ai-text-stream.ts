/**
 * Consume AI SDK streamText fullStream as text deltas, failing on provider
 * error / abort parts.
 *
 * `result.textStream` (via toTextStream) only forwards `text-delta` and
 * silently drops `error` / `abort`, so iterating textStream alone treats a
 * failed or timed-out generation as a successful empty/partial completion.
 */

export class LyricsAiStreamError extends Error {
  readonly kind: "error" | "abort";

  constructor(kind: "error" | "abort", message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LyricsAiStreamError";
    this.kind = kind;
  }
}

export type LyricsAiStreamPart =
  | { type: "text-delta"; text: string }
  | { type: "error"; error: unknown }
  | { type: "abort"; reason?: string }
  | { type: string; [key: string]: unknown };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "AI stream failed";
}

/**
 * Yield text deltas from a fullStream-like async iterable.
 * Throws {@link LyricsAiStreamError} when the provider emits `error` or `abort`.
 */
export async function* textDeltasFromFullStream(
  stream: AsyncIterable<LyricsAiStreamPart>
): AsyncGenerator<string, void, undefined> {
  for await (const part of stream) {
    if (part.type === "error") {
      throw new LyricsAiStreamError("error", errorMessage(part.error), {
        cause: part.error,
      });
    }
    if (part.type === "abort") {
      const reason =
        typeof part.reason === "string" && part.reason.trim()
          ? part.reason
          : "AI stream aborted";
      throw new LyricsAiStreamError("abort", reason);
    }
    if (part.type === "text-delta" && typeof part.text === "string") {
      yield part.text;
    }
  }
}
