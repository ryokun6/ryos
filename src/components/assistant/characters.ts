/**
 * Floating desktop assistant character registry.
 *
 * Sprite characters are the historically accurate Microsoft Agent / Office
 * assistants (sprite sheets + animation data extracted from the original .acs
 * files via the clippy.js project). The image characters are original ryOS
 * creations rendered as single images with CSS idle animations.
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
  | "maccy"
  | "neko"
  | "floppy";

export interface AssistantCharacter {
  id: AssistantCharacterId;
  name: string;
  kind: "sprite" | "image";
  /** Display size in CSS pixels. */
  width: number;
  height: number;
  /** Sprite characters: sheet + animation data. */
  mapUrl?: string;
  agentUrl?: string;
  /** Image characters: single transparent PNG. */
  imageUrl?: string;
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
    kind: "sprite",
    width,
    height,
    mapUrl: `/assets/assistant/${id}/map.png`,
    agentUrl: `/assets/assistant/${id}/agent.json`,
  };
}

export const ASSISTANT_CHARACTERS: AssistantCharacter[] = [
  // Original Microsoft Agent / Office assistant characters.
  spriteCharacter("clippy", "Clippy", 124, 93),
  spriteCharacter("links", "Links", 124, 93),
  spriteCharacter("rover", "Rover", 80, 80),
  spriteCharacter("merlin", "Merlin", 128, 128),
  spriteCharacter("genie", "Genie", 128, 128),
  spriteCharacter("peedy", "Peedy", 160, 128),
  spriteCharacter("genius", "Genius", 124, 93),
  spriteCharacter("rocky", "Rocky", 124, 93),
  spriteCharacter("f1", "F1", 124, 93),
  // Original ryOS characters.
  {
    id: "maccy",
    name: "Maccy",
    kind: "image",
    width: 100,
    height: 94,
    imageUrl: "/assets/assistant/assistant_maccy.png",
  },
  {
    id: "neko",
    name: "Neko",
    kind: "image",
    width: 81,
    height: 94,
    imageUrl: "/assets/assistant/assistant_neko.png",
  },
  {
    id: "floppy",
    name: "Floppy",
    kind: "image",
    width: 104,
    height: 94,
    imageUrl: "/assets/assistant/assistant_floppy.png",
  },
];

export const DEFAULT_ASSISTANT_CHARACTER_ID: AssistantCharacterId = "clippy";

export function getAssistantCharacter(
  id: string | null | undefined
): AssistantCharacter {
  return (
    ASSISTANT_CHARACTERS.find((character) => character.id === id) ??
    ASSISTANT_CHARACTERS[0]
  );
}
