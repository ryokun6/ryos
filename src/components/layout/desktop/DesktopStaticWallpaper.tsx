import { useEffect, useRef, useState } from "react";
import { INDEXEDDB_PREFIX } from "@/stores/useDisplaySettingsStore";
import { isDynamicWallpaper } from "@/utils/dynamicWallpaper";
import { useWallpaper } from "@/hooks/useWallpaper";

/** Crossfade duration (ms) when swapping between static wallpaper images. */
const CROSSFADE_MS = 500;

interface StaticWallpaperLayer {
  /** Stable key so React keeps each layer's DOM node across re-renders. */
  id: number;
  src: string;
  isTiled: boolean;
}

/**
 * Whether `wallpaperSource` resolves to a plain static image we paint via a
 * `background-image` layer (photos, tiles, and custom blob: URLs). Videos and
 * dynamic descriptors are painted by their own dedicated layers, so we ignore
 * them here. Unresolved `indexeddb://` / shuffle descriptors are skipped until
 * the store resolves them to a concrete asset.
 */
function isStaticImageWallpaper(source: string, isVideo: boolean): boolean {
  if (!source) return false;
  if (isVideo) return false;
  if (source.startsWith(INDEXEDDB_PREFIX)) return false;
  if (isDynamicWallpaper(source)) return false;
  return true;
}

/**
 * Renders static photo / tile wallpapers as stacked `background-image` layers
 * and crossfades between them.
 *
 * Why a dedicated layer instead of the desktop div's own `background-image`:
 * `transition: background-image` is not actually animatable, so swapping the
 * wallpaper used to clear the old image and pop the new one in only once it had
 * downloaded — a visible blank flash. Here we preload (and decode) the next
 * image off the critical path, then mount a new layer on top of the current one
 * and fade *only its opacity* in. Once the fade completes we drop the layers
 * underneath, so at most a couple of full-screen layers ever exist at once.
 *
 * Performance notes:
 * - Only `opacity` animates, which the compositor handles on the GPU.
 * - `will-change: opacity` is applied solely to the actively fading layer and
 *   removed as soon as it settles, so we never permanently promote a layer.
 * - A token guards against races when the source changes again mid-preload
 *   (rapid wallpaper picks / shuffle rotation), so stale images never appear.
 */
export function DesktopStaticWallpaper() {
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();
  const [layers, setLayers] = useState<StaticWallpaperLayer[]>([]);
  // Mirror of `layers` so the effect can read the current top without listing
  // `layers` as a dependency (which would re-run the preload on every prune).
  const layersRef = useRef<StaticWallpaperLayer[]>([]);
  layersRef.current = layers;
  const layerIdRef = useRef(0);
  const preloadTokenRef = useRef(0);

  useEffect(() => {
    // Invalidate any in-flight preload from a previous source.
    const token = ++preloadTokenRef.current;

    if (!isStaticImageWallpaper(wallpaperSource, isVideoWallpaper)) {
      // A video / dynamic layer is taking over (or there is no wallpaper):
      // clear our layers so a stale image doesn't bleed through.
      if (layersRef.current.length > 0) setLayers([]);
      return;
    }

    const top = layersRef.current[layersRef.current.length - 1];
    if (top && top.src === wallpaperSource) return;

    const isTiled = wallpaperSource.includes("/wallpapers/tiles/");

    const reveal = () => {
      if (token !== preloadTokenRef.current) return;
      const id = ++layerIdRef.current;
      setLayers((prev) => [...prev, { id, src: wallpaperSource, isTiled }]);
    };

    const img = new Image();
    img.decoding = "async";
    img.src = wallpaperSource;

    // Prefer decode() so the bitmap is ready before we paint, avoiding jank as
    // the new layer mounts. decode() can reject (e.g. cross-origin without
    // CORS) — fall back to load events in that case.
    img
      .decode()
      .then(reveal)
      .catch(() => {
        if (token !== preloadTokenRef.current) return;
        if (img.complete && img.naturalWidth > 0) {
          reveal();
        } else {
          img.onload = reveal;
        }
      });
  }, [wallpaperSource, isVideoWallpaper]);

  // Once the top (incoming) layer finishes fading in, drop everything beneath
  // it so only the visible wallpaper layer remains mounted.
  const handleFadeEnd = (id: number) => {
    setLayers((prev) => {
      const idx = prev.findIndex((layer) => layer.id === id);
      if (idx <= 0) return prev;
      return prev.slice(idx);
    });
  };

  return (
    <>
      {layers.map((layer, index) => {
        const isTop = index === layers.length - 1;
        // The very first layer (nothing beneath it) and each incoming layer
        // fade in; settled lower layers stay fully opaque underneath.
        const isFadingIn = isTop;
        return (
          <div
            key={layer.id}
            aria-hidden
            className="absolute inset-0 w-full h-full z-[-10]"
            onAnimationEnd={isTop ? () => handleFadeEnd(layer.id) : undefined}
            style={{
              backgroundImage: `url(${layer.src})`,
              backgroundSize: layer.isTiled ? "64px 64px" : "cover",
              backgroundRepeat: layer.isTiled ? "repeat" : "no-repeat",
              backgroundPosition: "center",
              animation: isFadingIn
                ? `desktop-wallpaper-fade-in ${CROSSFADE_MS}ms ease-in-out`
                : undefined,
              willChange: isFadingIn ? "opacity" : undefined,
            }}
          />
        );
      })}
    </>
  );
}
