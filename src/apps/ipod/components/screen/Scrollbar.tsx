import { useRef, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";

interface ScrollbarProps {
  containerRef:
    | React.RefObject<HTMLDivElement | null>
    | React.MutableRefObject<HTMLDivElement | null>;
  backlightOn: boolean;
  menuMode: boolean;
}

export function Scrollbar({
  containerRef,
  backlightOn,
  menuMode,
}: ScrollbarProps) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!container || !thumb || !track || !menuMode) return;

    const updateScrollbar = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const needsScrollbar = scrollHeight > clientHeight;

      if (needsScrollbar) {
        track.style.opacity = "1";
        thumb.style.display = "block";

        // Account for track's extended bounds: top-[-1px] bottom-[-2px] = +3px total height
        const trackHeight = clientHeight + 3;
        const thumbHeight = Math.max(
          (clientHeight / scrollHeight) * trackHeight,
          20
        );
        const maxScrollTop = scrollHeight - clientHeight;
        const thumbMaxTop = trackHeight - thumbHeight;
        const thumbTop =
          maxScrollTop > 0 ? (scrollTop / maxScrollTop) * thumbMaxTop : 0;

        thumb.style.height = `${thumbHeight - 4}px`;
        thumb.style.top = `${thumbTop + 2}px`;
      } else {
        track.style.opacity = "0";
        thumb.style.display = "none";
      }
    };

    // Initial update
    updateScrollbar();

    // Update on scroll
    container.addEventListener("scroll", updateScrollbar, { passive: true });

    // Update when content changes
    const observer = new ResizeObserver(updateScrollbar);
    observer.observe(container);

    return () => {
      container.removeEventListener("scroll", updateScrollbar);
      observer.disconnect();
    };
  }, [containerRef, menuMode]);

  if (!menuMode) return null;

  return (
    <div className="absolute right-0 top-[-1px] bottom-[-2px] w-2 z-20">
      {/* Track */}
      <div
        ref={trackRef}
        className={cn(
          "w-full h-full border border-[#0a3667] transition-all duration-500",
          backlightOn
            ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
            : "bg-[#8a9da9]"
        )}
        style={{ opacity: 0 }}
      />
      {/* Thumb */}
      <div
        ref={thumbRef}
        className="absolute right-0 bg-[#0a3667]"
        style={{
          marginLeft: "2px",
          marginRight: "2px",
          width: "calc(100% - 4px)",
          display: "none",
        }}
      />
    </div>
  );
}
