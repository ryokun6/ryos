import { abortableFetch, type AbortableFetchOptions } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export interface ApiAuthContext {
  username?: string | null;
  token?: string | null;
}

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
  auth?: ApiAuthContext;
  headers?: HeadersInit;
  timeout?: number;
  retry?: AbortableFetchOptions["retry"];
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
  auth: ApiAuthContext | undefined,
  hasBody: boolean
): Headers {
  const merged = new Headers(headers);
  if (hasBody && !merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }

  if (auth?.token && auth?.username) {
    merged.set("Authorization", `Bearer ${auth.token}`);
    merged.set("X-Username", auth.username);
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

export async function apiRequest<TResponse, TBody = unknown>(
  options: ApiRequestOptions<TBody>
): Promise<TResponse> {
  const {
    path,
    method = "GET",
    query,
    body,
    auth,
    headers,
    timeout = 15000,
    retry = { maxAttempts: 1, initialDelayMs: 250 },
  } = options;

  const hasBody = body !== undefined;
  const response = await abortableFetch(buildUrl(path, query), {
    method,
    headers: buildHeaders(headers, auth, hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
    timeout,
    throwOnHttpError: false,
    retry,
  });

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

