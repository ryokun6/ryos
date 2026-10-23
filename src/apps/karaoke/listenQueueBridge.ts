/**
 * Karaoke's mounted player owns "next" while a window is open, so chat,
 * the dashboard widget, and the on-screen transport share one path.
 * That path plays the listen-together queue before falling back to the library.
 */

type KaraokeSessionNext = () => void;

let karaokeSessionNext: KaraokeSessionNext | null = null;

export function registerKaraokeSessionNext(handler: KaraokeSessionNext | null): void {
  karaokeSessionNext = handler;
}

export function requestKaraokeSessionNext(): boolean {
  if (!karaokeSessionNext) return false;
  karaokeSessionNext();
  return true;
}
