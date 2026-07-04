/**
 * Microsoft Agent animation sound playback (clippy.js MP3 data URLs).
 * Source: https://github.com/clippyjs/clippy.js
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import type { AssistantCharacterId } from "./characters";
import { ASSISTANT_SOUND_MAPS } from "./sounds";

const MAX_CONCURRENT_ASSISTANT_SOUNDS = 2;
const MIN_SOUND_GAP_MS = 80;

let userHasInteracted = false;
let lastPlayedAt = 0;

/** Test-only reset for module-level playback gate state. */
export function resetAssistantSoundStateForTests(): void {
  userHasInteracted = false;
  lastPlayedAt = 0;
}

const activeAudios = new Set<HTMLAudioElement>();

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
  private audioById = new Map<string, HTMLAudioElement>();

  loadCharacter(characterId: AssistantCharacterId): void {
    if (this.characterId === characterId) return;
    this.dispose();
    this.characterId = characterId;

    const soundMap = ASSISTANT_SOUND_MAPS[characterId];
    if (!soundMap) return;
    for (const [soundId, src] of Object.entries(soundMap)) {
      const audio = new Audio(src);
      audio.preload = "auto";
      this.audioById.set(soundId, audio);
    }
  }

  play(soundId: string | undefined): void {
    if (!soundId || !this.characterId) return;
    if (!canPlayAssistantSounds()) return;

    const now = Date.now();
    if (now - lastPlayedAt < MIN_SOUND_GAP_MS) return;

    const audio = this.audioById.get(soundId);
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
    for (const audio of this.audioById.values()) {
      audio.pause();
      audio.src = "";
    }
    this.audioById.clear();
    this.characterId = null;
  }
}

export function resolveAssistantSoundSrc(
  characterId: AssistantCharacterId,
  soundId: string
): string | undefined {
  return ASSISTANT_SOUND_MAPS[characterId]?.[soundId];
}
