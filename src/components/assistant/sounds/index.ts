import { CLIPPY_SOUNDS } from "./clippy";
import { LINKS_SOUNDS } from "./links";
import { F1_SOUNDS } from "./f1";
import { GENIUS_SOUNDS } from "./genius";
import { ROCKY_SOUNDS } from "./rocky";
import { MERLIN_SOUNDS } from "./merlin";
import { GENIE_SOUNDS } from "./genie";
import { PEEDY_SOUNDS } from "./peedy";
import { ROVER_SOUNDS } from "./rover";
import { OFFICELOGO_SOUNDS } from "./officelogo";
import { SAEKO_SOUNDS } from "./saeko";
import { MONKEYKING_SOUNDS } from "./monkeyking";
import type { AssistantCharacterId } from "../characters";

/** MP3 clips from clippy.js — https://github.com/clippyjs/clippy.js — or converted from the original .acs files. */
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
  officelogo: OFFICELOGO_SOUNDS,
  saeko: SAEKO_SOUNDS,
  monkeyking: MONKEYKING_SOUNDS,
};
