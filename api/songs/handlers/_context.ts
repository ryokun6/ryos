import type { VercelResponse } from "@vercel/node";
import type { ApiHandlerContext } from "../../_utils/api-handler.js";

export const RATE_LIMITS = {
  get: { windowSeconds: 60, limit: 300 },
  fetchLyrics: { windowSeconds: 60, limit: 30 },
  searchLyrics: { windowSeconds: 60, limit: 60 },
  translateStream: { windowSeconds: 60, limit: 10 },
  furiganaStream: { windowSeconds: 60, limit: 10 },
  soramimiStream: { windowSeconds: 60, limit: 10 },
};

export function sendSSEResponse(
  res: VercelResponse,
  origin: string | null,
  data: unknown
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  res.end();
}

export interface SongHandlerContext extends ApiHandlerContext<Record<string, unknown>> {
  songId: string;
  requestId: string;
  effectiveOrigin: string | null;
  jsonResponse: (
    data: unknown,
    status?: number,
    headers?: Record<string, string>
  ) => void;
  errorResponse: (message: string, status?: number) => void;
}

export function createSongHandlerContext(
  base: ApiHandlerContext<Record<string, unknown>>,
  songId: string,
  requestId: string
): SongHandlerContext {
  const effectiveOrigin = base.origin;

  const jsonResponse = (
    data: unknown,
    status = 200,
    headers: Record<string, string> = {}
  ) => {
    Object.entries(headers).forEach(([key, value]) => {
      base.res.setHeader(key, value);
    });
    base.logger.response(status, Date.now() - base.startTime);
    return base.res.status(status).json(data);
  };

  const errorResponse = (message: string, status = 400) => {
    base.logger.info(`Response: ${status} - ${message}`);
    return jsonResponse({ error: message }, status);
  };

  return {
    ...base,
    songId,
    requestId,
    effectiveOrigin,
    jsonResponse,
    errorResponse,
  };
}
