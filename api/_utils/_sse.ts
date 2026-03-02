/**
 * Server-Sent Events (SSE) streaming utilities for API endpoints
 */

/**
 * Create an SSE stream with helper methods for sending events
 */
export interface SSEController {
  enqueue: (data: unknown) => void;
  sendChunk: (
    chunkIndex: number,
    totalChunks: number,
    startIndex: number,
    data: unknown,
    completedCount: number
  ) => void;
  sendComplete: (totalLines: number) => void;
  sendError: (message: string) => void;
  close: () => void;
}

export function createSSEStream(
  handler: (controller: SSEController) => Promise<void>
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const sseController: SSEController = {
        enqueue: (data) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        },
        sendChunk: (chunkIndex, totalChunks, startIndex, data, completedCount) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "chunk",
                chunkIndex,
                totalChunks,
                startIndex,
                ...(typeof data === "object" && data !== null ? data : { data }),
                completedCount,
              })}\n\n`
            )
          );
        },
        sendComplete: (totalLines) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                totalLines,
              })}\n\n`
            )
          );
        },
        sendError: (message) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message,
              })}\n\n`
            )
          );
        },
        close: () => controller.close(),
      };

      try {
        await handler(sseController);
      } catch (error) {
        sseController.sendError(
          error instanceof Error ? error.message : "Unknown error"
        );
      } finally {
        controller.close();
      }
    },
  });
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
