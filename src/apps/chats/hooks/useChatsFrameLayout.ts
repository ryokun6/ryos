import { useEffect, useRef, useState } from "react";

interface UseChatsFrameLayoutParams {
  currentRoomId: string | null;
  messageCount: number;
  isSidebarVisible: boolean;
  onToggleSidebar: () => void;
}

export const useChatsFrameLayout = ({
  currentRoomId,
  messageCount,
  isSidebarVisible,
  onToggleSidebar,
}: UseChatsFrameLayoutParams) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatRootRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFrameNarrow, setIsFrameNarrow] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = (width: number) => {
      setIsFrameNarrow(width < 550);
    };

    updateWidth(containerRef.current.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        updateWidth(entries[0].contentRect.width);
      }
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = chatRootRef.current;
    const container = messagesContainerRef.current;
    if (!root || !container) return;

    let scroller: HTMLElement | null = null;

    const findScroller = (): HTMLElement | null => {
      const elements = container.querySelectorAll<HTMLElement>("*");
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.clientHeight > 0 &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          return el;
        }
      }
      return null;
    };

    const update = () => {
      if (!root) return;
      if (!scroller) scroller = findScroller();
      if (scroller) {
        const sbw = scroller.offsetWidth - scroller.clientWidth;
        root.style.setProperty("--sbw", `${Math.max(0, sbw)}px`);
      } else {
        root.style.setProperty("--sbw", "0px");
      }
    };

    update();

    const resizeObs = new ResizeObserver(() => update());
    const mutationObs = new MutationObserver(() => update());
    resizeObs.observe(container);
    if (scroller) resizeObs.observe(scroller);
    mutationObs.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", update);

    return () => {
      resizeObs.disconnect();
      mutationObs.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [currentRoomId, messageCount]);

  const prevFrameNarrowRef = useRef(isFrameNarrow);

  useEffect(() => {
    if (prevFrameNarrowRef.current && !isFrameNarrow && !isSidebarVisible) {
      onToggleSidebar();
    }
    prevFrameNarrowRef.current = isFrameNarrow;
  }, [isFrameNarrow, isSidebarVisible, onToggleSidebar]);

  return {
    containerRef,
    chatRootRef,
    messagesContainerRef,
    isFrameNarrow,
  };
};
