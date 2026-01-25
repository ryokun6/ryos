/**
 * Stickies Control Tool Handler
 */

import type { ToolContext } from "./types";
import { useStickiesStore, type StickyColor } from "@/stores/useStickiesStore";
import { useAppStore } from "@/stores/useAppStore";
import i18n from "@/lib/i18n";

export interface StickiesControlInput {
  action: "list" | "create" | "update" | "delete" | "clear";
  id?: string;
  content?: string;
  color?: StickyColor;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

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
  const { action, id, content, color, position, size } = input;
  const store = useStickiesStore.getState();

  try {
    switch (action) {
      case "list": {
        const notes = store.notes;
        if (notes.length === 0) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, output: i18n.t("apps.chats.toolCalls.stickies.noStickies") });
          return;
        }
        // Return full data for model, UI will show simplified message
        const notesData = notes.map((n) => ({
          id: n.id,
          color: n.color,
          content: n.content,
          position: n.position,
          size: n.size,
        }));
        context.addToolResult({ 
          tool: "stickiesControl", 
          toolCallId, 
          output: `${i18n.t("apps.chats.toolCalls.stickies.foundStickies", { count: notes.length })}:\n${JSON.stringify(notesData, null, 2)}` 
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
        const translatedColor = i18n.t(`common.colors.${colorKey}`);
        context.addToolResult({ 
          tool: "stickiesControl", 
          toolCallId, 
          output: i18n.t("apps.chats.toolCalls.stickies.createdWithColor", { color: translatedColor }) 
        });
        break;
      }

      case "update": {
        if (!id) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: i18n.t("apps.chats.toolCalls.stickies.missingId") });
          return;
        }
        if (!store.notes.find((n) => n.id === id)) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: i18n.t("apps.chats.toolCalls.stickies.notFound", { id }) });
          return;
        }
        const updates: Record<string, unknown> = {};
        if (content !== undefined) updates.content = content;
        if (color !== undefined) updates.color = color;
        if (position !== undefined) updates.position = position;
        if (size !== undefined) updates.size = size;
        if (Object.keys(updates).length === 0) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: i18n.t("apps.chats.toolCalls.stickies.noUpdates") });
          return;
        }
        store.updateNote(id, updates);
        context.addToolResult({ tool: "stickiesControl", toolCallId, output: i18n.t("apps.chats.toolCalls.stickies.updated") });
        break;
      }

      case "delete": {
        if (!id) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: i18n.t("apps.chats.toolCalls.stickies.missingId") });
          return;
        }
        if (!store.notes.find((n) => n.id === id)) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: i18n.t("apps.chats.toolCalls.stickies.notFound", { id }) });
          return;
        }
        store.deleteNote(id);
        context.addToolResult({ tool: "stickiesControl", toolCallId, output: i18n.t("apps.chats.toolCalls.stickies.deleted") });
        break;
      }

      case "clear": {
        const count = store.notes.length;
        if (count === 0) {
          context.addToolResult({ tool: "stickiesControl", toolCallId, output: i18n.t("apps.chats.toolCalls.stickies.nothingToClear") });
          return;
        }
        store.clearAllNotes();
        context.addToolResult({ tool: "stickiesControl", toolCallId, output: i18n.t("apps.chats.toolCalls.stickies.cleared", { count }) });
        break;
      }

      default:
        context.addToolResult({ tool: "stickiesControl", toolCallId, state: "output-error", errorText: i18n.t("apps.chats.toolCalls.stickies.invalidAction", { action }) });
    }
  } catch (error) {
    console.error("[stickiesControl] Error:", error);
    context.addToolResult({
      tool: "stickiesControl",
      toolCallId,
      state: "output-error",
      errorText: error instanceof Error ? error.message : i18n.t("apps.chats.toolCalls.unknownError"),
    });
  }
};
