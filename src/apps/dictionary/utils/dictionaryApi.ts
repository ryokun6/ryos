import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import type {
  DictionaryAiMode,
  DictionaryAiResponse,
  DictionaryLanguage,
  DictionaryLookupResponse,
  DictionaryQueryLanguage,
} from "@/shared/dictionary";
import { dedupeDictionaryLookup } from "@/shared/dictionaryMerge";
import {
  extrasToDictionaryNotes,
  reduceDictionaryAiUiChunk,
  takeDictionaryAiSseEvents,
  type DictionaryAiUiChunk,
} from "./dictionaryAiStream";
import { readDictionaryClientCache, writeDictionaryClientCache } from "./dictionaryLookupCache";

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
  signal?: AbortSignal,
  options?: {
    locale?: string;
    /** Called when Wiktionary examples arrive. The local result is already returned. */
    onEnrichment?: (response: DictionaryLookupResponse) => void;
  }
): Promise<DictionaryLookupResponse> {
  const locale = options?.locale;
  const cached = readDictionaryClientCache(query, lang, locale);
  if (cached) return cached;
  const params = new URLSearchParams({ q: query, lang });
  if (locale) params.set("locale", locale);
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
  const body = dedupeDictionaryLookup((await response.json()) as DictionaryLookupResponse);
  if (!body.enrichmentPending || !options?.onEnrichment) {
    writeDictionaryClientCache(query, lang, body, locale);
    return body;
  }
  const enrichParams = new URLSearchParams(params);
  void abortableFetch(getApiUrl(`/api/dictionary/enrich?${enrichParams.toString()}`), {
    method: "GET",
    signal,
    timeout: 8000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 200 },
  })
    .then(async (enrichResponse) => {
      if (!enrichResponse.ok || signal?.aborted) return;
      const enriched = dedupeDictionaryLookup(
        (await enrichResponse.json()) as DictionaryLookupResponse
      );
      if (signal?.aborted) return;
      writeDictionaryClientCache(query, lang, enriched, locale);
      options.onEnrichment?.(enriched);
    })
    .catch(() => undefined);
  return body;
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

function notesFromAiResponse(data: DictionaryAiResponse): string {
  if (typeof data.notes === "string" && data.notes.trim()) return data.notes;
  if (data.extras) return extrasToDictionaryNotes(data.extras);
  return "";
}

/**
 * Extras mode uses the same UI-message SSE stream as Chats.
 * A Redis hit is one JSON body and is delivered in a single callback.
 */
export async function streamDictionaryAiExtras(
  word: string,
  lang: DictionaryLanguage,
  locale: string,
  onNotes: (notes: string) => void,
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
    const notes = notesFromAiResponse(data);
    if (notes) onNotes(notes);
    return;
  }

  const body = response.body;
  if (!body) throw new DictionaryApiError("ai_unavailable", 502);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let notes = "";
  const applyEvent = (payload: string) => {
    let chunk: DictionaryAiUiChunk;
    try {
      chunk = JSON.parse(payload) as DictionaryAiUiChunk;
    } catch {
      throw new DictionaryApiError("ai_unavailable", 502);
    }
    const next = reduceDictionaryAiUiChunk(notes, chunk);
    if (next.error) throw new DictionaryApiError(next.error, 502);
    if (next.notes !== notes) {
      notes = next.notes;
      onNotes(notes);
    }
  };
  try {
    while (!requestSignal.aborted) {
      const { done, value } = await readStreamChunk(reader, requestSignal);
      buffer += decoder.decode(value, { stream: !done });
      const taken = takeDictionaryAiSseEvents(buffer);
      buffer = taken.rest;
      for (const event of taken.events) applyEvent(event);
      if (done) break;
    }
    if (buffer.includes("data:") && !requestSignal.aborted) {
      try {
        const taken = takeDictionaryAiSseEvents(buffer.endsWith("\n\n") ? buffer : `${buffer}\n\n`);
        for (const event of taken.events) applyEvent(event);
      } catch {
        // A trailing partial frame is not a failed note. Completed events already rendered.
      }
    }
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
