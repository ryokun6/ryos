/**
 * Touch rubber-band for the Books shelf scroller.
 *
 * Native iOS overflow bounce is unreliable here: the window shell keeps a
 * Motion transform, and the global `html`/`body` overscroll lock suppresses
 * scroll chaining. This applies a damped translateY past the scroll edges and
 * springs back on release — the usual nested-scroller workaround.
 */

export const BOOKS_SHELF_RUBBER_MAX_PX = 120;
const RUBBER_DAMPING = 0.55;
const SPRING_MS = 420;
const SPRING_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function isCoarseTouch(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

/** Damped overscroll translate for a finger delta (px). */
export function booksShelfRubberOffset(delta: number): number {
  // Diminishing resistance: far pulls move less than near pulls.
  const sign = delta < 0 ? -1 : 1;
  const abs = Math.abs(delta);
  const damped = abs * RUBBER_DAMPING * (1 / (abs / 280 + 1));
  return sign * Math.min(BOOKS_SHELF_RUBBER_MAX_PX, damped);
}

function atScrollTop(el: HTMLElement): boolean {
  return el.scrollTop <= 0;
}

function atScrollBottom(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}

export type BooksShelfRubberBandHandle = {
  destroy: () => void;
};

/**
 * Attach rubber-band overscroll to a shelf scroll element. Transforms the
 * first element child (the bookcase content) so wood + shelves move together.
 */
export function attachBooksShelfRubberBand(
  scroller: HTMLElement
): BooksShelfRubberBandHandle {
  if (!isCoarseTouch()) {
    return { destroy() {} };
  }

  let content = scroller.firstElementChild as HTMLElement | null;
  let startY = 0;
  let active = false;
  let currentOffset = 0;
  let clearTimer = 0;
  // Suppress native bounce while our translate is in control — otherwise touch
  // devices can double-overscroll (native + custom) inside the window shell.
  const prevOverscroll = scroller.style.overscrollBehaviorY;
  scroller.style.overscrollBehaviorY = "none";

  const setOffset = (offset: number, animate: boolean) => {
    content = scroller.firstElementChild as HTMLElement | null;
    if (!content) return;
    currentOffset = offset;
    if (animate) {
      content.style.transition = `transform ${SPRING_MS}ms ${SPRING_EASING}`;
    } else {
      content.style.transition = "none";
    }
    content.style.willChange = offset === 0 ? "" : "transform";
    content.style.transform =
      offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    content = scroller.firstElementChild as HTMLElement | null;
    if (!content) return;
    // Cancel any in-flight spring so a new grab feels immediate.
    content.style.transition = "none";
    if (currentOffset !== 0) {
      content.style.transform = "";
      currentOffset = 0;
    }
    startY = e.touches[0].clientY;
    active = true;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!active || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const delta = y - startY;
    const pullingDown = delta > 0 && atScrollTop(scroller);
    const pullingUp = delta < 0 && atScrollBottom(scroller);

    if (!pullingDown && !pullingUp) {
      if (currentOffset !== 0) {
        // Left the overscroll zone — clear offset and let native scroll resume.
        setOffset(0, false);
      }
      // Re-anchor so crossing back into an edge measures from the boundary.
      startY = y;
      return;
    }

    // Nested scrollers inside fixed shells need a non-passive listener to
    // preventDefault; stop scroll from fighting the translate.
    if (e.cancelable) e.preventDefault();
    setOffset(booksShelfRubberOffset(delta), false);
  };

  const onTouchEnd = () => {
    if (!active) return;
    active = false;
    if (currentOffset === 0) return;
    setOffset(0, true);
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => {
      content = scroller.firstElementChild as HTMLElement | null;
      if (content) {
        content.style.transition = "";
        content.style.willChange = "";
      }
    }, SPRING_MS + 32);
  };

  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchmove", onTouchMove, { passive: false });
  scroller.addEventListener("touchend", onTouchEnd, { passive: true });
  scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return {
    destroy() {
      window.clearTimeout(clearTimer);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      scroller.style.overscrollBehaviorY = prevOverscroll;
      content = scroller.firstElementChild as HTMLElement | null;
      if (content) {
        content.style.transition = "";
        content.style.transform = "";
        content.style.willChange = "";
      }
    },
  };
}
