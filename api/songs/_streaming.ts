import type { VercelResponse } from "@vercel/node";

export type SseEventSender = (
  eventType: string,
  data: Record<string, unknown>
) => void;

/**
 * Set up native SSE response headers for the lyrics streaming actions
 * (translate-stream / furigana-stream / soramimi-stream) and return a
 * `sendEvent` helper.
 *
 * The event `type` is embedded in the JSON payload (not the SSE event name)
 * for client compatibility — the lyrics clients read `type` off the data
 * object. This contract is shared verbatim by all three streaming actions.
 */
export function startLyricsSseResponse(
  res: VercelResponse,
  effectiveOrigin: string | null | undefined
): SseEventSender {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (effectiveOrigin) {
    res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
  }
  return (eventType, data) => {
    res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
  };
}
