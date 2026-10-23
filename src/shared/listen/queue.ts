/**
 * Shared Listen Together song queue.
 *
 * The queue lives on the session (upcoming songs only). The current song stays
 * `currentTrackId`. An empty queue falls back to the player's existing
 * library next/shuffle/loop behavior.
 *
 * Permissions (server-enforced):
 * - Any current session member may add, play next (`addNext`), bump any item
 *   to the front, or remove any item. It does not matter who added the song.
 * - The DJ is the only member who may `advance` (pop the next song into
 *   playback). Song end and skip on the playback device use this.
 * - Anyone who is not a current member is rejected.
 *
 * This is the party queue from the Karaoke 點歌 plan (PR #2043). It is not a
 * local karaoke-store queue, and it does not change pitch or vocal removal.
 * `playTrack` stays "play now".
 */

export const LISTEN_QUEUE_MAX_LENGTH = 40;
export const LISTEN_QUEUE_TITLE_MAX = 180;
export const LISTEN_QUEUE_ARTIST_MAX = 180;
export const LISTEN_QUEUE_MUTATION_LIMIT = 30;
export const LISTEN_QUEUE_MUTATION_WINDOW_SECONDS = 60;
export const LISTEN_QUEUE_ADVANCE_LIMIT = 20;
export const LISTEN_QUEUE_ADVANCE_WINDOW_SECONDS = 60;

const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const ENTRY_ID_RE = /^[a-zA-Z0-9_-]{8,32}$/;

export interface ListenQueueItem {
  entryId: string;
  trackId: string;
  title: string;
  artist?: string;
  requestedBy: string;
  addedAt: number;
}

export interface ListenQueueActor {
  username: string;
  clientInstanceId: string;
}

export interface ListenQueueSessionState {
  users: Array<{ username: string; clientInstanceId?: string }>;
  djUsername: string;
  djClientInstanceId?: string;
  queue?: ListenQueueItem[];
  queueVersion?: number;
}

export type ListenQueueCommand =
  | {
      op: "add" | "addNext";
      trackId: string;
      title: string;
      artist?: string;
      entryId: string;
    }
  | { op: "bump" | "remove"; entryId: string }
  | { op: "advance" };

export type ListenQueueSuccess = {
  ok: true;
  changed: boolean;
  queue: ListenQueueItem[];
  queueVersion: number;
  advanced: boolean;
  item?: ListenQueueItem;
  currentTrackId?: string;
  currentTrackMeta?: { title: string; artist?: string };
  isPlaying?: boolean;
  positionMs?: number;
};

export type ListenQueueFailure = {
  ok: false;
  status: number;
  error: string;
};

export type ListenQueueResult = ListenQueueSuccess | ListenQueueFailure;

export function normalizeListenQueue(value: unknown): ListenQueueItem[] {
  if (!Array.isArray(value)) return [];
  const items: ListenQueueItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<ListenQueueItem>;
    if (
      typeof item.entryId !== "string" ||
      typeof item.trackId !== "string" ||
      typeof item.title !== "string" ||
      typeof item.requestedBy !== "string" ||
      typeof item.addedAt !== "number" ||
      !Number.isFinite(item.addedAt)
    ) {
      continue;
    }
    const artist =
      typeof item.artist === "string" && item.artist.trim()
        ? item.artist
        : undefined;
    items.push({
      entryId: item.entryId,
      trackId: item.trackId,
      title: item.title,
      ...(artist ? { artist } : {}),
      requestedBy: item.requestedBy,
      addedAt: item.addedAt,
    });
    if (items.length >= LISTEN_QUEUE_MAX_LENGTH) break;
  }
  return items;
}

export function normalizeListenSessionQueue<
  T extends { queue?: unknown; queueVersion?: unknown },
>(session: T): T & { queue: ListenQueueItem[]; queueVersion: number } {
  const version = session.queueVersion;
  return {
    ...session,
    queue: normalizeListenQueue(session.queue),
    queueVersion:
      typeof version === "number" && Number.isFinite(version) && version >= 0
        ? Math.floor(version)
        : 0,
  };
}

