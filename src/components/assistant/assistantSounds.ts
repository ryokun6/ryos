/**
 * Microsoft Agent animation sound playback (clippy.js MP3 data URLs).
 * Source: https://github.com/clippyjs/clippy.js
 *
 * Audio elements are created lazily on first play and shared across sprite
 * instances through a bounded module-level cache. Characters ship 10–34 clips
 * each, so eagerly instantiating them per sprite (preference pane previews +
 * the desktop overlay) exhausted the browser's media-player pool and could
 * freeze the tab when switching characters.
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import type { AssistantCharacterId } from "./characters";
import { ASSISTANT_SOUND_MAPS } from "./sounds";

const MAX_CONCURRENT_ASSISTANT_SOUNDS = 2;
const MIN_SOUND_GAP_MS = 80;
/** Upper bound on cached HTMLAudioElements across all characters. */
const MAX_CACHED_ASSISTANT_SOUNDS = 24;

let userHasInteracted = false;
let lastPlayedAt = 0;

const activeAudios = new Set<HTMLAudioElement>();

/** Shared clip cache keyed by `${characterId}:${soundId}`, in LRU order. */
const sharedAudioCache = new Map<string, HTMLAudioElement>();

/** Test-only reset for module-level playback gate state. */
export function resetAssistantSoundStateForTests(): void {
  userHasInteracted = false;
  lastPlayedAt = 0;
  activeAudios.clear();
  sharedAudioCache.clear();
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

/** Detach the media resource so the browser can release its player slot. */
function releaseAudio(audio: HTMLAudioElement): void {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function evictLeastRecentlyUsedAudio(): void {
  for (const [key, audio] of sharedAudioCache) {
    if (activeAudios.has(audio)) continue;
    sharedAudioCache.delete(key);
    releaseAudio(audio);
    return;
  }
}

function getOrCreateAudio(
  characterId: AssistantCharacterId,
  soundId: string
): HTMLAudioElement | undefined {
  const key = `${characterId}:${soundId}`;
  const cached = sharedAudioCache.get(key);
  if (cached) {
    // Refresh recency so hot clips survive eviction.
    sharedAudioCache.delete(key);
    sharedAudioCache.set(key, cached);
    return cached;
  }

  const src = ASSISTANT_SOUND_MAPS[characterId]?.[soundId];
  if (!src) return undefined;

  if (sharedAudioCache.size >= MAX_CACHED_ASSISTANT_SOUNDS) {
    evictLeastRecentlyUsedAudio();
  }

  const audio = new Audio(src);
  audio.preload = "auto";
  sharedAudioCache.set(key, audio);
  return audio;
}

function trimActiveAudios(): void {
  if (activeAudios.size < MAX_CONCURRENT_ASSISTANT_SOUNDS) return;

  const oldest = activeAudios.values().next().value as
    | HTMLAudioElement
    | undefined;
  if (!oldest) return;

  oldest.pause();
  oldest.currentTime = 0;
  activeAudios.delete(oldest);
}

function trackAudio(audio: HTMLAudioElement): void {
  const cleanup = () => {
    activeAudios.delete(audio);
    audio.removeEventListener("ended", cleanup);
    audio.removeEventListener("pause", cleanup);
  };
  audio.addEventListener("ended", cleanup);
  audio.addEventListener("pause", cleanup);
  activeAudios.add(audio);
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

    const audio = getOrCreateAudio(this.characterId, soundId);
    if (!audio) return;

    trimActiveAudios();

    audio.volume = getAssistantSoundVolume();
    audio.currentTime = 0;
    trackAudio(audio);

    void audio.play().catch(() => {
      activeAudios.delete(audio);
    });
    lastPlayedAt = now;
  }

  stopAll(): void {
    for (const audio of activeAudios) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeAudios.clear();
  }

  dispose(): void {
    this.stopAll();
    this.characterId = null;
  }
}

/** Test-only view of how many clips are currently cached. */
export function getCachedAssistantSoundCountForTests(): number {
  return sharedAudioCache.size;
}

export function resolveAssistantSoundSrc(
  characterId: AssistantCharacterId,
  soundId: string
): string | undefined {
  return ASSISTANT_SOUND_MAPS[characterId]?.[soundId];
}
