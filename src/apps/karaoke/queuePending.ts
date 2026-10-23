import type { ListenQueueItem } from "@/shared/listen/queue";

/** A song that is still resolving or posting, shown before the server queue has it. */
export interface PendingQueueItem {
  localId: string;
  trackId: string;
  title: string;
  artist?: string;
  requestedBy: string;
  placement: "end" | "next";
}

export interface DisplayQueueItem extends ListenQueueItem {
  pending?: boolean;
}

const PENDING_ENTRY_PREFIX = "pending-";

export function isPendingQueueEntry(entryId: string): boolean {
  return entryId.startsWith(PENDING_ENTRY_PREFIX);
}

export function nextPendingQueueId(serial: number): string {
  return `${PENDING_ENTRY_PREFIX}${serial}`;
}

/**
 * The song on screen before a queue add. With no selection, Karaoke shows the
 * first library track, and a new track is inserted in front of it.
 */
export function visibleSongIdForQueueAdd(args: {
  currentSongId: string | null;
  trackIds: readonly string[];
}): string | null {
  if (args.currentSongId && args.trackIds.includes(args.currentSongId)) {
    return args.currentSongId;
  }
  return args.trackIds[0] ?? null;
}

/**
 * A queue add must not become the song that is already on screen.
 * Returns the id to restore, or null when the current song should stay as it is.
 */
export function songIdToRestoreAfterQueueAdd(args: {
  pinnedSongId: string | null;
  currentSongId: string | null;
  trackIds: readonly string[];
}): string | null {
  const pinned = args.pinnedSongId;
  if (!pinned) return null;
  if (!args.trackIds.includes(pinned)) return null;
  if (args.currentSongId === pinned) return null;
  return pinned;
}

function toDisplay(item: PendingQueueItem): DisplayQueueItem {
  return {
    entryId: item.localId,
    trackId: item.trackId,
    title: item.title,
    ...(item.artist ? { artist: item.artist } : {}),
    requestedBy: item.requestedBy,
    addedAt: 0,
    pending: true,
  };
}

/**
 * Play-next placeholders sit in front, newest first, matching `addNext`.
 * End placeholders sit after the server queue, in the order they were added.
 */
export function mergeQueueWithPending(
  queue: readonly ListenQueueItem[],
  pending: readonly PendingQueueItem[]
): DisplayQueueItem[] {
  if (pending.length === 0) return queue as DisplayQueueItem[];

  const playNext: DisplayQueueItem[] = [];
  const playLater: DisplayQueueItem[] = [];
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const item = pending[index];
    if (!item || item.placement !== "next") continue;
    playNext.push(toDisplay(item));
  }
  for (const item of pending) {
    if (item.placement === "next") continue;
    playLater.push(toDisplay(item));
  }
  return [...playNext, ...queue, ...playLater];
}
