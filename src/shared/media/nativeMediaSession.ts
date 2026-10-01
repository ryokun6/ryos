/**
 * Aggregates every sound-producing window into the single native audio
 * session the iOS shell exposes (`setAudioActive` / `setNowPlaying` /
 * `updatePlayback`). Sources report independently; this module decides:
 *
 * - audio active  = any source playing (so windows never fight over it)
 * - now playing   = the most recently started source that still has metadata
 *                   (a paused-but-open player keeps its lock-screen entry)
 * - playback      = that owner's clock, re-sent only on rate changes, owner
 *                   changes, or drift (the shell extrapolates in between)
 *
 * Imports no app stores so it stays cheap to load from anywhere.
 */
import type { RyosNowPlayingInfo } from "@/types/ryos-desktop";
import {
  sanitizeNowPlayingInfo,
  setNativeAudioActive,
  setNativeNowPlaying,
  updateNativePlayback,
} from "@/utils/nativeShellBridge";

export interface NativeMediaSourceState {
  playing: boolean;
  /** Metadata to show; null when the source has nothing to show (e.g. window closed). */
  nowPlaying: RyosNowPlayingInfo | null;
  /** Current position, or null when the source can't report one. */
  positionSeconds: number | null;
}

interface TrackedSource extends NativeMediaSourceState {
  nowPlayingKey: string | null;
  /** Monotonic order of the last not-playing → playing transition. */
  startedSeq: number;
}

/** Re-sync the shell clock when the reported position drifts this far from its extrapolation. */
export const PLAYBACK_DRIFT_TOLERANCE_SECONDS = 1.5;

const sources = new Map<string, TrackedSource>();
let startSeq = 0;
let sentAudioActive = false;
let sentNowPlayingKey: string | null = null;
let sentOwnerId: string | null = null;
let sentPlayback: { position: number; rate: number; at: number } | null = null;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function pickOwner(): [string, TrackedSource] | null {
  let best: [string, TrackedSource] | null = null;
  for (const entry of sources) {
    const source = entry[1];
    if (!source.nowPlayingKey) continue;
    if (
      !best ||
      (source.playing && !best[1].playing) ||
      (source.playing === best[1].playing &&
        source.startedSeq > best[1].startedSeq)
    ) {
      best = entry;
    }
  }
  return best;
}

function syncPlayback(source: TrackedSource): void {
  if (source.positionSeconds === null) return;
  const rate = source.playing ? 1 : 0;
  const at = now();
  if (sentPlayback && sentPlayback.rate === rate) {
    const expected =
      sentPlayback.position + ((at - sentPlayback.at) / 1000) * sentPlayback.rate;
    if (
      Math.abs(expected - source.positionSeconds) <
      PLAYBACK_DRIFT_TOLERANCE_SECONDS
    ) {
      return;
    }
  }
  sentPlayback = { position: source.positionSeconds, rate, at };
  updateNativePlayback(source.positionSeconds, rate);
}

function sync(): void {
  let anyPlaying = false;
  for (const source of sources.values()) {
    if (source.playing) {
      anyPlaying = true;
      break;
    }
  }

  if (anyPlaying && !sentAudioActive) {
    sentAudioActive = true;
    setNativeAudioActive(true);
  }

  const owner = pickOwner();
  const ownerId = owner?.[0] ?? null;
  const ownerKey = owner?.[1].nowPlayingKey ?? null;
  if (ownerKey !== sentNowPlayingKey || ownerId !== sentOwnerId) {
    sentNowPlayingKey = ownerKey;
    sentOwnerId = ownerId;
    sentPlayback = null;
    setNativeNowPlaying(owner?.[1].nowPlaying ?? null);
  }
  if (owner) syncPlayback(owner[1]);

  if (!anyPlaying && sentAudioActive) {
    sentAudioActive = false;
    setNativeAudioActive(false);
  }
}

/**
 * Report a source's current state; pass `null` to remove it (e.g. the
 * window unmounted). Cheap to call on every playback tick.
 */
export function updateNativeMediaSource(
  id: string,
  state: NativeMediaSourceState | null
): void {
  const previous = sources.get(id);
  if (!state) {
    if (!previous) return;
    sources.delete(id);
    sync();
    return;
  }

  const nowPlaying = sanitizeNowPlayingInfo(state.nowPlaying);
  const nowPlayingKey = nowPlaying ? JSON.stringify(nowPlaying) : null;
  const startedSeq =
    state.playing && !previous?.playing ? ++startSeq : previous?.startedSeq ?? 0;
  const positionSeconds =
    typeof state.positionSeconds === "number" &&
    Number.isFinite(state.positionSeconds)
      ? state.positionSeconds
      : null;

  sources.set(id, {
    playing: state.playing,
    nowPlaying,
    nowPlayingKey,
    positionSeconds,
    startedSeq,
  });
  sync();
}

/** Drop every source and clear the shell's session (only sends what was set). */
export function resetNativeMediaSession(): void {
  sources.clear();
  sync();
  sentPlayback = null;
}
