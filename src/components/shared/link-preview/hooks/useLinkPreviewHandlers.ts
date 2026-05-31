import type { MouseEvent, TouchEvent } from "react";
import { toast } from "sonner";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { extractYouTubeVideoId } from "../utils";

export function useLinkPreviewHandlers(url: string) {
  const launchApp = useLaunchApp();

  const handleAddToIpod = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    try {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        launchApp("ipod", { initialData: { videoId } });
      } else {
        toast.error("Could not extract video ID from this YouTube URL");
        console.warn("Could not extract video ID from YouTube URL:", url);
      }
    } catch (error) {
      toast.error("Failed to open video in iPod app");
      console.error("Error launching iPod app:", error);
    }
  };

  const handleOpenInKaraoke = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    try {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        launchApp("karaoke", { initialData: { videoId } });
      } else {
        toast.error("Could not extract video ID from this URL");
        console.warn("Could not extract video ID from URL:", url);
      }
    } catch (error) {
      toast.error("Failed to open video in Karaoke app");
      console.error("Error launching Karaoke app:", error);
    }
  };

  const handleOpenYouTube = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    if (url.includes("/ipod/") || url.includes("/karaoke/")) {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        window.open(youtubeUrl, "_blank", "noopener,noreferrer");
        return;
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenExternally = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return {
    handleAddToIpod,
    handleOpenInKaraoke,
    handleOpenYouTube,
    handleOpenExternally,
  };
}
