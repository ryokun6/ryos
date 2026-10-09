import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import type {
  DictionaryAiExtras,
  DictionaryAiMode,
  DictionaryAiResponse,
  DictionaryLanguage,
  DictionaryLookupResponse,
  DictionaryQueryLanguage,
} from "@/shared/dictionary";
import {
  normalizeDictionaryAiExtras,
  parseDictionaryAiStreamLine,
  takeDictionaryAiStreamLines,
} from "./dictionaryAiStream";

export class DictionaryApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DictionaryApiError";
  }
}

async function readError(response: Response): Promise<DictionaryApiError> {
  let message = `HTTP ${response.status}`;
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data?.error === "string") message = data.error;
  } catch {
    // Non-JSON error body; keep the status message.
  }
  return new DictionaryApiError(message, response.status);
}

export async function lookupDictionaryWord(
  query: string,
  lang: DictionaryQueryLanguage,
  signal?: AbortSignal
): Promise<DictionaryLookupResponse> {
  const params = new URLSearchParams({ q: query, lang });
  const response = await abortableFetch(
    getApiUrl(`/api/dictionary?${params.toString()}`),
    {
      method: "GET",
      signal,
      timeout: 20000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 200 },
    }
  );
  if (!response.ok) throw await readError(response);
  return (await response.json()) as DictionaryLookupResponse;
}

export async function askDictionaryAi(
  word: string,
  lang: DictionaryLanguage,
  mode: DictionaryAiMode,
  locale: string,
  signal?: AbortSignal
): Promise<DictionaryAiResponse> {
  const response = await abortableFetch(getApiUrl("/api/dictionary/ai"), {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, lang, mode, locale }),
    timeout: 45000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 200 },
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as DictionaryAiResponse;
}

const EXTRAS_STREAM_TIMEOUT_MS = 90_000;

/** Unblock a body read as soon as the caller aborts, instead of waiting for the next chunk. */
function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/**
 * Extras mode streams NDJSON partials. A cache hit is still one JSON body.
 * Calls `onExtras` as soon as the notes have visible text.
 */
export async function streamDictionaryAiExtras(
  word: string,
  lang: DictionaryLanguage,
  locale: string,
  onExtras: (extras: DictionaryAiExtras) => void,
  signal?: AbortSignal
): Promise<void> {
  const timeoutSignal = AbortSignal.timeout(EXTRAS_STREAM_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(getApiUrl("/api/dictionary/ai"), {
    method: "POST",
    credentials: "include",
    signal: requestSignal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, lang, mode: "extras", locale }),
  });
  if (!response.ok) throw await readError(response);

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as DictionaryAiResponse;
    if (data.extras) onExtras(normalizeDictionaryAiExtras(data.extras));
    return;
  }

  const body = response.body;
  if (!body) throw new DictionaryApiError("ai_unavailable", 502);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const apply = (line: string) => {
    const message = parseDictionaryAiStreamLine(line);
    if (message.error) throw new DictionaryApiError(message.error, 502);
    if (message.extras) onExtras(normalizeDictionaryAiExtras(message.extras));
  };
  try {
    while (!requestSignal.aborted) {
      const { done, value } = await readStreamChunk(reader, requestSignal);
      buffer += decoder.decode(value, { stream: !done });
      const taken = takeDictionaryAiStreamLines(buffer);
      buffer = taken.rest;
      for (const line of taken.lines) apply(line);
      if (done) break;
    }
    if (buffer.trim() && !requestSignal.aborted) apply(buffer);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (!signal?.aborted && timeoutSignal.aborted) {
      throw new DictionaryApiError("ai_unavailable", 502);
    }
    throw error;
  } finally {
    if (requestSignal.aborted) await reader.cancel().catch(() => undefined);
  }
}
