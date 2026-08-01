import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

export interface BarcodeLookupResult {
  found: boolean;
  title?: string;
  brand?: string;
  imageUrl?: string;
  productUrl?: string;
  source?: string;
}

export async function lookupBarcode(
  barcode: string
): Promise<BarcodeLookupResult> {
  const response = await abortableFetch(
    getApiUrl(
      `/api/stuff/barcode-lookup?barcode=${encodeURIComponent(barcode)}`
    ),
    {
      method: "GET",
      timeout: 12000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 200 },
    }
  );

  if (!response.ok) {
    return { found: false };
  }

  return (await response.json()) as BarcodeLookupResult;
}

/** Fetch a remote product image and convert to a local data URL for storage. */
export async function fetchImageAsDataUrl(
  url: string
): Promise<string | undefined> {
  try {
    const response = await abortableFetch(url, {
      method: "GET",
      timeout: 10000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 200 },
    });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return undefined;
    // Cap at ~1.5MB to keep IndexedDB payloads reasonable
    if (blob.size > 1.5 * 1024 * 1024) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}
