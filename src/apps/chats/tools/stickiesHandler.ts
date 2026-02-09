/**
 * Stickies Control Tool Handler
 */

import type { ToolContext } from "./types";
import { useStickiesStore, type StickyColor } from "@/stores/useStickiesStore";
import { useAppStore } from "@/stores/useAppStore";
import {
  createShortIdMap,
  resolveId,
  resolveToolTranslator,
  type ShortIdMap,
} from "./helpers";

export interface StickiesControlInput {
  action: "list" | "create" | "update" | "delete" | "clear";
  id?: string;
  content?: string;
  color?: StickyColor;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

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

/**
 * Handle stickies control tool call
 */
export const handleStickiesControl = (
  input: StickiesControlInput,
  toolCallId: string,
  context: ToolContext
): void => {
  const t = resolveToolTranslator(context);
  const { action, id, content, color, position, size } = input;
  const store = useStickiesStore.getState();

  try {
    switch (action) {
      case "list": {
        const notes = store.notes;
        if (notes.length === 0) {
          stickyIdMap = undefined;
          context.addToolResult({ tool: "stickiesControl", toolCallId, output: t("apps.chats.toolCalls.stickies.noStickies") });
          return;
        }
        // Create short ID mapping for efficient AI communication
        stickyIdMap = createShortIdMap(notes.map((n) => n.id), "s");
        // Return data with short IDs to reduce token usage
        const notesData = notes.map((n) => ({
          id: stickyIdMap!.fullToShort.get(n.id),
          color: n.color,
          content: n.content,
          position: n.position,
          size: n.size,
        }));
        context.addToolResult({ 
          tool: "stickiesControl", 
          toolCallId, 
          output: `${t("apps.chats.toolCalls.stickies.foundStickies", { count: notes.length })}:\n${JSON.stringify(notesData, null, 2)}` 
        });
        break;
      }

      case "create": {
        ensureStickiesAppOpen(context);
        const noteId = store.addNote(color || "yellow");
        if (content || position || size) {
          store.updateNote(noteId, { 
            ...(content !== undefined && { content }),
            ...(position !== undefined && { position }),
            ...(size !== undefined && { size }),
          });
        }
        const colorKey = color || "yellow";
        const translatedColor = t(`common.colors.${colorKey}`);
        context.addToolResult({ 
          tool: "stickiesControl", 
          toolCallId, 
          output: t("apps.chats.toolCalls.stickies.createdWithColor", { color: translatedColor }) 
        });
        break;
      }

      case "update": {
        if (!id) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: t("apps.chats.toolCalls.stickies.missingId") });
          return;
        }
        // Resolve short ID to full UUID if mapping exists
        const resolvedId = resolveId(id, stickyIdMap);
        if (!store.notes.find((n) => n.id === resolvedId)) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: t("apps.chats.toolCalls.stickies.notFound", { id }) });
          return;
        }
        const updates: Record<string, unknown> = {};
        if (content !== undefined) updates.content = content;
        if (color !== undefined) updates.color = color;
        if (position !== undefined) updates.position = position;
        if (size !== undefined) updates.size = size;
        if (Object.keys(updates).length === 0) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: t("apps.chats.toolCalls.stickies.noUpdates") });
          return;
        }
        store.updateNote(resolvedId, updates);
        context.addToolResult({ tool: "stickiesControl", toolCallId, output: t("apps.chats.toolCalls.stickies.updated") });
        break;
      }

      case "delete": {
        if (!id) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: t("apps.chats.toolCalls.stickies.missingId") });
          return;
        }
        // Resolve short ID to full UUID if mapping exists
        const resolvedId = resolveId(id, stickyIdMap);
        if (!store.notes.find((n) => n.id === resolvedId)) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: t("apps.chats.toolCalls.stickies.notFound", { id }) });
          return;
        }
        store.deleteNote(resolvedId);
        context.addToolResult({ tool: "stickiesControl", toolCallId, output: t("apps.chats.toolCalls.stickies.deleted") });
        break;
      }

      case "clear": {
        const count = store.notes.length;
        if (count === 0) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, output: t("apps.chats.toolCalls.stickies.nothingToClear") });
          return;
        }
        store.clearAllNotes();
        // Clear the ID mapping since all notes are removed
        stickyIdMap = undefined;
        context.addToolResult({ tool: "stickiesControl", toolCallId, output: t("apps.chats.toolCalls.stickies.cleared", { count }) });
        break;
      }

      default:
        context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: t("apps.chats.toolCalls.stickies.invalidAction", { action }) });
    }
  } catch (error) {
    console.error("[stickiesControl] Error:", error);
    context.addToolResult({
      tool: "stickiesControl",
      toolCallId,
      state: "output-error",
      errorText: error instanceof Error ? error.message : t("apps.chats.toolCalls.unknownError"),
    });
  }
};
