import { useEffect, useRef, useState } from "react";
import { INDEXEDDB_PREFIX } from "@/stores/useDisplaySettingsStore";
import { isDynamicWallpaper } from "@/utils/dynamicWallpaper";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useWallpaperPlaceholders } from "@/hooks/useWallpaperPlaceholders";
import { getWallpaperPlaceholder } from "@/utils/wallpapers";
import { resolveStaticWallpaperRenderUrl } from "@/utils/staticWallpaperUrl";

/** Crossfade duration (ms) when swapping between static wallpaper layers. */
const CROSSFADE_MS = 500;
/** Fade-in duration (ms) for the full-resolution image over its placeholder. */
const FULL_FADE_MS = 600;
/** Padding (ms) after the full fade before pruning layers underneath. */
const PRUNE_BUFFER_MS = 80;

interface StaticWallpaperLayer {
  /** Stable key so React keeps each layer's DOM node across re-renders. */
  id: number;
  /** Stable persisted identity used for placeholders and shuffle equality. */
  canonicalSrc: string;
  /** Full-fidelity asset painted by this layer. */
  renderSrc: string;
  isTiled: boolean;
  /** Average color, painted instantly as a solid base (blur-up). */
  color?: string;
  /** Tiny blurred LQIP data URI, painted instantly while the full image loads. */
  blur?: string;
  /** Whether the full-resolution image has finished decoding. */
  loaded: boolean;
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

/** A layer "covers" what's beneath it once its opaque placeholder or full image is visible. */
function layerCovers(layer: StaticWallpaperLayer): boolean {
  return Boolean(layer.color || layer.blur || layer.loaded);
}

function loadDecodedImage(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (typeof image.decode !== "function") {
        resolve();
        return;
      }
      void image.decode().then(resolve).catch(() => resolve());
    };
    image.onerror = () => reject(new Error(`Unable to load ${source}`));
    image.src = source;
  });
}

/**
 * Renders static photo / tile wallpapers with a blur-up progressive load:
 * a solid average color and a tiny blurred placeholder appear instantly, then
 * the full-resolution image fades in on top once it has decoded. Swapping
 * between wallpapers crossfades the whole layer stack.
 *
 * Why a dedicated layer instead of the desktop div's own `background-image`:
 * `transition: background-image` is not actually animatable, so swapping the
 * wallpaper used to clear the old image and pop the new one in only once it had
 * downloaded — a visible blank flash. Here we mount a new layer on top of the
 * current one showing its color + blurred placeholder immediately, fade *only
 * its opacity* in, then fade the decoded full image in over the placeholder.
 * Once a layer is covering, we drop the layers underneath, so at most a couple
 * of full-screen layers ever exist at once.
 *
 * Performance notes:
 * - Only `opacity` animates, which the compositor handles on the GPU.
 * - `will-change: opacity` is applied solely to the actively fading layer.
 * - The blurred placeholder is an inline data URI (no extra network request).
 */
