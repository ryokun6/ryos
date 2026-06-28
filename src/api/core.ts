import { abortableFetch, type AbortableFetchOptions } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { getEffectiveTimezone } from "@/lib/timezoneConfig";

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  payload?: ApiErrorPayload;

  constructor(status: number, message: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = payload?.code;
    this.payload = payload;
  }
}

export interface ApiRequestOptions<TBody = unknown> {
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: TBody;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeout?: number;
  retry?: AbortableFetchOptions["retry"];
}

export function getBrowserTimeZone(): string | null {
  if (typeof Intl === "undefined") {
    return null;
  }

  // Honor the International control panel preference (`auto` or a saved IANA id).
  try {
    const timeZone = getEffectiveTimezone();
    return timeZone && timeZone !== "Unknown" ? timeZone : null;
  } catch {
    return null;
  }
}

export function getBrowserTimeZoneHeaders(): Record<string, string> {
  const timeZone = getBrowserTimeZone();
  return timeZone ? { "X-User-Timezone": timeZone } : {};
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>
): string {
  const relativePath = path.startsWith("/") ? path : `/${path}`;
  if (!query) return getApiUrl(relativePath);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  const queryString = params.toString();
  return getApiUrl(queryString ? `${relativePath}?${queryString}` : relativePath);
}

function buildHeaders(
  headers: HeadersInit | undefined,
  hasBody: boolean
): Headers {
  const merged = new Headers(headers);
  const timeZone = getBrowserTimeZone();
  if (timeZone && !merged.has("X-User-Timezone")) {
    merged.set("X-User-Timezone", timeZone);
  }
  if (hasBody && !merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }
  return merged;
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const data = (await response.json()) as ApiErrorPayload;
    return data ?? {};
  } catch {
    return {};
  }
}

async function performApiRequest<TBody = unknown>(
  options: ApiRequestOptions<TBody>
): Promise<Response> {
  const {
    path,
    method = "GET",
    query,
    body,
    headers,
    signal,
    timeout = 15000,
    retry,
  } = options;

  const hasBody = body !== undefined;
  const normalizedMethod = method.toUpperCase();
  const retryConfig =
    retry ??
    (normalizedMethod === "GET"
      ? { maxAttempts: 2, initialDelayMs: 500 }
      : { maxAttempts: 1, initialDelayMs: 250 });

  return abortableFetch(buildUrl(path, query), {
    method,
    headers: buildHeaders(headers, hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
    signal,
    timeout,
    throwOnHttpError: false,
    retry: retryConfig,
  });
}

export async function apiRequestRaw<TBody = unknown>(
  options: ApiRequestOptions<TBody>
): Promise<Response> {
  return performApiRequest(options);
}

export async function apiRequest<TResponse, TBody = unknown>(
  options: ApiRequestOptions<TBody>
): Promise<TResponse> {
  const response = await performApiRequest(options);

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    const message =
      payload.error ||
      payload.message ||
      `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, message, payload);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
