/**
 * Floating desktop assistant character registry.
 *
 * All characters are the historically accurate Microsoft Agent / Office
 * assistants (sprite sheets + animation data extracted from the original .acs
 * files via the clippy.js project, or converted directly with
 * scripts/convert-acs-character.py).
 */

import i18n from "@/lib/i18n";

export type AssistantCharacterId =
  | "clippy"
  | "links"
  | "rover"
  | "merlin"
  | "genie"
  | "peedy"
  | "genius"
  | "rocky"
  | "f1"
  | "officelogo"
  | "saeko"
  | "monkeyking";

/**
 * Speech-bubble accent for a character. Fills stay light pastels so the
 * bubble's black text keeps classic-tooltip readability; borders are the same
 * hue pulled near-black so they read as the original 1px outline with a tint.
 */
export interface AssistantCharacterAccent {
  /** Bubble + tail fill. */
  bubbleBg: string;
  /** Bubble + tail 1px outline. */
  bubbleBorder: string;
}

export interface AssistantCharacter {
  id: AssistantCharacterId;
  /** Canonical English name (fallback); use getAssistantCharacterName / t(nameKey) for display. */
  name: string;
  /** Translation key for the localized character name. */
  nameKey: string;
  /** Display size in CSS pixels. */
  width: number;
  height: number;
  /** Sprite sheet + animation data. */
  mapUrl: string;
  agentUrl: string;
  /** Per-character speech-bubble colors (derived from the sprite palette). */
  accent: AssistantCharacterAccent;
}

function spriteCharacter(
  id: AssistantCharacterId,
  name: string,
  width: number,
  height: number,
  accent: AssistantCharacterAccent
): AssistantCharacter {
  return {
    id,
    name,
    nameKey: `common.assistant.characters.${id}`,
    width,
    height,
    mapUrl: `/assets/assistant/${id}/map.png`,
    agentUrl: `/assets/assistant/${id}/agent.json`,
    accent,
  };
}

// Accent hues are sampled from each character's sprite sheet (dominant
// saturated color), then normalized to a light pastel fill + near-black
// tinted outline. Clippy keeps the classic MS Agent balloon yellow.
export const ASSISTANT_CHARACTERS: AssistantCharacter[] = [
  spriteCharacter("clippy", "Clippy", 124, 93, {
    bubbleBg: "#FFFFC8",
    bubbleBorder: "#3F3E18",
  }),
  spriteCharacter("links", "Links", 124, 93, {
    bubbleBg: "#FCE6BF",
    bubbleBorder: "#413116",
  }),
  spriteCharacter("rover", "Rover", 80, 80, {
    bubbleBg: "#FFECB8",
    bubbleBorder: "#433614",
  }),
  spriteCharacter("merlin", "Merlin", 128, 128, {
    bubbleBg: "#D3E0FD",
    bubbleBorder: "#18243F",
  }),
  spriteCharacter("genie", "Genie", 128, 128, {
    bubbleBg: "#C3E5FD",
    bubbleBorder: "#162F41",
  }),
  spriteCharacter("peedy", "Peedy", 160, 128, {
    bubbleBg: "#CAF6C6",
    bubbleBorder: "#1D3D1A",
  }),
  spriteCharacter("genius", "Genius", 124, 93, {
    bubbleBg: "#DEE6ED",
    bubbleBorder: "#212B36",
  }),
  spriteCharacter("rocky", "Rocky", 124, 93, {
    bubbleBg: "#F5EEC2",
    bubbleBorder: "#3F3A18",
  }),
  spriteCharacter("f1", "F1", 124, 93, {
    bubbleBg: "#FDD6CE",
    bubbleBorder: "#411D16",
  }),
  spriteCharacter("officelogo", "Office Logo", 124, 93, {
    bubbleBg: "#D9DCFD",
    bubbleBorder: "#181B3F",
  }),
  spriteCharacter("saeko", "Saeko Sensei", 98, 115, {
    bubbleBg: "#FDD9C9",
    bubbleBorder: "#412316",
  }),
  spriteCharacter("monkeyking", "Monkey King", 124, 93, {
    bubbleBg: "#FBDEC1",
    bubbleBorder: "#412B16",
  }),
];

export const DEFAULT_ASSISTANT_CHARACTER_ID: AssistantCharacterId = "rover";

export function getAssistantCharacter(
  id: string | null | undefined
): AssistantCharacter {
  return (
    ASSISTANT_CHARACTERS.find((character) => character.id === id) ??
    ASSISTANT_CHARACTERS.find(
      (character) => character.id === DEFAULT_ASSISTANT_CHARACTER_ID
    )!
  );
}

/**
 * Localized display name for a character (e.g. Clippy → "Karl Klammer" in
 * German, "Скрепыш" in Russian). Falls back to the English name.
 */
export function getAssistantCharacterName(
  character: AssistantCharacter
): string {
  return i18n.t(character.nameKey, { defaultValue: character.name });
}
