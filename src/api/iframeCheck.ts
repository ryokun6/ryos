import { abortableFetch } from "@/utils/abortableFetch";

export type IframeCheckMode = "check" | "proxy" | "ai" | "list-cache";

export function buildIframeCheckPath(params: {
  url: string;
  mode?: IframeCheckMode;
  year?: string;
  month?: string;
  theme?: string;
}): string {
  const query = new URLSearchParams({
    url: params.url,
  });

  if (params.mode) query.set("mode", params.mode);
  if (params.year) query.set("year", params.year);
  if (params.month) query.set("month", params.month);
  if (params.theme) query.set("theme", params.theme);

  return `/api/iframe-check?${query.toString()}`;
}

export async function listIframeCachedYears(
  url: string
): Promise<{ years: string[] }> {
  const response = await abortableFetch(
    buildIframeCheckPath({ url, mode: "list-cache" }),
    {
      timeout: 15000,
      retry: { maxAttempts: 2, initialDelayMs: 500 },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch cached years (${response.status})`);
  }

  return (await response.json()) as { years: string[] };
}

export async function fetchIframeAiSnapshot(
  params: {
    url: string;
    year: string;
    theme?: string;
  },
  options?: { signal?: AbortSignal }
): Promise<Response> {
  return abortableFetch(
    buildIframeCheckPath({
      url: params.url,
      mode: "ai",
      year: params.year,
      theme: params.theme,
    }),
    {
      signal: options?.signal,
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );
}
