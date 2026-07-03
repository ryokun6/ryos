import { useEffect } from "react";

/**
 * Mounts the MediaCore runtime (now-playing bus + single-active playback
 * arbitration) once at the app root. The runtime module subscribes to the
 * full iPod / Karaoke / Videos / TV store stack, so it is loaded lazily to
 * keep those stores out of the boot chunk.
 */
export function MediaCoreRunner() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    import("@/shared/media/mediaCoreRuntime").then((module) => {
      if (cancelled) return;
      cleanup = module.initMediaCoreRuntime();
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return null;
}
