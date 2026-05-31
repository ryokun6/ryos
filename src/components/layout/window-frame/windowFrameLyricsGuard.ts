/** Returns true when a mouse event likely originated from karaoke lyrics UI. */
export function isMouseEventFromLyrics(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.closest("[data-lyrics]")) return true;

  if (
    target.closest(".lyrics-word-highlight") ||
    target.closest(".lyrics-line-clickable") ||
    target.classList.contains("lyrics-word-highlight") ||
    target.classList.contains("lyrics-line-clickable") ||
    target.classList.contains("lyrics-word-layer")
  ) {
    return true;
  }

  if (target.tagName === "SPAN") {
    let parent = target.parentElement;
    let depth = 0;
    while (parent && depth < 10) {
      if (
        parent.hasAttribute("data-lyrics") ||
        parent.classList.contains("lyrics-word-highlight") ||
        parent.classList.contains("lyrics-line-clickable")
      ) {
        return true;
      }
      parent = parent.parentElement;
      depth++;
    }
  }

  return false;
}
