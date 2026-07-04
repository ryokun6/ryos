/**
 * Floating desktop assistant character registry.
 *
 * All characters are the historically accurate Microsoft Agent / Office
 * assistants (sprite sheets + animation data extracted from the original .acs
 * files via the clippy.js project, or converted directly with
 * scripts/convert-acs-character.py).
 */

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

export interface AssistantCharacter {
  id: AssistantCharacterId;
  name: string;
  /** Display size in CSS pixels. */
  width: number;
  height: number;
  /** Sprite sheet + animation data. */
  mapUrl: string;
  agentUrl: string;
}

function spriteCharacter(
  id: AssistantCharacterId,
  name: string,
  width: number,
  height: number
): AssistantCharacter {
  return {
    id,
    name,
    width,
    height,
    mapUrl: `/assets/assistant/${id}/map.png`,
    agentUrl: `/assets/assistant/${id}/agent.json`,
  };
}

export const ASSISTANT_CHARACTERS: AssistantCharacter[] = [
  spriteCharacter("clippy", "Clippy", 124, 93),
  spriteCharacter("links", "Links", 124, 93),
  spriteCharacter("rover", "Rover", 80, 80),
  spriteCharacter("merlin", "Merlin", 128, 128),
  spriteCharacter("genie", "Genie", 128, 128),
  spriteCharacter("peedy", "Peedy", 160, 128),
  spriteCharacter("genius", "Genius", 124, 93),
  spriteCharacter("rocky", "Rocky", 124, 93),
  spriteCharacter("f1", "F1", 124, 93),
  spriteCharacter("officelogo", "Office Logo", 124, 93),
  spriteCharacter("saeko", "Saeko Sensei", 98, 115),
  spriteCharacter("monkeyking", "Monkey King", 124, 93),
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