export function DesktopStaticWallpaper() {
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();
  const placeholders = useWallpaperPlaceholders();
  const [layers, setLayers] = useState<StaticWallpaperLayer[]>([]);
  // Mirror of `layers` so the effect can read the current top without listing
  // `layers` as a dependency (which would re-run the preload on every prune).
  const layersRef = useRef<StaticWallpaperLayer[]>([]);
  layersRef.current = layers;
  const layerIdRef = useRef(0);
  const placeholdersRef = useRef(placeholders);
  placeholdersRef.current = placeholders;

  useEffect(() => {
    if (!isStaticImageWallpaper(wallpaperSource, isVideoWallpaper)) {
      // A video / dynamic layer is taking over (or there is no wallpaper):
      // clear our layers so a stale image doesn't bleed through.
      if (layersRef.current.length > 0) setLayers([]);
      return;
    }

    const renderSource = resolveStaticWallpaperRenderUrl(wallpaperSource);
    const top = layersRef.current[layersRef.current.length - 1];
    if (
      top &&
      top.canonicalSrc === wallpaperSource &&
      top.renderSrc === renderSource
    ) {
      return;
    }

    const isTiled = wallpaperSource.includes("/wallpapers/tiles/");
    const placeholder = getWallpaperPlaceholder(
      wallpaperSource,
      placeholdersRef.current
    );

    // Mount the new layer immediately with its instant placeholder so there's
    // never a blank gap; the full image fades in once it decodes.
    const id = ++layerIdRef.current;
    setLayers((prev) => [
      ...prev,
      {
        id,
        canonicalSrc: wallpaperSource,
        renderSrc: renderSource,
        isTiled,
        color: placeholder?.color,
        // Tiles repeat at 64px, so a blurred LQIP is meaningless for them.
        blur: isTiled ? undefined : placeholder?.blur,
        loaded: false,
      },
    ]);

    let cancelled = false;
    const markLoaded = (loadedSource: string) => {
      if (cancelled) return;
      setLayers((prev) =>
        prev.map((layer) =>
          layer.id === id
            ? { ...layer, renderSrc: loadedSource, loaded: true }
            : layer
        )
      );
    };

    void loadDecodedImage(renderSource)
      .then(() => markLoaded(renderSource))
      .catch(() => {
        // Keep the placeholder visible when the canonical source is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [wallpaperSource, isVideoWallpaper]);

  // Backfill placeholders onto layers created before the placeholder map loaded
  // (e.g. cold start, where the persisted wallpaper paints before the fetch).
  useEffect(() => {
    if (!placeholders) return;
    setLayers((prev) => {
      let changed = false;
      const next = prev.map((layer) => {
        if (layer.color || layer.blur) return layer;
        const ph = getWallpaperPlaceholder(layer.canonicalSrc, placeholders);
        if (!ph) return layer;
        changed = true;
        return {
          ...layer,
          color: ph.color,
          blur: layer.isTiled ? undefined : ph.blur,
        };
      });
      return changed ? next : prev;
    });
  }, [placeholders]);

  // Drop every layer beneath the one identified by `id`.
  const pruneBeneath = (id: number) => {
    setLayers((prev) => {
      const idx = prev.findIndex((layer) => layer.id === id);
      if (idx <= 0) return prev;
      return prev.slice(idx);
    });
  };

  // Once the top (incoming) layer's opaque placeholder finishes fading in, drop
  // everything beneath it. Only safe when the layer actually covers the stack.
  const handleFadeEnd = (layer: StaticWallpaperLayer) => {
    if (layerCovers(layer)) pruneBeneath(layer.id);
  };

  // Safety prune: once the top layer's full image is visible, drop everything
  // beneath it after the full fade settles. Guarantees cleanup even when the
  // placeholder-cover prune (onAnimationEnd) doesn't apply (no placeholder).
  const topLayer = layers[layers.length - 1];
  const topLoaded = topLayer?.loaded ?? false;
  const topId = topLayer?.id;
  useEffect(() => {
    if (!topLoaded || topId === undefined || layers.length <= 1) return;
    const t = setTimeout(
      () => pruneBeneath(topId),
      FULL_FADE_MS + PRUNE_BUFFER_MS
    );
    return () => clearTimeout(t);
  }, [topLoaded, topId, layers.length]);

  return (
    <>
      {layers.map((layer, index) => {
        const isTop = index === layers.length - 1;
        // The first layer (nothing beneath it) and each incoming layer fade in;
        // settled lower layers stay fully opaque underneath.
        const isFadingIn = isTop;
        const bgSize = layer.isTiled ? "64px 64px" : "cover";
        const bgRepeat = layer.isTiled ? "repeat" : "no-repeat";
        return (
          <div
            key={layer.id}
            aria-hidden
            className="absolute inset-0 w-full h-full z-[-10] overflow-hidden"
            onAnimationEnd={isTop ? () => handleFadeEnd(layer) : undefined}
            style={{
              backgroundColor: layer.color,
              animation: isFadingIn
                ? `desktop-wallpaper-fade-in ${CROSSFADE_MS}ms ease-in-out`
                : undefined,
              willChange: isFadingIn ? "opacity" : undefined,
            }}
          >
            {layer.blur && (
              <div
                className="absolute inset-0 w-full h-full"
                style={{
                  backgroundImage: `url(${layer.blur})`,
                  backgroundSize: bgSize,
                  backgroundRepeat: bgRepeat,
                  backgroundPosition: "center",
                  // Smooth the upscaled LQIP; scale hides blurred edge bleed.
                  filter: "blur(24px)",
                  transform: "scale(1.1)",
                }}
              />
            )}
            <div
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: `url(${layer.renderSrc})`,
                backgroundSize: bgSize,
                backgroundRepeat: bgRepeat,
                backgroundPosition: "center",
                opacity: layer.loaded ? 1 : 0,
                transition: `opacity ${FULL_FADE_MS}ms ease-in-out`,
              }}
            />
          </div>
        );
      })}
    </>
  );
}
