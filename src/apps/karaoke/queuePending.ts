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
