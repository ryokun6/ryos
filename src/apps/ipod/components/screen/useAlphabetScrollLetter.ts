import { useEffect, useRef, useState } from "react";
import type { MenuItem } from "../../types";

/**
 * Sliding window inside which we count consecutive selection changes
 * to decide whether the wheel is being spun "fast enough" to merit
 * popping the alphabet-scroll letter overlay.
 *
 * Tuned for the iPod virtual wheel: each tick of `rotationStepDeg`
 * (15°) shifts the selection by one, so a comfortable thumb spin
 * easily produces 4+ ticks within 220ms.
 */
export const ALPHABET_SCROLL_FAST_WINDOW_MS = 220;
/** Minimum recent selection changes within {@link ALPHABET_SCROLL_FAST_WINDOW_MS} to trigger the overlay. */
export const ALPHABET_SCROLL_MIN_TICKS = 4;
/** Cooldown after the last selection change before the overlay fades back out. */
export const ALPHABET_SCROLL_HIDE_DELAY_MS = 420;

/**
 * Returns a single uppercase character to render in the alphabet-scroll
 * overlay (or `null` when the overlay should be hidden).
 *
 * Behavior:
 *  - Activates only while the current menu has `alphabetical: true`
 *    and the user is in menu mode.
 *  - Ramps up after {@link ALPHABET_SCROLL_MIN_TICKS} selection
 *    changes inside {@link ALPHABET_SCROLL_FAST_WINDOW_MS} so casual
 *    one-at-a-time taps never flash the overlay.
 *  - Updates the displayed letter on every subsequent selection
 *    change so it tracks the current row.
 *  - Decays back to `null` {@link ALPHABET_SCROLL_HIDE_DELAY_MS}
 *    after the last selection change.
 *  - Resets immediately when the menu depth changes (entering /
 *    leaving a submenu) so the overlay never lingers across menu
 *    transitions.
 */
export function useAlphabetScrollLetter({
  isAlphabeticalMenu,
  menuMode,
  menuDepth,
  selectedIndex,
  items,
}: {
  isAlphabeticalMenu: boolean;
  menuMode: boolean;
  menuDepth: number;
  selectedIndex: number;
  items: MenuItem[];
}): string | null {
  const [letter, setLetter] = useState<string | null>(null);
  const tickTimestampsRef = useRef<number[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSelectedRef = useRef<number>(selectedIndex);
  const prevDepthRef = useRef<number>(menuDepth);
  const prevAlphabeticalRef = useRef<boolean>(isAlphabeticalMenu);
  const isActiveRef = useRef<boolean>(false);

  // Tear-down on unmount.
  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    // Reset whenever we cross a menu boundary or alphabetical-ness
    // flips — entering or leaving a submenu should never show stale
    // letters from the previous list.
    if (
      prevDepthRef.current !== menuDepth ||
      prevAlphabeticalRef.current !== isAlphabeticalMenu
    ) {
      prevDepthRef.current = menuDepth;
      prevAlphabeticalRef.current = isAlphabeticalMenu;
      prevSelectedRef.current = selectedIndex;
      tickTimestampsRef.current = [];
      isActiveRef.current = false;
      clearHideTimer();
      setLetter(null);
      return;
    }

    if (!menuMode || !isAlphabeticalMenu) {
      // Menu closed or list isn't alphabetical → ensure overlay is
      // hidden and stay quiet.
      setLetter((prev) => (prev !== null ? null : prev));
      tickTimestampsRef.current = [];
      isActiveRef.current = false;
      clearHideTimer();
      prevSelectedRef.current = selectedIndex;
      return;
    }

    // Same menu / same selection → nothing to do (initial render or
    // an unrelated re-render).
    if (prevSelectedRef.current === selectedIndex) {
      return;
    }
    prevSelectedRef.current = selectedIndex;

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const cutoff = now - ALPHABET_SCROLL_FAST_WINDOW_MS;
    const trimmed = tickTimestampsRef.current.filter((t) => t >= cutoff);
    trimmed.push(now);
    tickTimestampsRef.current = trimmed;

    if (
      !isActiveRef.current &&
      trimmed.length >= ALPHABET_SCROLL_MIN_TICKS
    ) {
      isActiveRef.current = true;
    }

    if (isActiveRef.current) {
      const next = firstDisplayLetter(items[selectedIndex]?.label);
      if (next) setLetter(next);
    }

    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      isActiveRef.current = false;
      tickTimestampsRef.current = [];
      setLetter(null);
    }, ALPHABET_SCROLL_HIDE_DELAY_MS);
  }, [selectedIndex, isAlphabeticalMenu, menuMode, menuDepth, items]);

  return letter;
}

/**
 * Extract the first user-meaningful character from a menu row label
 * and uppercase it. Handles surrogate pairs (emoji, CJK extensions)
 * so a single grapheme is returned even when the label starts with a
 * 4-byte code point. Returns `null` when the label is empty or only
 * whitespace.
 */
function firstDisplayLetter(label: string | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (trimmed.length === 0) return null;
  const codePoint = trimmed.codePointAt(0);
  if (codePoint === undefined) return null;
  const ch = String.fromCodePoint(codePoint);
  return ch.toLocaleUpperCase();
}
