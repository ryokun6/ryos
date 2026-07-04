/**
 * Microsoft Agent animation sound playback (clippy.js MP3 data URLs).
 * Source: https://github.com/clippyjs/clippy.js
 *
 * Clips play through the app's shared Web Audio context (see
 * `src/lib/audioContext.ts`) rather than HTMLAudioElements. Media elements
 * claim the platform media session, which interrupts speech synthesis on
 * several engines and audibly cut the assistant's browser TTS off
 * mid-reply — Web Audio buffer sources mix with TTS instead, so animation
 * sounds and spoken replies can play together. Decoded buffers are cached in
 * a bounded module-level LRU shared across sprite instances (characters ship
 * 10–34 clips each).
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import {
  getAudioContext,
  onContextChange,
  resumeAudioContext,
} from "@/lib/audioContext";
import type { AssistantCharacterId } from "./characters";
import { ASSISTANT_SOUND_MAPS } from "./sounds";

const MAX_CONCURRENT_ASSISTANT_SOUNDS = 2;
const MIN_SOUND_GAP_MS = 80;
/** Upper bound on cached decoded clips across all characters. */
const MAX_CACHED_ASSISTANT_SOUNDS = 24;

let userHasInteracted = false;
let lastPlayedAt = 0;

interface ActiveClip {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const activeClips = new Set<ActiveClip>();

/** Shared decoded-buffer cache keyed by `${characterId}:${soundId}`, LRU. */
const sharedBufferCache = new Map<string, AudioBuffer>();
const pendingDecodes = new Map<string, Promise<AudioBuffer | null>>();

// Buffers decoded by a closed context are unusable in its replacement.
onContextChange(() => {
  sharedBufferCache.clear();
  pendingDecodes.clear();
  activeClips.clear();
});

/**
 * Audio pipeline indirection so tests can substitute a fake context without
 * touching the shared `audioContext` module (which binds `AudioContext` at
 * import time and is unavailable under the test runner).
 */
interface AssistantSoundPipeline {
  resume: () => Promise<void>;
  getContext: () => AudioContext | null;
}

const defaultPipeline: AssistantSoundPipeline = {
  resume: () => resumeAudioContext(),
  getContext: () => {
    const context = getAudioContext();
    // The shared helper hands back a dummy `{ state: "closed" }` shape when
    // Web Audio is unsupported; treat it as "no audio".
    return context.state === "closed" ? null : context;
  },
};

let pipeline = defaultPipeline;

export function __setAssistantSoundPipelineForTests(
  override: AssistantSoundPipeline | null
): void {
  pipeline = override ?? defaultPipeline;
}

/** Test-only reset for module-level playback gate state. */
export function resetAssistantSoundStateForTests(): void {
  userHasInteracted = false;
  lastPlayedAt = 0;
  activeClips.clear();
  sharedBufferCache.clear();
  pendingDecodes.clear();
}

/** Test-only helper to bypass the minimum gap between consecutive plays. */
export function resetAssistantSoundPlaybackGapForTests(): void {
  lastPlayedAt = 0;
}

export function markAssistantSoundInteraction(): void {
  userHasInteracted = true;
}

export function canPlayAssistantSounds(): boolean {
  return userHasInteracted && useAudioSettingsStore.getState().uiSoundsEnabled;
}

export function getAssistantSoundVolume(): number {
  const { masterVolume, uiVolume } = useAudioSettingsStore.getState();
  return masterVolume * uiVolume;
}

/** Raw MP3 bytes from a clippy.js `data:audio/mpeg;base64,` URL. */
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  const marker = "base64,";
  const markerIndex = dataUrl.indexOf(marker);
  if (markerIndex === -1) return null;
  try {
    const binary = atob(dataUrl.slice(markerIndex + marker.length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

async function getOrDecodeBuffer(
  context: AudioContext,
  characterId: AssistantCharacterId,
  soundId: string
): Promise<AudioBuffer | null> {
  const key = `${characterId}:${soundId}`;
  const cached = sharedBufferCache.get(key);
  if (cached) {
    // Refresh recency so hot clips survive eviction.
    sharedBufferCache.delete(key);
    sharedBufferCache.set(key, cached);
    return cached;
  }

  const pending = pendingDecodes.get(key);
  if (pending) return pending;

  const src = ASSISTANT_SOUND_MAPS[characterId]?.[soundId];
  if (!src) return null;

  const decodePromise = (async () => {
    try {
      const bytes = dataUrlToArrayBuffer(src);
      if (!bytes) return null;
      const buffer = await context.decodeAudioData(bytes);
      if (sharedBufferCache.size >= MAX_CACHED_ASSISTANT_SOUNDS) {
        const oldestKey = sharedBufferCache.keys().next().value;
        if (oldestKey) sharedBufferCache.delete(oldestKey);
      }
      sharedBufferCache.set(key, buffer);
      return buffer;
    } catch {
      return null;
    } finally {
      pendingDecodes.delete(key);
    }
  })();

  pendingDecodes.set(key, decodePromise);
  return decodePromise;
}

function stopClip(clip: ActiveClip): void {
  try {
    clip.source.onended = null;
    clip.source.stop();
  } catch {
    // Already stopped or never started.
  }
  try {
    clip.gain.disconnect();
  } catch {
    // Context may already be closed.
  }
}

function trimActiveClips(): void {
  if (activeClips.size < MAX_CONCURRENT_ASSISTANT_SOUNDS) return;
  const oldest = activeClips.values().next().value as ActiveClip | undefined;
  if (!oldest) return;
  stopClip(oldest);
  activeClips.delete(oldest);
}

async function playAssistantSound(
  characterId: AssistantCharacterId,
  soundId: string
): Promise<void> {
  try {
    await pipeline.resume();
  } catch {
    return;
  }
  const context = pipeline.getContext();
  // Skip (rather than queue) clips when audio can't start now — a suspended
  // context would burst-play them later, out of sync with the animation.
  if (!context || context.state !== "running") return;

  const buffer = await getOrDecodeBuffer(context, characterId, soundId);
  if (!buffer) return;

  trimActiveClips();

  const gain = context.createGain();
  gain.gain.value = getAssistantSoundVolume();
  gain.connect(context.destination);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);

  const clip: ActiveClip = { source, gain };
  activeClips.add(clip);
  source.onended = () => {
    activeClips.delete(clip);
    try {
      gain.disconnect();
    } catch {
      // Context may already be closed.
    }
  };

  source.start(0);
}

export class AssistantSoundPlayer {
  private characterId: AssistantCharacterId | null = null;

  loadCharacter(characterId: AssistantCharacterId): void {
    this.characterId = characterId;
  }

  play(soundId: string | undefined): void {
    if (!soundId || !this.characterId) return;
    if (!canPlayAssistantSounds()) return;

    const now = Date.now();
    if (now - lastPlayedAt < MIN_SOUND_GAP_MS) return;
    lastPlayedAt = now;

    void playAssistantSound(this.characterId, soundId);
  }

  stopAll(): void {
    stopActiveAssistantSounds();
  }

  dispose(): void {
    this.stopAll();
    this.characterId = null;
  }
}

/** Silence every in-flight animation clip. */
export function stopActiveAssistantSounds(): void {
  for (const clip of activeClips) {
    stopClip(clip);
  }
  activeClips.clear();
}

/** Test-only view of how many clips are currently cached. */
export function getCachedAssistantSoundCountForTests(): number {
  return sharedBufferCache.size;
}

/** Test-only view of how many clips are currently playing. */
export function getActiveAssistantSoundCountForTests(): number {
  return activeClips.size;
}

export function resolveAssistantSoundSrc(
  characterId: AssistantCharacterId,
  soundId: string
): string | undefined {
  return ASSISTANT_SOUND_MAPS[characterId]?.[soundId];
}
