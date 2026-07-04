/**
 * Floating desktop assistant character registry.
 *
 * "clippy" uses the historically accurate Office 97 sprite sheet + animation
 * data (extracted from the original Microsoft Agent .acs files via the
 * clippy.js project). The other characters are original ryOS creations
 * rendered as single images with CSS idle animations.
 */

export type AssistantCharacterId = "clippy" | "maccy" | "neko" | "floppy";

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

export const ASSISTANT_CHARACTERS: AssistantCharacter[] = [
  {
    id: "clippy",
    name: "Clippy",
    kind: "sprite",
    width: 124,
    height: 93,
    mapUrl: "/assets/assistant/clippy/map.png",
    agentUrl: "/assets/assistant/clippy/agent.json",
  },
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
