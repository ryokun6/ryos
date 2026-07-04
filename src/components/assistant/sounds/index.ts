import { CLIPPY_SOUNDS } from "./clippy";
import { LINKS_SOUNDS } from "./links";
import { F1_SOUNDS } from "./f1";
import { GENIUS_SOUNDS } from "./genius";
import { ROCKY_SOUNDS } from "./rocky";
import { MERLIN_SOUNDS } from "./merlin";
import { GENIE_SOUNDS } from "./genie";
import { PEEDY_SOUNDS } from "./peedy";
import { ROVER_SOUNDS } from "./rover";
import type { AssistantCharacterId } from "../characters";

/** MP3 clips from clippy.js — https://github.com/clippyjs/clippy.js */
export const ASSISTANT_SOUND_MAPS: Record<
  AssistantCharacterId,
  Record<string, string>
> = {
  clippy: CLIPPY_SOUNDS,
  links: LINKS_SOUNDS,
  f1: F1_SOUNDS,
  genius: GENIUS_SOUNDS,
  rocky: ROCKY_SOUNDS,
  merlin: MERLIN_SOUNDS,
  genie: GENIE_SOUNDS,
  peedy: PEEDY_SOUNDS,
  rover: ROVER_SOUNDS,
};
