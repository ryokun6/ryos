import { useCallback, useRef } from "react";
import { useEventListener } from "@/hooks/useEventListener";

export function useDesktopVideoWallpaper(isVideoWallpaper: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const resumeVideoPlayback = useCallback(async () => {
    if (!isVideoWallpaper || !videoRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.ended) {
        video.currentTime = 0;
      }

      if (video.readyState >= 3) {
        await video.play();
      } else {
        const handleCanPlay = () => {
          video.play().catch((err) => {
            console.warn("Could not resume video playback:", err);
          });
          video.removeEventListener("canplay", handleCanPlay);
        };
        video.addEventListener("canplay", handleCanPlay);
      }
    } catch (err) {
      console.warn("Could not resume video playback:", err);
    }
  }, [isVideoWallpaper]);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === "visible") {
      resumeVideoPlayback();
    }
  }, [resumeVideoPlayback]);

  const handleFocus = useCallback(() => {
    resumeVideoPlayback();
  }, [resumeVideoPlayback]);

  const handleCanPlayThrough = useCallback(() => {
    if (!isVideoWallpaper || !videoRef.current) return;

    const video = videoRef.current;
    if (video.paused) {
      video.play().catch((err) => {
        console.warn("Could not start video playback:", err);
      });
    }
  }, [isVideoWallpaper]);

  useEventListener(
    "visibilitychange",
    handleVisibilityChange,
    isVideoWallpaper ? document : null
  );
  useEventListener("focus", handleFocus, isVideoWallpaper ? window : null);
  useEventListener(
    "canplaythrough",
    handleCanPlayThrough,
    isVideoWallpaper ? videoRef : null
  );

  return { videoRef };
}
