import {
  Fire,
  HandsClapping,
  Heart,
  MusicNote,
  Smiley,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

/** Shared icon + color styling for Karaoke listen reactions and KTV fullscreen ambience */
export const REACTION_MAP: Record<string, { icon: Icon; color: string }> = {
  smile: { icon: Smiley, color: "text-yellow-400/90" },
  fire: { icon: Fire, color: "text-orange-500/90" },
  clap: { icon: HandsClapping, color: "text-amber-400/90" },
  heart: { icon: Heart, color: "text-red-500/85" },
  music: { icon: MusicNote, color: "text-purple-400/85" },
};

export const REACTION_LIFETIME_MS = 2500;

/** Random motion parameters applied per floating reaction burst */
export interface ReactionFloaterPhysics {
  xOffset: number;
  scale: number;
  floatHeight: number;
  wobble: number;
  duration: number;
}

export function generateSessionReactionPhysics(): ReactionFloaterPhysics {
  return {
    xOffset: (Math.random() - 0.5) * 120,
    scale: 0.8 + Math.random() * 0.6,
    floatHeight: 120 + Math.random() * 80,
    wobble: (Math.random() - 0.5) * 30,
    duration: 1.8 + Math.random() * 0.8,
  };
}

/** Tighter floats, biased away from lyric focal center — fullscreen solo KTV ambience */
export function generateAmbientReactionPhysics(): ReactionFloaterPhysics {
  const side = Math.random() < 0.5 ? -1 : 1;
  const xOffset = side * (70 + Math.random() * 120) + (Math.random() - 0.5) * 52;
  return {
    xOffset,
    scale: 0.7 + Math.random() * 0.42,
    floatHeight: 56 + Math.random() * 86,
    wobble: (Math.random() - 0.5) * 20,
    duration: 1.2 + Math.random() * 0.55,
  };
}

export const KTV_AMBIENT_REACTION_IDS = ["clap", "heart", "smile", "music", "fire"] as const;

export function randomAmbientReactionId(): string {
  const pool = KTV_AMBIENT_REACTION_IDS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
