/**
 * Aggregates every sound-producing window into the single native audio
 * session the iOS shell exposes (`setAudioActive` / `setNowPlaying` /
 * `updatePlayback`). Sources report independently; this module decides:
 *
 * - audio active  = any source playing or requesting playback (so windows
 *                   never fight over it); released only after a short grace
 * - now playing   = the most recently started source that still has metadata
 *                   (a paused-but-open player keeps its lock-screen entry)
 * - playback      = that owner's clock, re-sent only on rate changes, owner
 *                   changes, or drift (the shell extrapolates in between)
 *
 * Imports no app stores so it stays cheap to load from anywhere.
 */
import type {
  RyosNowPlayingInfo,
  RyosRemoteCommand,
} from "@/types/ryos-desktop";
import {
  sanitizeNowPlayingInfo,
  setNativeAudioActive,
  setNativeNowPlaying,
  updateNativePlayback,
} from "@/utils/nativeShellBridge";

export interface NativeMediaSourceState {
  /** Confirmed audible playback; drives the lock-screen rate. */
  playing: boolean;
  /**
   * Playback is wanted but not yet confirmed (loading, re-requested, track
   * switch). Counts as active so the shell keeps the audio session up while
   * the player (re)starts.
   */
  requested?: boolean;
  /** Metadata to show; null when the source has nothing to show (e.g. window closed). */
  nowPlaying: RyosNowPlayingInfo | null;
  /** Current position, or null when the source can't report one. */
  positionSeconds: number | null;
  /** Lock-screen remote control hooks; omit when the source can't be controlled. */
  controls?: NativeMediaSourceControls;
}

export interface NativeMediaSourceControls {
  play?: () => void;
  pause?: () => void;
}

interface TrackedSource extends NativeMediaSourceState {
  /** `playing || requested`. */
  active: boolean;
  nowPlayingKey: string | null;
  /** Monotonic order of the last inactive → active transition. */
  startedSeq: number;
}

/** Re-sync the shell clock when the reported position drifts this far from its extrapolation. */
export const PLAYBACK_DRIFT_TOLERANCE_SECONDS = 1.5;

/**
 * Delay before deactivating audio / clearing now-playing. Deactivating the
 * iOS audio session interrupts web media that is just starting, and
 * MediaCore handoffs (one app stopped before the next is reported) or
 * re-requests would otherwise release it mid-start.
 */
export const AUDIO_RELEASE_GRACE_MS = 1000;

const sources = new Map<string, TrackedSource>();
let startSeq = 0;
let sentAudioActive = false;
let sentNowPlayingKey: string | null = null;
let sentOwnerId: string | null = null;
let sentPlayback: { position: number; rate: number; at: number } | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

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
      (source.active && !best[1].active) ||
      (source.active === best[1].active &&
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

function scheduleRelease(): void {
  if (releaseTimer !== null) return;
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    sync(true);
  }, AUDIO_RELEASE_GRACE_MS);
}

function cancelRelease(): void {
  if (releaseTimer === null) return;
  clearTimeout(releaseTimer);
  releaseTimer = null;
}

/** `release` allows deactivating audio and clearing now-playing. */
function sync(release = false): void {
  let anyActive = false;
  for (const source of sources.values()) {
    if (source.active) {
      anyActive = true;
      break;
    }
  }

  if (anyActive && !sentAudioActive) {
    sentAudioActive = true;
    setNativeAudioActive(true);
  }

  const owner = pickOwner();
  const ownerId = owner?.[0] ?? null;
  const ownerKey = owner?.[1].nowPlayingKey ?? null;
  const deactivating = !anyActive && sentAudioActive;
  const clearing = !owner && sentOwnerId !== null;
  if ((deactivating || clearing) && !release) scheduleRelease();

  if (
    (ownerKey !== sentNowPlayingKey || ownerId !== sentOwnerId) &&
    (owner || release)
  ) {
    sentNowPlayingKey = ownerKey;
    sentOwnerId = ownerId;
    sentPlayback = null;
    setNativeNowPlaying(owner?.[1].nowPlaying ?? null);
  }
  if (owner) syncPlayback(owner[1]);

  if (deactivating && release) {
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
  const active = state.playing || state.requested === true;
  const startedSeq =
    active && !previous?.active ? ++startSeq : previous?.startedSeq ?? 0;
  const positionSeconds =
    typeof state.positionSeconds === "number" &&
    Number.isFinite(state.positionSeconds)
      ? state.positionSeconds
      : null;

  sources.set(id, {
    playing: state.playing,
    requested: state.requested,
    active,
    nowPlaying,
    nowPlayingKey,
    positionSeconds,
    startedSeq,
    controls: state.controls,
  });
  sync();
}

function runControl(control: (() => void) | undefined): boolean {
  if (typeof control !== "function") return false;
  try {
    control();
    return true;
  } catch {
    return false;
  }
}

/**
 * Route a lock-screen command to the source that owns the native session.
 * `pause` also falls back to any other playing source so audio can always be
 * stopped from the lock screen. Returns whether a source handled it.
 */
export function handleNativeRemoteCommand(command: unknown): boolean {
  if (!isNativeRemoteCommand(command)) return false;
  const owner = pickOwner()?.[1] ?? null;
  const action =
    command === "toggle-play-pause"
      ? owner?.active
        ? "pause"
        : "play"
      : command;

  if (action === "play") {
    return runControl(owner?.controls?.play);
  }

  if (owner?.active && runControl(owner.controls?.pause)) return true;
  let handled = false;
  for (const source of sources.values()) {
    if (source !== owner && source.active) {
      handled = runControl(source.controls?.pause) || handled;
    }
  }
  return handled;
}

const REMOTE_COMMANDS: ReadonlySet<string> = new Set<RyosRemoteCommand>([
  "toggle-play-pause",
  "play",
  "pause",
]);

function isNativeRemoteCommand(value: unknown): value is RyosRemoteCommand {
  return typeof value === "string" && REMOTE_COMMANDS.has(value);
}

function remoteCommandHandler(command: RyosRemoteCommand): void {
  handleNativeRemoteCommand(command);
}

/**
 * Assign the web client's handler over the shell-injected no-op
 * `window.__ryosDesktopRemoteCommand`. Idempotent; the returned cleanup
 * restores a no-op only if our handler is still installed.
 */
export function installNativeRemoteCommandHandler(): () => void {
  if (typeof window === "undefined") return () => {};
  window.__ryosDesktopRemoteCommand = remoteCommandHandler;
  return () => {
    if (window.__ryosDesktopRemoteCommand === remoteCommandHandler) {
      window.__ryosDesktopRemoteCommand = () => {};
    }
  };
}

/** Drop every source and clear the shell's session (only sends what was set). */
export function resetNativeMediaSession(): void {
  cancelRelease();
  sources.clear();
  sync(true);
  sentPlayback = null;
}

/** Run a pending deactivation / now-playing clear immediately. */
export function flushNativeMediaSessionRelease(): void {
  if (releaseTimer === null) return;
  cancelRelease();
  sync(true);
}
