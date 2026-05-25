import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type AnimationEvent,
  type CSSProperties,
} from "react";
import { cn } from "@/lib/utils";

interface ScrollingTextProps {
  text: string;
  className?: string;
  isPlaying?: boolean;
  align?: "center" | "left";
  fadeEdges?: boolean;
  /** When false, overflow is ignored for marquee — static text only (e.g. while a parent width is animating). */
  allowMarquee?: boolean;
  /** Seconds to wait before the marquee starts (each scroll cycle still runs full duration). */
  scrollStartDelaySec?: number;
  /**
   * When `true`, toggling `isPlaying` to `false` snaps the text back to its
   * starting position (the marquee track is unmounted instead of pausing
   * mid-scroll). The right-edge truncation fade still renders so overflowing
   * labels remain hinted. Use for selection-driven marquees (e.g. iPod menu
   * rows) where deselection should reset the row.
   *
   * Defaults to `false` — legacy "freeze in place" behavior that matches the
   * real iPod Now Playing screen, which keeps the marquee paused at the
   * current offset when the user pauses playback.
   */
  resetOnPause?: boolean;
  style?: CSSProperties;
  /** Changes when the menu column is split (50%) vs full width. */
  labelLayoutKey?: string;
}

/**
 * The visible label width is the ScrollingText container's own width. Menu row
 * layout already reserves chevron/value space outside this container, matching
 * the behavior of the working song menus.
 */
function getLabelClipWidth(container: HTMLElement): number {
  return container.getBoundingClientRect().width;
}

export function ScrollingText({
  text,
  className,
  isPlaying = true,
  align = "center",
  fadeEdges = false,
  allowMarquee = true,
  scrollStartDelaySec = 0,
  resetOnPause = false,
  style,
  labelLayoutKey,
}: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  /** Edge fade only after the marquee actually runs (skips delay + paused-before-start). */
  const [edgeFadeActive, setEdgeFadeActive] = useState(false);
  const paddingWidth = 20; // Width of padding between text duplicates

  const durationSec = Math.max(text.length * 0.15, 8);

  const measureOverflow = useCallback(() => {
    const container = containerRef.current;
    const measureEl = measureRef.current;
    if (!container || !measureEl) return;

    const containerWidth = getLabelClipWidth(container);
    if (containerWidth <= 0) {
      setShouldScroll((prev) => (prev ? false : prev));
      return;
    }

    // `getBoundingClientRect().width` is sub-pixel; `scrollWidth` is rounded
    // up to the nearest integer, which biases toward overflow. Use the rect
    // for both so a 0.4px overhang doesn't trigger a marquee.
    const contentWidth = measureEl.getBoundingClientRect().width;
    const nextShouldScroll = contentWidth > containerWidth + 0.5;
    setShouldScroll((prev) => (prev === nextShouldScroll ? prev : nextShouldScroll));
  }, []);

  useEffect(() => {
    const shouldMeasureForMarquee =
      allowMarquee && (!resetOnPause || isPlaying);
    if (!shouldMeasureForMarquee) {
      setShouldScroll((prev) => (prev ? false : prev));
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measureOverflow);
    };

    scheduleMeasure();

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(container);
    const measureEl = measureRef.current;
    if (measureEl) resizeObserver.observe(measureEl);

    // The split/full menu panel uses a 300ms CSS width transition.
    // ResizeObserver fires throughout that animation, but if any frame is
    // skipped or coalesced the LAST measurement can land at an in-flight
    // (still-too-wide) width, leaving `shouldScroll` stuck at false even
    // though the row will end up overflowing at 50%. Schedule a final
    // measure AFTER the transition settles so the resting width always
    // wins, regardless of intermediate frames.
    const settleTimeout = window.setTimeout(scheduleMeasure, 350);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimeout);
      resizeObserver.disconnect();
    };
  }, [
    text,
    allowMarquee,
    resetOnPause,
    isPlaying,
    labelLayoutKey,
    measureOverflow,
  ]);

  // When `resetOnPause` is enabled and we're paused, drop the marquee track
  // entirely so the duplicated text snaps back to translate(0). The static
  // branch always gets the right-edge truncation fade below when `fadeEdges`
  // is on (the mask is a no-op when text doesn't reach the fade region).
  const isResetPaused = resetOnPause && !isPlaying;
  const showMarquee = shouldScroll && allowMarquee && !isResetPaused;

  useEffect(() => {
    setEdgeFadeActive(false);
  }, [text, showMarquee, scrollStartDelaySec, fadeEdges]);

  const handleMarqueeAnimationStart = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.includes("scrolling-text-marquee")) return;
    setEdgeFadeActive(true);
  }, []);

  const fadeInset = "0.75em";
  // Right-only fade: keep text crisp on the left, hint overflow on the right.
  // Used for the idle/pre-start frame of the marquee AND as the default
  // when `fadeEdges` is enabled — the mask is invisible when text doesn't
  // reach the masked region, so applying it unconditionally costs nothing
  // visually and removes the dependency on overflow detection for the
  // truncation hint. (Hard-cut without fade was the regression.)
  const rightOnlyFadeGradient = `linear-gradient(to right, black 0, black calc(100% - ${fadeInset}), transparent 100%)`;
  // Full fade: hides the seam at both edges while the marquee loops.
  const bothEdgesFadeGradient = `linear-gradient(to right, transparent 0, black ${fadeInset}, black calc(100% - ${fadeInset}), transparent 100%)`;
  const maskImage = !fadeEdges
    ? undefined
    : showMarquee
      ? edgeFadeActive
        ? bothEdgesFadeGradient
        : rightOnlyFadeGradient
      : rightOnlyFadeGradient;
  const alignClass = align === "left" ? "justify-start" : "justify-center";
  const textAlignClass = align === "left" ? "text-left" : "text-center";
  const mergedStyle: CSSProperties = {
    ...style,
    maskImage,
    WebkitMaskImage: maskImage,
    clipPath: style?.clipPath,
  };

  const marqueeStyle: CSSProperties & {
    ["--scrolling-text-duration"]?: string;
    ["--scrolling-text-delay"]?: string;
  } = {
    "--scrolling-text-duration": `${durationSec}s`,
    "--scrolling-text-delay":
      scrollStartDelaySec > 0 ? `${scrollStartDelaySec}s` : "0s",
    animationPlayState: isPlaying ? "running" : "paused",
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        // Use `overflow-hidden` on both axes — pairing `overflow-x: hidden` with
        // `overflow-y: visible` is invalid per spec and resolves to `overflow-y: auto`,
        // which can show vertical scrollbars on the title row.
        "relative flex min-h-min min-w-0 items-center overflow-hidden",
        alignClass,
        className
      )}
      style={mergedStyle}
    >
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 whitespace-nowrap opacity-0"
      >
        {text}
      </span>
      {showMarquee ? (
        <div className="inline-block min-w-0 max-w-full whitespace-nowrap">
          <div
            className="scrolling-text-marquee-track inline-flex"
            style={marqueeStyle}
            onAnimationStart={handleMarqueeAnimationStart}
          >
            <span style={{ paddingRight: `${paddingWidth}px` }}>{text}</span>
            <span style={{ paddingRight: `${paddingWidth}px` }} aria-hidden>
              {text}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={cn("whitespace-nowrap leading-[inherit]", textAlignClass)}
        >
          {text}
        </div>
      )}
    </div>
  );
}
