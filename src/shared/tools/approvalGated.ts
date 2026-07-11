/**
 * Client-executed tools that require explicit user approval before running.
 *
 * The server registers these on `ToolLoopAgent` via AI SDK 7 `toolApproval`
 * (`user-approval`), so the SDK emits a `tool-approval-request` instead of
 * expecting immediate execution. The client-side dispatcher (`dispatchToolCall`)
 * must NOT run them from `onToolCall`; execution happens from the approval UI
 * after the user approves (see `src/apps/chats/tools/toolApprovals.ts`).
 */

export const APPROVAL_GATED_TOOL_NAMES = ["getPreciseLocation"] as const;

export type ApprovalGatedToolName = (typeof APPROVAL_GATED_TOOL_NAMES)[number];

export const APPROVAL_GATED_TOOL_NAME_SET = new Set<string>(
  APPROVAL_GATED_TOOL_NAMES
);
