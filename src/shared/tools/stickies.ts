import type {
  StickiesNoteDto,
  StickiesSnapshotData,
} from "../domains/stickies";
import type { ShortIdMap } from "./idMapping";

export const STICKY_COLORS = ["yellow", "blue", "green", "pink", "purple", "orange"] as const;
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

export interface StickyToolRecord {
  id: string;
  content: string;
  color: StickyColor;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface StickiesControlOutput {
  success: boolean;
  message: string;
  notes?: StickyToolRecord[];
  note?: StickyToolRecord;
}

export type StickiesToolError =
  | "missing_id"
  | "not_found"
  | "no_updates"
  | "unknown_action";

export type StickiesToolResult =
  | {
      ok: true;
      state: StickiesSnapshotData;
      kind: "list";
      notes: StickiesNoteDto[];
    }
  | {
      ok: true;
      state: StickiesSnapshotData;
      kind: "create" | "update";
      note: StickiesNoteDto;
    }
  | {
      ok: true;
      state: StickiesSnapshotData;
      kind: "delete";
      note: StickiesNoteDto;
    }
  | {
      ok: true;
      state: StickiesSnapshotData;
      kind: "clear";
      count: number;
    }
  | {
      ok: false;
      error: StickiesToolError;
      id?: string;
    };

export function serializeStickyToolRecord(
  note: StickiesNoteDto,
  idMap?: ShortIdMap
): StickyToolRecord {
  return {
    id: idMap ? idMap.fullToShort.get(note.id) || note.id : note.id,
    content: note.content,
    color: note.color as StickyColor,
    position: note.position,
    size: note.size,
  };
}

export function buildStickyPatch(
  input: StickiesControlInput
): Partial<Pick<StickiesNoteDto, "content" | "color" | "position" | "size">> {
  return {
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
    ...(input.size !== undefined ? { size: input.size } : {}),
  };
}

export function applyStickiesToolAction(
  state: StickiesSnapshotData,
  input: StickiesControlInput,
  deps: {
    resolvedId?: string;
    generateId: () => string;
    now: () => number;
    deletedAt: () => string;
    defaultPosition: () => { x: number; y: number };
    defaultSize: () => { width: number; height: number };
  }
): StickiesToolResult {
  const notes = state.notes || [];

  switch (input.action) {
    case "list":
      return { ok: true, state, kind: "list", notes };

    case "create": {
      const now = deps.now();
      const note: StickiesNoteDto = {
        id: deps.generateId(),
        content: input.content || "",
        color: input.color || "yellow",
        position: input.position || deps.defaultPosition(),
        size: input.size || deps.defaultSize(),
        createdAt: now,
        updatedAt: now,
      };
      return {
        ok: true,
        state: { ...state, notes: [...notes, note] },
        kind: "create",
        note,
      };
    }

    case "update": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const id = deps.resolvedId || input.id;
      const index = notes.findIndex((note) => note.id === id);
      if (index === -1) return { ok: false, error: "not_found", id: input.id };
      const patch = buildStickyPatch(input);
      if (Object.keys(patch).length === 0) {
        return { ok: false, error: "no_updates" };
      }
      const note = { ...notes[index], ...patch, updatedAt: deps.now() };
      const nextNotes = [...notes];
      nextNotes[index] = note;
      return {
        ok: true,
        state: { ...state, notes: nextNotes },
        kind: "update",
        note,
      };
    }

    case "delete": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const id = deps.resolvedId || input.id;
      const note = notes.find((item) => item.id === id);
      if (!note) return { ok: false, error: "not_found", id: input.id };
      return {
        ok: true,
        state: {
          ...state,
          notes: notes.filter((item) => item.id !== id),
          deletedNoteIds: {
            ...(state.deletedNoteIds || {}),
            [id]: deps.deletedAt(),
          },
        },
        kind: "delete",
        note,
      };
    }

    case "clear": {
      return {
        ok: true,
        state: {
          ...state,
          notes: [],
          deletedNoteIds: {
            ...(state.deletedNoteIds || {}),
            ...Object.fromEntries(notes.map((note) => [note.id, deps.deletedAt()])),
          },
        },
        kind: "clear",
        count: notes.length,
      };
    }

    default:
      return { ok: false, error: "unknown_action" };
  }
}
