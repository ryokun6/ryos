import { useEffect, useState } from "react";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { isAppleMusicId } from "@/utils/appleMusicId";

/**
 * Lazily resolves Apple Music cover art for an `am:` song that has no stored
 * cover, via `/api/apple-music-artwork`. Returns a cover URL template (with
 * `{w}`/`{h}` placeholders) or null. Results are memoized module-wide and
 * in-flight requests deduped so rendering many rows only fetches each id once.
 */

const artworkCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

async function fetchArtworkTemplate(id: string): Promise<string | null> {
  const existing = inFlight.get(id);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await abortableFetch(
        getApiUrl(`/api/apple-music-artwork?id=${encodeURIComponent(id)}`),
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { cover?: string | null };
      return data.cover ?? null;
    } catch {
      return null;
    } finally {
      inFlight.delete(id);
    }
  })();

  inFlight.set(id, request);
  return request;
}

export function useAppleMusicArtwork(
  id: string,
  options: { enabled: boolean }
): string | null {
  const { enabled } = options;
  const [template, setTemplate] = useState<string | null>(
    () => artworkCache.get(id) ?? null
  );

  useEffect(() => {
    if (!enabled || !isAppleMusicId(id)) return;

    if (artworkCache.has(id)) {
      setTemplate(artworkCache.get(id) ?? null);
      return;
    }

    let cancelled = false;
    void fetchArtworkTemplate(id).then((result) => {
      artworkCache.set(id, result);
      if (!cancelled) setTemplate(result);
    });
    return () => {
      cancelled = true;
    };
  }, [id, enabled]);

  return enabled ? template : null;
}
