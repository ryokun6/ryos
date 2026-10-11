import { useEffect, useReducer, type Dispatch } from "react";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  createInitialLinkPreviewState,
  linkPreviewReducer,
} from "../linkPreviewReducer";
import type { LinkPreviewAction, LinkPreviewState } from "../types";
import { isYouTubeUrl } from "../utils";

export function useLinkPreviewMetadata(url: string): [
  LinkPreviewState,
  Dispatch<LinkPreviewAction>,
] {
  const [state, dispatch] = useReducer(
    linkPreviewReducer,
    url,
    (u: string) => createInitialLinkPreviewState(u, isYouTubeUrl)
  );

  useEffect(() => {
    dispatch({
      type: "resetForUrl",
      isFullWidthThumbnail: isYouTubeUrl(url),
    });
    const abortController = new AbortController();
    let isActive = true;

    const fetchMetadata = async () => {
      try {
        if (!isActive || abortController.signal.aborted) return;
        dispatch({ type: "fetchStart" });

        // Karaoke and iPod share URLs are resolved server-side from the Redis
        // song library (YouTube oEmbed only if the song is not stored).
        const response = await abortableFetch(
          `/api/link-preview?url=${encodeURIComponent(url)}`,
          {
            signal: abortController.signal,
            timeout: 15000,
            retry: { maxAttempts: 2, initialDelayMs: 500 },
          }
        );

        const data = await response.json();
        if (!isActive || abortController.signal.aborted) return;

        if (data.error) {
          throw new Error(data.error);
        }

        dispatch({
          type: "fetchSuccess",
          metadata: {
            title: data.title,
            description: data.description,
            image: data.image,
            siteName: data.siteName,
            url: url,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        if (!isActive || abortController.signal.aborted) return;
        console.error("Error fetching link metadata:", err);
        dispatch({
          type: "fetchFailure",
          error: "Failed to load preview",
          metadata: {
            title: url,
            url: url,
          },
        });
      }
    };

    void fetchMetadata();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [url]);

  return [state, dispatch];
}
