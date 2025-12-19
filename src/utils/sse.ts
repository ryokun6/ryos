/**
 * Server-Sent Events (SSE) stream processing utilities
 */

export interface BaseSSEEvent {
  type: "chunk" | "complete" | "error";
}

export interface SSEChunkEvent<T> extends BaseSSEEvent {
  type: "chunk";
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  data: T;
  completedCount?: number;
}

export interface SSECompleteEvent extends BaseSSEEvent {
  type: "complete";
  totalLines?: number;
}

export interface SSEErrorEvent extends BaseSSEEvent {
  type: "error";
  message: string;
}

export type SSEEvent<T> = SSEChunkEvent<T> | SSECompleteEvent | SSEErrorEvent;

export interface SSEStreamOptions<T> {
  response: Response;
  signal?: AbortSignal;
  onChunk: (event: SSEChunkEvent<T>) => void;
  onComplete?: (event: SSECompleteEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Check if a response is an SSE stream
 */
export function isSSEResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/event-stream");
}

/**
 * Parse and process SSE events from a Response stream
 * Handles the common SSE parsing logic: reading chunks, splitting by "\n\n",
 * parsing "data: " prefixed lines, and calling appropriate callbacks.
 */
export async function processSSEStream<T>({
  response,
  signal,
  onChunk,
  onComplete,
  onError,
}: SSEStreamOptions<T>): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (signal?.aborted) {
        reader.cancel();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const sseLines = buffer.split("\n\n");
      buffer = sseLines.pop() || "";

      for (const sseLine of sseLines) {
        if (sseLine.startsWith("data: ")) {
          try {
            const eventData = JSON.parse(sseLine.slice(6)) as SSEEvent<T>;

            if (eventData.type === "chunk") {
              onChunk(eventData as SSEChunkEvent<T>);
            } else if (eventData.type === "complete") {
              onComplete?.(eventData);
            } else if (eventData.type === "error") {
              throw new Error(eventData.message);
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.warn("Failed to parse SSE event:", parseError);
            } else {
              // Re-throw non-parse errors (like Error from error event)
              throw parseError;
            }
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") {
      onError?.(error);
    }
    throw error;
  }
}
