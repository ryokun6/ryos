import { RefObject, useEffect, useState } from "react";

/**
 * Returns true when `contentRef`'s scroll width exceeds `containerRef`'s client
 * width (i.e. the text is clipped). Re-measures on mount, on `deps` changes,
 * and on container resize. Shared by the LCD marquee surfaces.
 */
export function useTextOverflow(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  deps: unknown[]
): boolean {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const check = () => {
      setOverflows(content.scrollWidth > container.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return overflows;
}
