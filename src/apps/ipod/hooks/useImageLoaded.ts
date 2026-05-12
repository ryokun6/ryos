import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether the `<img>` referenced by `ref` has finished
 * loading the given `src`. Resets on `src` change. Catches
 * browser-cached images that may already be `complete` by the
 * time the ref is attached — `onLoad` may not fire in that case.
 *
 * Usage:
 *
 *   const cover = useImageLoaded(coverUrl);
 *   <img
 *     ref={cover.ref}
 *     src={coverUrl}
 *     onLoad={cover.onLoad}
 *     style={{
 *       opacity: cover.loaded ? 1 : 0,
 *       transition: "opacity 250ms ease-out",
 *     }}
 *   />
 *
 * The caller supplies the placeholder (typically as the wrapping
 * element's `background`) so this hook stays purely about load
 * state, not chrome.
 */
export function useImageLoaded(src: string | null | undefined) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const img = ref.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return {
    ref,
    loaded,
    onLoad: () => setLoaded(true),
  };
}
