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
}: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  /** Edge fade only after the marquee actually runs (skips delay + paused-before-start). */
  const [edgeFadeActive, setEdgeFadeActive] = useState(false);
  const paddingWidth = 20; // Width of padding between text duplicates

  const durationSec = Math.max(text.length * 0.15, 8);

  // Check if text needs to scroll (is wider than container)
  useEffect(() => {
    const container = containerRef.current;
    const textElement = textRef.current;
    if (!container || !textElement) return;

    const measure = () => {
      const newContainerWidth = container.clientWidth;
      const newContentWidth = textElement.scrollWidth;
      setShouldScroll(newContentWidth > newContainerWidth);
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    resizeObserver.observe(textElement);

    return () => resizeObserver.disconnect();
  }, [text, allowMarquee]);

  // When `resetOnPause` is enabled and we're paused, drop the marquee track
  // entirely so the duplicated text snaps back to translate(0). The static
  // branch still gets the right-edge truncation fade below.
  const isResetPaused = resetOnPause && !isPlaying;
  const showMarquee = shouldScroll && allowMarquee && !isResetPaused;
  const showStaticOverflowFade =
    shouldScroll && allowMarquee && isResetPaused && fadeEdges;

  useEffect(() => {
    setEdgeFadeActive(false);
  }, [text, showMarquee, scrollStartDelaySec, fadeEdges]);

  const handleMarqueeAnimationStart = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.includes("scrolling-text-marquee")) return;
    setEdgeFadeActive(true);
  }, []);

  const fadeInset = "0.75em";
  // Right-only fade: keep text crisp on the left, hint overflow on the right.
  // Used for the idle/pre-start frame of the marquee AND for the
  // `resetOnPause` static fallback (so deselected overflowing rows still
  // render a truncation hint instead of a hard cut).
  const rightOnlyFadeGradient = `linear-gradient(to right, black 0, black calc(100% - ${fadeInset}), transparent 100%)`;
  // Full fade: hides the seam at both edges while the marquee loops.
  const bothEdgesFadeGradient = `linear-gradient(to right, transparent 0, black ${fadeInset}, black calc(100% - ${fadeInset}), transparent 100%)`;
  const maskImage = showMarquee && fadeEdges
    ? edgeFadeActive
      ? bothEdgesFadeGradient
      : rightOnlyFadeGradient
    : showStaticOverflowFade
      ? rightOnlyFadeGradient
      : undefined;
  const mergedStyle: CSSProperties = {
    ...style,
    maskImage,
    WebkitMaskImage: maskImage,
    clipPath:
      style?.clipPath ??
      (showMarquee ? "inset(-0.25em 0 -0.25em 0)" : undefined),
  };
  const alignClass = align === "left" ? "justify-start" : "justify-center";
  const textAlignClass = align === "left" ? "text-left" : "text-center";

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
        "relative overflow-visible",
        !showMarquee && "flex",
        !showMarquee && alignClass,
        className
      )}
      style={mergedStyle}
    >
      {showMarquee ? (
        <div className="inline-block min-w-0 max-w-full whitespace-nowrap">
          <div
            className="scrolling-text-marquee-track inline-flex"
            style={marqueeStyle}
            onAnimationStart={handleMarqueeAnimationStart}
          >
            <span ref={textRef} style={{ paddingRight: `${paddingWidth}px` }}>
              {text}
            </span>
            <span style={{ paddingRight: `${paddingWidth}px` }} aria-hidden>
              {text}
            </span>
          </div>
        </div>
      ) : (
        <div ref={textRef} className={cn("whitespace-nowrap", textAlignClass)}>
          {text}
        </div>
      )}
    </div>
  );
}
