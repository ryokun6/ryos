/**
 * Approval plumbing for approval-gated client tools (AI SDK tool-approval
 * flow: agent `toolApproval: { tool: 'user-approval' }` → `approval-requested`
 * tool part → user decision → `addToolApprovalResponse` / client execution).
 *
 * Multiple chat surfaces (the Chats app's shared chat, the desktop
 * assistant's bubble chat) can host approval-gated tool calls, so each
 * surface registers itself here and the permission card routes the user's
 * decision to whichever surface owns the tool call.
 *
 * Decision handling:
 * - Deny  → `addToolApprovalResponse({ approved: false })`. The SDK records
 *   the denial and (via `sendAutomaticallyWhenApprovalsSettled`) sends the
 *   turn back; the server then streams `tool-output-denied` so the model is
 *   told the request was declined.
 * - Allow → `addToolApprovalResponse({ approved: true })`, then run the
 *   client handler and report via `addToolOutput`. Recording the approval
 *   first keeps the part schema-valid (`output-available` parts with an
 *   `approval` require `approved: true` in `validateUIMessages`, which the
 *   API route runs on every request). `sendAutomaticallyWhenApprovalsSettled`
 *   holds the auto-send until the handler's output lands, because the server
 *   cannot execute client tools itself.
 */

import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { APPROVAL_GATED_TOOL_NAME_SET } from "@/shared/tools/approvalGated";
import { aiChatLog as log } from "../logging";
import { summarizeChatMessage } from "./chatDebug";
import {
  handleGetPreciseLocation,
  type GetPreciseLocationInput,
} from "./preciseLocationHandler";
import type { ToolOutputPayload } from "./types";

export interface ToolApprovalSurface {
  getMessages: () => UIMessage[];
  addToolApprovalResponse: (args: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => PromiseLike<void> | void;
  addToolOutput: (payload: ToolOutputPayload) => PromiseLike<void> | void;
}

const surfaces = new Set<ToolApprovalSurface>();

export function registerToolApprovalSurface(
  surface: ToolApprovalSurface
): () => void {
  surfaces.add(surface);
  return () => {
    surfaces.delete(surface);
  };
}

interface ApprovalToolPart {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
}

function approvalPartToolName(part: ApprovalToolPart): string {
  if (part.type === "dynamic-tool") return part.toolName ?? "";
  return part.type.startsWith("tool-") ? part.type.slice(5) : part.type;
}

/**
 * `sendAutomaticallyWhen` predicate for chats hosting approval-gated tools:
 * auto-send when all tool calls completed (the standard behavior) OR when
 * the last step's approvals have all been responded to. One carve-out: an
 * APPROVED approval-gated tool is client-executed, so the send must wait
 * for its handler to report via `addToolOutput` (the part then reaches
 * `output-available` and the standard predicate fires). Denials need no
 * output — the server converts the denial into an execution-denied result.
 */
export function sendAutomaticallyWhenApprovalsSettled(options: {
  messages: UIMessage[];
}): boolean {
  const decision = decideAutoSend(options);
  const message = options.messages[options.messages.length - 1];
  const hasApprovalGatedPart =
    message?.role === "assistant" &&
    Array.isArray(message.parts) &&
    (message.parts as ApprovalToolPart[]).some((part) =>
      APPROVAL_GATED_TOOL_NAME_SET.has(approvalPartToolName(part))
    );
  // Only trace turns that involve an approval-gated tool; this predicate
  // runs after every message mutation and would be noisy otherwise.
  if (hasApprovalGatedPart) {
    log.debug(`Auto-send decision: ${decision.send} (${decision.reason})`, {
      lastMessageSummary: summarizeChatMessage(message),
    });
  }
  return decision.send;
}

function decideAutoSend(options: { messages: UIMessage[] }): {
  send: boolean;
  reason: string;
} {
  if (lastAssistantMessageIsCompleteWithToolCalls(options)) {
    return { send: true, reason: "all tool calls complete" };
  }
  if (!lastAssistantMessageIsCompleteWithApprovalResponses(options)) {
    return { send: false, reason: "approvals or tool outputs still pending" };
  }
  const message = options.messages[options.messages.length - 1];
  if (!message || !Array.isArray(message.parts)) {
    return { send: false, reason: "no last message parts" };
  }
  const awaitingClientExecution = (message.parts as ApprovalToolPart[]).some(
    (part) =>
      part.state === "approval-responded" &&
      part.approval?.approved === true &&
      APPROVAL_GATED_TOOL_NAME_SET.has(approvalPartToolName(part))
  );
  return awaitingClientExecution
    ? { send: false, reason: "approved client tool awaiting output" }
    : { send: true, reason: "approvals settled" };
}

/**
 * True while the last assistant message has approval-gated activity that the
 * user/client hasn't finished settling: a permission card awaiting the user's
 * decision, or an approved client tool whose handler hasn't reported output
 * yet. Server-conversation hydration must NOT overwrite the live messages
 * during this window — the server's canonical snapshot still has the part in
 * `approval-requested` (approval without `approved`), and stomping the local
 * state would make the eventual `addToolOutput` produce an `output-available`
 * part whose approval lacks `approved: true`, which fails
 * `validateUIMessages` on the next request ("invalid messages").
 */
export function hasUnsettledApprovalGatedActivity(
  messages: readonly UIMessage[]
): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) {
    return false;
  }
  return (last.parts as ApprovalToolPart[]).some((part) => {
    if (!APPROVAL_GATED_TOOL_NAME_SET.has(approvalPartToolName(part))) {
      return false;
    }
    if (part.state === "approval-requested") return true;
    return (
      part.state === "approval-responded" && part.approval?.approved === true
    );
  });
}

