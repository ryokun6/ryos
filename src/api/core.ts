import { abortableFetch, type AbortableFetchOptions } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

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

const isRawRequestBody = (body: unknown): body is BodyInit => {
  if (typeof body === "string") return true;
  if (typeof Blob !== "undefined" && body instanceof Blob) return true;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    return true;
  }
  if (body instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(body)) return true;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return true;
  }

  return false;
};

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
  body: unknown
): Headers {
  const merged = new Headers(headers);
  if (body !== undefined && !isRawRequestBody(body) && !merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }
  return merged;
}

function buildRequestBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  return isRawRequestBody(body) ? body : JSON.stringify(body);
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
    retry = { maxAttempts: 1, initialDelayMs: 250 },
  } = options;

  return abortableFetch(buildUrl(path, query), {
    method,
    headers: buildHeaders(headers, body),
    body: buildRequestBody(body),
    signal,
    timeout,
    throwOnHttpError: false,
    retry,
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
