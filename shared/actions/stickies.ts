/**
 * Shared stickies tool action contracts (client handlers + server executors).
 */

export const STICKY_COLORS = [
  "yellow",
  "blue",
  "green",
  "pink",
  "purple",
  "orange",
] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export const STICKIES_ACTIONS = ["list", "create", "update", "delete", "clear"] as const;
export type StickiesAction = (typeof STICKIES_ACTIONS)[number];

export interface StickiesControlInput {
  action: StickiesAction;
  id?: string;
  content?: string;
  color?: StickyColor;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface StickyNoteToolRecord {
  id: string;
  content: string;
  color: StickyColor;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface StickiesControlOutput {
  success: boolean;
  message: string;
  notes?: StickyNoteToolRecord[];
  note?: StickyNoteToolRecord;
}
