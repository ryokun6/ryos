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

  const showMarquee = shouldScroll && allowMarquee;

  useEffect(() => {
    setEdgeFadeActive(false);
  }, [text, shouldScroll, allowMarquee, scrollStartDelaySec, fadeEdges]);

  const handleMarqueeAnimationStart = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.includes("scrolling-text-marquee")) return;
    setEdgeFadeActive(true);
  }, []);

  const fadeInset = "0.75em";
  const maskImage =
    showMarquee && fadeEdges
      ? edgeFadeActive
        ? // Full fade: hides seam at both edges while looping
          `linear-gradient(to right, transparent 0, black ${fadeInset}, black calc(100% - ${fadeInset}), transparent 100%)`
        : // Pre-start / idle: keep text crisp on the left, hint overflow on the right
          `linear-gradient(to right, black 0, black calc(100% - ${fadeInset}), transparent 100%)`
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