function cleanText(value: string, max: number): string | null {
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > max) return null;
  return cleaned;
}

function isMember(
  session: ListenQueueSessionState,
  actor: ListenQueueActor
): boolean {
  return session.users.some(
    (user) =>
      user.username === actor.username &&
      user.clientInstanceId === actor.clientInstanceId
  );
}

function isDj(
  session: ListenQueueSessionState,
  actor: ListenQueueActor
): boolean {
  return (
    session.djUsername === actor.username &&
    session.djClientInstanceId === actor.clientInstanceId
  );
}

export function applyListenQueueCommand(
  session: ListenQueueSessionState,
  actor: ListenQueueActor,
  command: ListenQueueCommand,
  now: number
): ListenQueueResult {
  if (!isMember(session, actor)) {
    return { ok: false, status: 403, error: "not_in_session" };
  }

  const queue = normalizeListenQueue(session.queue);
  const version = session.queueVersion ?? 0;

  if (command.op === "advance") {
    if (!isDj(session, actor)) {
      return { ok: false, status: 403, error: "not_dj" };
    }
    const next = queue[0];
    if (!next) {
      return {
        ok: true,
        changed: false,
        queue,
        queueVersion: version,
        advanced: false,
      };
    }
    return {
      ok: true,
      changed: true,
      queue: queue.slice(1),
      queueVersion: version + 1,
      advanced: true,
      item: next,
      currentTrackId: next.trackId,
      currentTrackMeta: {
        title: next.title,
        ...(next.artist ? { artist: next.artist } : {}),
      },
      isPlaying: true,
      positionMs: 0,
    };
  }

  if (command.op === "add" || command.op === "addNext") {
    if (!YOUTUBE_VIDEO_ID_RE.test(command.trackId)) {
      return { ok: false, status: 400, error: "invalid_track" };
    }
    if (!ENTRY_ID_RE.test(command.entryId)) {
      return { ok: false, status: 400, error: "invalid_entry" };
    }
    const title = cleanText(command.title, LISTEN_QUEUE_TITLE_MAX);
    if (!title) {
      return { ok: false, status: 400, error: "invalid_title" };
    }
    let artist: string | undefined;
    if (command.artist != null && command.artist.trim() !== "") {
      const cleaned = cleanText(command.artist, LISTEN_QUEUE_ARTIST_MAX);
      if (!cleaned) {
        return { ok: false, status: 400, error: "invalid_artist" };
      }
      artist = cleaned;
    }
    if (queue.length >= LISTEN_QUEUE_MAX_LENGTH) {
      return { ok: false, status: 400, error: "queue_full" };
    }
    const item: ListenQueueItem = {
      entryId: command.entryId,
      trackId: command.trackId,
      title,
      ...(artist ? { artist } : {}),
      requestedBy: actor.username,
      addedAt: now,
    };
    return {
      ok: true,
      changed: true,
      queue: command.op === "addNext" ? [item, ...queue] : [...queue, item],
      queueVersion: version + 1,
      advanced: false,
    };
  }

  if (command.op === "bump" || command.op === "remove") {
    const entryId = command.entryId.trim();
    if (!ENTRY_ID_RE.test(entryId)) {
      return { ok: false, status: 400, error: "invalid_entry" };
    }
    const index = queue.findIndex((item) => item.entryId === entryId);
    if (index < 0) {
      return { ok: false, status: 404, error: "not_found" };
    }
    if (command.op === "bump") {
      if (index === 0) {
        return {
          ok: true,
          changed: false,
          queue,
          queueVersion: version,
          advanced: false,
        };
      }
      const item = queue[index]!;
      const next = [
        item,
        ...queue.slice(0, index),
        ...queue.slice(index + 1),
      ];
      return {
        ok: true,
        changed: true,
        queue: next,
        queueVersion: version + 1,
        advanced: false,
      };
    }
    return {
      ok: true,
      changed: true,
      queue: queue.filter((item) => item.entryId !== entryId),
      queueVersion: version + 1,
      advanced: false,
    };
  }

  return { ok: false, status: 400, error: "invalid_op" };
}
