/**
 * Shared client-side tool-call dispatch.
 *
 * Both the Chats app (useAiChat) and the floating desktop assistant
 * (useAssistantChat) stream tool calls from /api/chat. This module executes
 * client-side tools and reports outputs back through `addToolOutput`, so all
 * AI surfaces share one implementation.
 */

import i18n from "@/lib/i18n";
import { aiChatLog as log } from "../logging";
import { type SaveFileHandler } from "../utils/chatFilePersistence";
import {
  handleLaunchApp,
  handleCloseApp,
  handleSettings,
  handleMediaControl,
  handleStickiesControl,
  handleInfiniteMacControl,
  handleCalendarControl,
  handleContactsControl,
  type ToolContext,
  type ToolOutputPayload,
  type LaunchAppInput,
  type CloseAppInput,
  type SettingsInput,
  type MediaControlInput,
  type StickiesControlInput,
  type InfiniteMacControlInput,
  type CalendarControlInput,
  type ContactsControlInput,
} from "./index";
import {
  handleVfsList,
  handleVfsOpen,
  handleVfsRead,
  handleVfsWrite,
  handleVfsEdit,
  type VfsToolContext,
  type VfsListInput,
  type VfsPathInput,
  type VfsWriteInput,
  type VfsEditInput,
} from "./vfsHandlers";
import { SERVER_EXECUTED_TOOL_NAME_SET } from "@/shared/tools/serverExecuted";
import { APPROVAL_GATED_TOOL_NAME_SET } from "@/shared/tools/approvalGated";
import {
  createToolOpenResultTracker,
  type DispatchToolCallResult,
} from "./toolOpenResult";

export { trackNewTextEditInstance } from "./vfsHandlers";

export interface SharedToolCall {
  toolName: string;
  toolCallId: string;
  input: unknown;
}

export interface DispatchToolCallContext {
  addToolOutput: (payload: ToolOutputPayload) => void;
  launchApp: ToolContext["launchApp"];
  saveFile: SaveFileHandler;
  onOpenAttempt?: (instanceId: string) => void;
}

/**
 * Execute one client-side tool call and report its output back through
 * `addToolOutput`. Server-executed tools are ignored (their results arrive
 * in the stream).
 */
export async function dispatchToolCall(
  toolCall: SharedToolCall,
  ctx: DispatchToolCallContext
): Promise<DispatchToolCallResult> {
  const openResultTracker = createToolOpenResultTracker({
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    context: {
      addToolOutput: ctx.addToolOutput,
      launchApp: ctx.launchApp,
    },
    onOpenAttempt: ctx.onOpenAttempt,
  });
  const { addToolOutput, launchApp } = openResultTracker.context;
  const { saveFile } = ctx;

  // Short delay to allow the UI to render the "call" state
  await new Promise<void>((resolve) => setTimeout(resolve, 120));

  log.debug("Executing client-side tool", {
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
  });

  // Create tool context for extracted handlers
  const toolContext: ToolContext = {
    launchApp,
    addToolOutput,
  };

  const vfsContext: VfsToolContext = {
    ...toolContext,
    saveFile,
    recordOpenedInstance: openResultTracker.recordOpenedInstance,
  };

  try {
    let result: string = "Tool executed successfully";

    if (SERVER_EXECUTED_TOOL_NAME_SET.has(toolCall.toolName)) {
      log.debug("Server-side tool call observed", {
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
      return openResultTracker.getResult();
    }

    if (APPROVAL_GATED_TOOL_NAME_SET.has(toolCall.toolName)) {
      // Approval-gated tools execute from the in-chat permission card after
      // the user approves (see toolApprovals.ts) — never from onToolCall.
      log.debug("Approval-gated tool call observed; awaiting user decision", {
        toolName: toolCall.toolName,
      });
      return openResultTracker.getResult();
    }

    switch (toolCall.toolName) {
      case "aquarium": {
        // Visual renders in the message bubble; nothing to do here.
        result = "Aquarium displayed";
        break;
      }
      case "launchApp": {
        result = handleLaunchApp(
          toolCall.input as LaunchAppInput,
          toolCall.toolCallId,
          toolContext
        );
        break;
      }
      case "closeApp": {
        result = handleCloseApp(
          toolCall.input as CloseAppInput,
          toolCall.toolCallId,
          toolContext
        );
        break;
      }
      case "mediaControl": {
        await handleMediaControl(
          toolCall.input as MediaControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "list": {
        await handleVfsList(
          toolCall.input as VfsListInput,
          toolCall.toolName,
          toolCall.toolCallId,
          vfsContext
        );
        result = "";
        break;
      }
      case "open": {
        await handleVfsOpen(
          toolCall.input as VfsPathInput,
          toolCall.toolName,
          toolCall.toolCallId,
          vfsContext
        );
        result = "";
        break;
      }
      case "read": {
        await handleVfsRead(
          toolCall.input as VfsPathInput,
          toolCall.toolName,
          toolCall.toolCallId,
          vfsContext
        );
        result = "";
        break;
      }
      case "write": {
        await handleVfsWrite(
          toolCall.input as VfsWriteInput,
          toolCall.toolName,
          toolCall.toolCallId,
          vfsContext
        );
        result = "";
        break;
      }
      case "edit": {
        await handleVfsEdit(
          toolCall.input as VfsEditInput,
          toolCall.toolName,
          toolCall.toolCallId,
          vfsContext
        );
        result = "";
        break;
      }
      case "settings": {
        await handleSettings(
          toolCall.input as SettingsInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "stickiesControl": {
        handleStickiesControl(
          toolCall.input as StickiesControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "infiniteMacControl": {
        await handleInfiniteMacControl(
          toolCall.input as InfiniteMacControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "calendarControl": {
        handleCalendarControl(
          toolCall.input as CalendarControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "contactsControl": {
        handleContactsControl(
          toolCall.input as ContactsControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      default:
        console.warn("Unhandled tool call:", toolCall.toolName);
        // Report as error rather than false success to avoid masking
        // missing handler wiring or new server-side tools
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.unhandledTool", {
            toolName: toolCall.toolName,
          }),
        });
        result = "";
        break;
    }

    if (result) {
      log.debug("Adding client-side tool result", {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        resultLength: result.length,
      });
      addToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: result,
      });
    }
    return openResultTracker.getResult();
  } catch (err) {
    console.error("Error executing tool call:", err);
    addToolOutput({
      tool: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      state: "output-error",
      errorText:
        err instanceof Error
          ? err.message
          : i18n.t("apps.chats.toolCalls.unknownError"),
    });
    return openResultTracker.getResult();
  }
}
