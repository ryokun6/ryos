import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export async function decodeShareLink(
  code: string
): Promise<{ url: string; year: string } | null> {
  const response = await abortableFetch(
    getApiUrl(`/api/share-link?action=decode&code=${encodeURIComponent(code)}`),
    {
      method: "GET",
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as { url: string; year: string };
}
