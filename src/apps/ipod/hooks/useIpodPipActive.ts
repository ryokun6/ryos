import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useIpodActiveLibrary } from "@/apps/ipod/hooks/useIpodActiveLibrary";

/**
 * True when the iPod "pop player" (Picture-in-Picture mini player) is currently
 * shown on screen. Mirrors the render condition in `IpodPipPlayer`: an open iPod
 * window is minimized (and not full-screen) while a current track is loaded.
 *
 * Useful for desktop chrome (e.g. the lyrics wallpaper) that needs to reserve
 * extra bottom clearance so it doesn't sit underneath the floating player.
 */
export function useIpodPipActive(): boolean {
  const ipodMinimized = useAppStore((s) =>
    Object.values(s.instances).some(
      (instance) =>
        instance.appId === "ipod" && instance.isOpen && instance.isMinimized
    )
  );
  const isFullScreen = useIpodStore((s) => s.isFullScreen);
  const { tracks, currentIndex } = useIpodActiveLibrary();

  return (
    ipodMinimized && !isFullScreen && tracks.length > 0 && currentIndex >= 0
  );
}
