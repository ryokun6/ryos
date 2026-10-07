import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import type {
  DictionaryAiMode,
  DictionaryAiResponse,
  DictionaryLanguage,
  DictionaryLookupResponse,
  DictionaryQueryLanguage,
} from "@/shared/dictionary";

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
