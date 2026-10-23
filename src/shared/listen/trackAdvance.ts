/**
 * One advance per song ending.
 *
 * The DJ may report the end immediately. Another member may advance only after
 * the shared clock has passed the end plus a grace period, so a backgrounded
 * playback device does not stall the room and two reporters cannot skip twice.
 */

export const TRACK_END_LEAD_MS = 350;
export const TRACK_END_MEMBER_GRACE_MS = 2500;
/** Matches the stale-DJ claim window so a dead DJ is not treated as gone before a member can take over. */
export const DJ_STALE_FOR_LIBRARY_FALLBACK_MS = 30_000;
export const MAX_TRACK_DURATION_MS = 4 * 60 * 60 * 1000;

export interface TrackAdvancePlayback {
  currentTrackId: string | null;
  positionMs: number;
  isPlaying: boolean;
  lastSyncAt: number;
  durationMs?: number;
  queueLength: number;
  acceptedEndTrackId?: string;
}

export type TrackAdvanceDecision =
  | { kind: "already-advanced" }
  | { kind: "deny"; error: "not_due" }
  | { kind: "pop-queue" }
  | { kind: "library-fallback"; djStale: boolean };

export function clampTrackDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.min(MAX_TRACK_DURATION_MS, Math.round(value));
}

export function extrapolatedPositionMs(
  playback: Pick<TrackAdvancePlayback, "positionMs" | "isPlaying" | "lastSyncAt">,
  now: number
): number {
  const elapsed = playback.isPlaying ? Math.max(0, now - playback.lastSyncAt) : 0;
  return Math.max(0, playback.positionMs) + elapsed;
}

export function trackEndIsDue(
  playback: TrackAdvancePlayback,
  now: number,
  graceMs: number
): boolean {
  const duration = playback.durationMs;
  if (duration == null || duration <= 0) return false;
  return extrapolatedPositionMs(playback, now) >= duration - TRACK_END_LEAD_MS + graceMs;
}

export function decideTrackAdvance(args: {
  playback: TrackAdvancePlayback;
  actorIsDj: boolean;
  endedTrackId: string;
  now: number;
}): TrackAdvanceDecision {
  if (
    !args.endedTrackId ||
    args.playback.currentTrackId !== args.endedTrackId ||
    args.playback.acceptedEndTrackId === args.endedTrackId
  ) {
    return { kind: "already-advanced" };
  }

  if (!args.actorIsDj && !trackEndIsDue(args.playback, args.now, TRACK_END_MEMBER_GRACE_MS)) {
    return { kind: "deny", error: "not_due" };
  }

  if (args.playback.queueLength > 0) {
    return { kind: "pop-queue" };
  }

  return {
    kind: "library-fallback",
    djStale: args.now - args.playback.lastSyncAt >= DJ_STALE_FOR_LIBRARY_FALLBACK_MS,
  };
}

/**
 * A DJ heartbeat that still names the track we loaded must not overwrite a
 * queue advance that landed while the request was in flight.
 */
export function incomingSyncIsStaleAdvance(args: {
  loadedTrackId: string | null;
  djTrackId: string | null;
  latestTrackId: string | null;
  loadedSyncAt: number;
  latestSyncAt: number;
}): boolean {
  return (
    args.latestTrackId !== args.loadedTrackId &&
    args.djTrackId === args.loadedTrackId &&
    args.latestSyncAt >= args.loadedSyncAt
  );
}