/**
 * True when the surface's LAST message still has this tool call pending
 * approval. `addToolApprovalResponse` / `addToolOutput` only mutate the last
 * message, so older (stale) approval cards are not actionable — the server
 * resolves them as implicitly declined on the next turn.
 */
function surfaceHasPendingApproval(
  surface: ToolApprovalSurface,
  toolCallId: string
): boolean {
  const messages = surface.getMessages();
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) {
    return false;
  }
  return (last.parts as ApprovalToolPart[]).some(
    (part) =>
      typeof part.type === "string" &&
      (part.type.startsWith("tool-") || part.type === "dynamic-tool") &&
      part.toolCallId === toolCallId &&
      part.state === "approval-requested"
  );
}

export interface RespondToToolApprovalArgs {
  toolName: string;
  toolCallId: string;
  approvalId: string;
  input: unknown;
  approved: boolean;
}

/**
 * Handle the user's Allow / Don't Allow decision for an approval-gated tool
 * call. Returns false when no registered chat surface owns the tool call
 * (e.g. the message is from an older, unmounted conversation).
 */
export async function respondToToolApproval({
  toolName,
  toolCallId,
  approvalId,
  input,
  approved,
}: RespondToToolApprovalArgs): Promise<boolean> {
  log.debug("Tool approval decision received", {
    toolName,
    toolCallId,
    approvalId,
    approved,
    surfaceCount: surfaces.size,
  });
  const surface = [...surfaces].find((candidate) =>
    surfaceHasPendingApproval(candidate, toolCallId)
  );
  if (!surface) {
    log.warn("No chat surface has this tool call pending approval", {
      toolName,
      toolCallId,
      approvalId,
      surfaces: [...surfaces].map((candidate) => {
        const last = candidate.getMessages().at(-1);
        return last ? summarizeChatMessage(last) : "(empty)";
      }),
    });
    return false;
  }

  if (!approved) {
    log.debug("User denied tool approval; recording denial", {
      toolName,
      toolCallId,
      approvalId,
    });
    await surface.addToolApprovalResponse({
      id: approvalId,
      approved: false,
      reason: "User declined the permission request.",
    });
    log.debug("Denial recorded", {
      toolCallId,
      lastMessageSummary: summarizeChatMessage(surface.getMessages().at(-1)),
    });
    return true;
  }

  log.debug("User approved tool call; recording approval", {
    toolName,
    toolCallId,
    approvalId,
  });
  // Record the approval first (keeps the part schema-valid), then execute the
  // client handler. sendAutomaticallyWhenApprovalsSettled holds the auto-send
  // until the handler reports its output via addToolOutput.
  await surface.addToolApprovalResponse({ id: approvalId, approved: true });
  log.debug("Approval recorded; running client handler", {
    toolCallId,
    lastMessageSummary: summarizeChatMessage(surface.getMessages().at(-1)),
  });
  try {
    switch (toolName) {
      case "getPreciseLocation":
        await handleGetPreciseLocation(
          (input ?? {}) as GetPreciseLocationInput,
          toolCallId,
          { addToolOutput: surface.addToolOutput }
        );
        break;
      default:
        await surface.addToolOutput({
          tool: toolName,
          toolCallId,
          state: "output-error",
          errorText: `No client handler for approval-gated tool "${toolName}".`,
        });
        break;
    }
  } catch (error) {
    log.warn("Approval-gated client handler threw", {
      toolName,
      toolCallId,
      error,
    });
    await surface.addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText:
        error instanceof Error ? error.message : "Tool execution failed",
    });
  }
  log.debug("Client handler finished", {
    toolCallId,
    lastMessageSummary: summarizeChatMessage(surface.getMessages().at(-1)),
  });
  return true;
}
