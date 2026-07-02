/**
 * Stickies Control Tool Handler
 */

import type { ToolContext } from "./types";
import {
  DEFAULT_NOTE_SIZE,
  getNextPosition,
  useStickiesStore,
  type StickyColor,
  type StickyNote,
} from "@/stores/useStickiesStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useAppStore } from "@/stores/useAppStore";
import i18n from "@/lib/i18n";
import { createShortIdMap, resolveId, type ShortIdMap } from "./helpers";
import {
  applyStickiesToolAction,
  serializeStickyToolRecord,
  STICKY_COLORS,
  type StickiesControlInput,
  type StickiesControlOutput,
  type StickiesToolError,
} from "@/shared/tools/stickies";
import type { StickiesNoteDto } from "@/shared/domains/stickies";

export type { StickiesControlInput } from "@/shared/tools/stickies";

/**
 * Module-level storage for short ID mapping.
 * Created during 'list' action, used by 'update'/'delete' actions.
 */
let stickyIdMap: ShortIdMap | undefined;

/**
 * Ensure the Stickies app is open
 */
const ensureStickiesAppOpen = (context: ToolContext): void => {
  const appStore = useAppStore.getState();
  const stickiesInstances = appStore.getInstancesByAppId("stickies");
  if (!stickiesInstances.some((inst) => inst.isOpen)) {
    context.launchApp("stickies");
  }
};

const isStickyColor = (color: string): color is StickyColor =>
  STICKY_COLORS.some((value) => value === color);

const toStickyNote = (note: StickiesNoteDto): StickyNote => ({
  ...note,
  color: isStickyColor(note.color) ? note.color : "yellow",
});

const generateStickyId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const getErrorText = (
  error: StickiesToolError,
  input: StickiesControlInput
): string => {
  switch (error) {
    case "missing_id":
      return i18n.t("apps.chats.toolCalls.stickies.missingId");
    case "not_found":
      return i18n.t("apps.chats.toolCalls.stickies.notFound", {
        id: input.id ?? "",
      });
    case "no_updates":
      return i18n.t("apps.chats.toolCalls.stickies.noUpdates");
    case "unknown_action":
      return i18n.t("apps.chats.toolCalls.stickies.invalidAction", {
        action: input.action,
      });
  }
};

const buildOutput = (
  result: Exclude<ReturnType<typeof applyStickiesToolAction>, { ok: false }>
): StickiesControlOutput => {
  switch (result.kind) {
    case "list": {
      if (result.notes.length === 0) {
        stickyIdMap = undefined;
        return {
          success: true,
          message: i18n.t("apps.chats.toolCalls.stickies.noStickies"),
          notes: [],
        };
      }

      stickyIdMap = createShortIdMap(
        result.notes.map((note) => note.id),
        "s"
      );
      return {
        success: true,
        message: i18n.t("apps.chats.toolCalls.stickies.foundStickies", {
          count: result.notes.length,
        }),
        notes: result.notes.map((note) =>
          serializeStickyToolRecord(note, stickyIdMap)
        ),
      };
    }

    case "create": {
      const translatedColor = i18n.t(`common.colors.${result.note.color}`);
      return {
        success: true,
        message: i18n.t("apps.chats.toolCalls.stickies.createdWithColor", {
          color: translatedColor,
        }),
        note: serializeStickyToolRecord(result.note, stickyIdMap),
      };
    }

    case "update":
      return {
        success: true,
        message: i18n.t("apps.chats.toolCalls.stickies.updated"),
        note: serializeStickyToolRecord(result.note, stickyIdMap),
      };

    case "delete":
      return {
        success: true,
        message: i18n.t("apps.chats.toolCalls.stickies.deleted"),
        note: serializeStickyToolRecord(result.note, stickyIdMap),
      };

    case "clear":
      if (result.count === 0) {
        return {
          success: true,
          message: i18n.t("apps.chats.toolCalls.stickies.nothingToClear"),
        };
      }
      stickyIdMap = undefined;
      return {
        success: true,
        message: i18n.t("apps.chats.toolCalls.stickies.cleared", {
          count: result.count,
        }),
      };
  }
};

/**
 * Handle stickies control tool call
 */
export const handleStickiesControl = (
  input: StickiesControlInput,
  toolCallId: string,
  context: ToolContext
): void => {
  const store = useStickiesStore.getState();

  try {
    if (input.action === "create") {
      ensureStickiesAppOpen(context);
    }

    const resolvedId = input.id ? resolveId(input.id, stickyIdMap) : undefined;
    const deletedAt = new Date().toISOString();
    const result = applyStickiesToolAction(
      { notes: store.notes, deletedNoteIds: {} },
      input,
      {
        resolvedId,
        generateId: generateStickyId,
        now: () => Date.now(),
        deletedAt: () => deletedAt,
        defaultPosition: () => getNextPosition(store.notes),
        defaultSize: () => DEFAULT_NOTE_SIZE,
      }
    );

    if (!result.ok) {
      context.addToolOutput({
        tool: "stickiesControl",
        toolCallId,
        state: "output-error",
        errorText: getErrorText(result.error, input),
      });
      return;
    }

    if (result.kind !== "list") {
      store.replaceNotes(result.state.notes.map(toStickyNote));
    }
    if (result.kind === "delete") {
      useCloudSyncStore
        .getState()
        .markDeletedKeys("stickyNoteIds", [result.note.id], deletedAt);
    } else if (result.kind === "clear" && result.count > 0) {
      useCloudSyncStore
        .getState()
        .markDeletedKeys(
          "stickyNoteIds",
          store.notes.map((note) => note.id),
          deletedAt
        );
    }

    context.addToolOutput({
      tool: "stickiesControl",
      toolCallId,
      output: buildOutput(result),
    });
  } catch (error) {
    console.error("[stickiesControl] Error:", error);
    context.addToolOutput({
      tool: "stickiesControl",
      toolCallId,
      state: "output-error",
      errorText: error instanceof Error ? error.message : i18n.t("apps.chats.toolCalls.unknownError"),
    });
  }
};
