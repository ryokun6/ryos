import { useEffect, useReducer, type Dispatch } from "react";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  createInitialLinkPreviewState,
  linkPreviewReducer,
} from "../linkPreviewReducer";
import type { LinkPreviewAction, LinkPreviewState } from "../types";
import { extractYouTubeVideoId, isYouTubeUrl } from "../utils";

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

        if (url.includes("/ipod/") || url.includes("/karaoke/")) {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            try {
              const youtubeResponse = await abortableFetch(
                `/api/link-preview?url=${encodeURIComponent(
                  `https://www.youtube.com/watch?v=${videoId}`
                )}`,
                {
                  signal: abortController.signal,
                  timeout: 15000,
                  retry: { maxAttempts: 2, initialDelayMs: 500 },
                }
              );

              const youtubeData = await youtubeResponse.json();
              if (!youtubeData.error && isActive && !abortController.signal.aborted) {
                dispatch({
                  type: "fetchSuccess",
                  metadata: {
                    title: youtubeData.title,
                    description: youtubeData.description,
                    image:
                      youtubeData.image ||
                      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    siteName: "YouTube",
                    url: url,
                  },
                });
                return;
              }
            } catch (youtubeError) {
              if (
                youtubeError instanceof Error &&
                youtubeError.name === "AbortError"
              ) {
                return;
              }
              console.warn(
                "Failed to fetch YouTube metadata, using fallback:",
                youtubeError
              );
            }

            if (!isActive || abortController.signal.aborted) return;
            dispatch({
              type: "fetchSuccess",
              metadata: {
                title: `YouTube Video ${videoId}`,
                description: "Watch on YouTube",
                image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                siteName: "YouTube",
                url: url,
              },
            });
            return;
          }
        }

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
