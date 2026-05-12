import { CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface FadeInImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
  /**
   * Tailwind / CSS class for the gray placeholder shown until the
   * image has finished loading. Defaults to a neutral mid-gray
   * (`bg-neutral-400`) that reads well on both the dark classic /
   * karaoke Cover Flow backdrop and the white modern iPod skin.
   * The placeholder is absolutely positioned and fills the parent —
   * the parent must already establish a positioning context (e.g.
   * `relative`, `absolute`, or be the descendant of one).
   */
  placeholderClassName?: string;
  placeholderStyle?: CSSProperties;
  /** Fade-in duration in ms. Defaults to 250ms. */
  durationMs?: number;
  /**
   * Optional callback fired once the image's load handler runs (or
   * once we detect the image was cached and is already complete).
   * Useful for gating sibling elements (e.g. a reflection) on the
   * same image becoming visible.
   */
  onLoaded?: () => void;
  /**
   * When false, holds the image at opacity 0 even after it has
   * loaded — lets a caller suppress display until an external gate
   * (e.g. main sleeve loaded) flips. Defaults to true.
   */
  visible?: boolean;
  /**
   * When false, suppresses the gray placeholder. Useful for
   * secondary surfaces like reflections where the parent already
   * provides its own backdrop and a separate placeholder would
   * read as a heavy block.
   */
  showPlaceholder?: boolean;
}

/**
 * Image that shows a gray placeholder until it has finished
 * loading, then fades in via a CSS opacity transition. Resets the
 * loaded state whenever `src` changes so navigating between covers
 * always replays the fade-in. Handles browser-cached images by
 * inspecting `complete` / `naturalWidth` on mount and on src
 * change — `onLoad` may not fire for images served from cache.
 */
export function FadeInImage({
  src,
  alt,
  className,
  style,
  draggable,
  placeholderClassName,
  placeholderStyle,
  durationMs = 250,
  onLoaded,
  visible = true,
  showPlaceholder = true,
}: FadeInImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // Stash `onLoaded` in a ref so callers can pass a fresh arrow
  // function each render without us re-running the reset effect
  // (which would flash the placeholder back on every parent
  // re-render for in-flight images).
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    setLoaded(false);
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setLoaded(true);
      onLoadedRef.current?.();
    }
  }, [src]);

  const showImage = loaded && visible;

  return (
    <>
      {showPlaceholder && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity",
            placeholderClassName ?? "bg-neutral-400"
          )}
          style={{
            opacity: showImage ? 0 : 1,
            transitionDuration: `${durationMs}ms`,
            ...placeholderStyle,
          }}
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ""}
        draggable={draggable}
        className={className}
        style={{
          ...style,
          opacity: showImage ? 1 : 0,
          transition: `opacity ${durationMs}ms ease-out`,
        }}
        onLoad={() => {
          setLoaded(true);
          onLoadedRef.current?.();
        }}
      />
    </>
  );
}
