import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useIsPhone } from "@/hooks/useIsPhone";

const ScrollingContext = React.createContext<{
  isScrolling: boolean;
  preventInteraction: (e: React.MouseEvent | React.TouchEvent) => boolean;
}>({
  isScrolling: false,
  preventInteraction: () => false,
});

const NON_SCROLLING_CONTEXT_VALUE = {
  isScrolling: false,
  preventInteraction: () => false,
};

export function ScrollableMenuWrapper({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const isPhone = useIsPhone();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track touch state for preventing accidental taps during scroll
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    hasMoved: boolean;
    startTime: number;
  } | null>(null);
  const hadRecentScrollRef = useRef(false);

  const updateScrollState = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft: left, scrollWidth: width, clientWidth: cw } = scrollRef.current;
    setScrollLeft(left);
    setScrollWidth(width);
    setClientWidth(cw);
  }, []);

  const handleScroll = useCallback(() => {
    updateScrollState();
    hadRecentScrollRef.current = true;
    
    // Mark current touch as moved if there's an active touch
    if (touchStateRef.current) {
      touchStateRef.current.hasMoved = true;
    }
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    // Clear recent scroll flag after scroll ends
    scrollTimeoutRef.current = setTimeout(() => {
      hadRecentScrollRef.current = false;
    }, 300);
  }, [updateScrollState]);

  // Check if interaction should be prevented
  const shouldPreventInteraction = useCallback(() => {
    // Prevent if there was recent scrolling
    if (hadRecentScrollRef.current) {
      return true;
    }
    // Prevent if current touch has moved
    if (touchStateRef.current?.hasMoved) {
      return true;
    }
    return false;
  }, []);

  const preventInteraction = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (shouldPreventInteraction()) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }, [shouldPreventInteraction]);

  useEffect(() => {
    updateScrollState();
    const resizeObserver = new ResizeObserver(updateScrollState);
    if (scrollRef.current) {
      resizeObserver.observe(scrollRef.current);
    }
    return () => {
      resizeObserver.disconnect();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [updateScrollState]);

  const canScrollLeft = scrollLeft > 0;
  const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;

  const maskImage = useMemo(() => {
    if (!isPhone || scrollWidth <= clientWidth) {
      return undefined;
    }
    
    const fadeWidth = 24; // Width of fade in pixels
    
    if (canScrollLeft && canScrollRight) {
      // Both sides need fade: transparent edges, black middle
      return `linear-gradient(to right, transparent 0%, black ${fadeWidth}px, black calc(100% - ${fadeWidth}px), transparent 100%)`;
    } else if (canScrollLeft) {
      // Only left side needs fade: transparent left edge, black rest
      return `linear-gradient(to right, transparent 0%, black ${fadeWidth}px, black 100%)`;
    } else if (canScrollRight) {
      // Only right side needs fade: black start, transparent right edge
      return `linear-gradient(to right, black 0%, black calc(100% - ${fadeWidth}px), transparent 100%)`;
    }
    return undefined;
  }, [canScrollLeft, canScrollRight, clientWidth, isPhone, scrollWidth]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      hasMoved: false,
      startTime: Date.now(),
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStateRef.current) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);
    const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY);
    
    // If any movement is significant, mark as moved
    if (deltaX > 3 || deltaY > 3) {
      touchStateRef.current.hasMoved = true;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // Keep hasMoved state briefly to catch click events that fire after touchend
    const hadMoved = touchStateRef.current?.hasMoved;
    touchStateRef.current = null;
    
    if (hadMoved) {
      // Briefly keep the scroll prevention active
      hadRecentScrollRef.current = true;
      setTimeout(() => {
        hadRecentScrollRef.current = false;
      }, 100);
    }
  }, []);

  const scrollingContextValue = useMemo(
    () => ({
      isScrolling: hadRecentScrollRef.current,
      preventInteraction,
    }),
    [preventInteraction, scrollLeft, scrollWidth, clientWidth]
  );

  if (!isPhone) {
    return (
      <ScrollingContext.Provider value={NON_SCROLLING_CONTEXT_VALUE}>
        <div className={`flex items-stretch h-full${className ? ` ${className}` : ""}`} style={style}>
          {children}
        </div>
      </ScrollingContext.Provider>
    );
  }

  return (
    <ScrollingContext.Provider value={scrollingContextValue}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 h-full overflow-x-auto overflow-y-hidden${className ? ` ${className}` : ""}`}
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          maskImage,
          WebkitMaskImage: maskImage,
          touchAction: "pan-x",
          ...style,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-stretch h-full min-w-max">
          {children}
        </div>
      </div>
    </ScrollingContext.Provider>
  );
}
