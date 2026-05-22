import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type AnimationEvent,
  type CSSProperties,
  type RefObject,
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
  /**
   * Menu row element used to measure label width up to the chevron/value
   * column (`[data-ipod-menu-row-end]`), including gap and row padding.
   */
  rowRef?: RefObject<HTMLElement | null>;
}

/** Visible label width from container left edge to the row end cap (chevron/value). */
export function getLabelClipWidth(
  container: HTMLElement,
  row: HTMLElement | null
): number {
  if (!row) return container.clientWidth;

  const endCap = row.querySelector<HTMLElement>("[data-ipod-menu-row-end]");
  if (!endCap) return container.clientWidth;

  const containerRect = container.getBoundingClientRect();
  const endRect = endCap.getBoundingClientRect();
  const clipWidth = endRect.left - containerRect.left;
  if (!Number.isFinite(clipWidth) || clipWidth <= 0) {
    return container.clientWidth;
  }
  return clipWidth;
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
  rowRef,
}: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  /** Edge fade only after the marquee actually runs (skips delay + paused-before-start). */
  const [edgeFadeActive, setEdgeFadeActive] = useState(false);
  const paddingWidth = 20; // Width of padding between text duplicates

  const durationSec = Math.max(text.length * 0.15, 8);

  const measureOverflow = useCallback(() => {
    const container = containerRef.current;
    const textElement = textRef.current;
    if (!container || !textElement) return;

    const containerWidth = getLabelClipWidth(
      container,
      rowRef?.current ?? null
    );
    if (containerWidth <= 0) {
      setShouldScroll(false);
      return;
    }

    const contentWidth = textElement.scrollWidth;
    setShouldScroll(contentWidth > containerWidth + 1);
  }, [rowRef]);

  useEffect(() => {
    const container = containerRef.current;
    const textElement = textRef.current;
    if (!container || !textElement) return;

    measureOverflow();

    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(container);
    resizeObserver.observe(textElement);
    const row = rowRef?.current;
    if (row) resizeObserver.observe(row);

    return () => resizeObserver.disconnect();
  }, [text, allowMarquee, measureOverflow, rowRef]);

  const isResetPaused = resetOnPause && !isPlaying;
  const showMarquee = shouldScroll && allowMarquee && !isResetPaused;
  const showStaticOverflowFade = shouldScroll && fadeEdges && !showMarquee;

  useEffect(() => {
    setEdgeFadeActive(false);
  }, [text, showMarquee, scrollStartDelaySec, fadeEdges]);

  const handleMarqueeAnimationStart = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.includes("scrolling-text-marquee")) return;
    setEdgeFadeActive(true);
  }, []);

  const fadeInset = "0.75em";
  const rightOnlyFadeGradient = `linear-gradient(to right, black 0, black calc(100% - ${fadeInset}), transparent 100%)`;
  const bothEdgesFadeGradient = `linear-gradient(to right, transparent 0, black ${fadeInset}, black calc(100% - ${fadeInset}), transparent 100%)`;
  const maskImage = showMarquee && fadeEdges
    ? edgeFadeActive
      ? bothEdgesFadeGradient
      : rightOnlyFadeGradient
    : showStaticOverflowFade
      ? rightOnlyFadeGradient
      : undefined;
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
        "relative flex h-full min-h-0 min-w-0 items-center overflow-x-hidden overflow-y-hidden",
        alignClass,
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
        <div
          ref={textRef}
          className={cn("whitespace-nowrap leading-[inherit]", textAlignClass)}
        >
          {text}
        </div>
      )}
    </div>
  );
}
