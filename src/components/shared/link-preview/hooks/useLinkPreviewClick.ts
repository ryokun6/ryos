import type { MouseEvent, TouchEvent } from "react";
import { toast } from "sonner";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { extractYouTubeVideoId, isTouchDevice, isYouTubeUrl } from "../utils";

export function useLinkPreviewClick(url: string) {
  const launchApp = useLaunchApp();

  const handleClick = (e?: MouseEvent | TouchEvent) => {
    if (e && "touches" in e && isTouchDevice()) {
      e.stopPropagation();
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (isYouTubeUrl(url)) {
      if (url.includes("/ipod/")) {
        try {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            console.log(
              `[LinkPreview] Adding iPod link to iPod with videoId: ${videoId}`
            );
            launchApp("ipod", { initialData: { videoId } });
          } else {
            toast.error("Could not extract video ID from this iPod URL");
            console.warn("Could not extract video ID from iPod URL:", url);
          }
        } catch (error) {
          toast.error("Failed to open video in iPod app");
          console.error("Error launching iPod app:", error);
        }
      } else if (url.includes("/karaoke/")) {
        try {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            console.log(
              `[LinkPreview] Adding Karaoke link to Karaoke with videoId: ${videoId}`
            );
            launchApp("karaoke", { initialData: { videoId } });
          } else {
            toast.error("Could not extract video ID from this Karaoke URL");
            console.warn("Could not extract video ID from Karaoke URL:", url);
          }
        } catch (error) {
          toast.error("Failed to open video in Karaoke app");
          console.error("Error launching Karaoke app:", error);
        }
      } else {
        try {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            console.log(
              `[LinkPreview] Launching Videos app with videoId: ${videoId}`
            );
            launchApp("videos", { initialData: { videoId } });
          } else {
            console.warn(
              "Could not extract video ID from YouTube URL, opening in browser:",
              url
            );
            window.open(url, "_blank", "noopener,noreferrer");
          }
        } catch (error) {
          console.error(
            "Error launching Videos app, opening in browser:",
            error
          );
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    } else {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, "");
      const path = urlObj.pathname + urlObj.search;
      const cleanUrl = domain + path;

      launchApp("internet-explorer", {
        initialData: { url: cleanUrl, year: "current" },
      });
    }
  };

  return handleClick;
}
